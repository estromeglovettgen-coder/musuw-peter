package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
	"gorm.io/gorm"
)

var databaseQueryTool = BaseTool{
	name: ToolDatabaseQuery,
	description: `执行只读 SELECT SQL，从授权数据库读取信息。
系统自动加入当前登录用户 tenant_id 范围与 deleted_at IS NULL 软删除过滤。只允许 knowledge_bases、knowledges、chunks 表。

## 可用表和字段
knowledge_bases：id/name（VARCHAR，ID/名称）、description（TEXT）、tenant_id（INTEGER）、embedding_model_id/summary_model_id/rerank_model_id（VARCHAR，模型 ID）、vlm_config（JSON，含 enabled 和 model_id）、created_at/updated_at/deleted_at（TIMESTAMP）。
knowledges：id（VARCHAR，文档 ID）、tenant_id（INTEGER）、knowledge_base_id（VARCHAR）、type/title/description/source、parse_status（unprocessed/processing/completed/failed）、enable_status（enabled/disabled）、file_name/file_type（VARCHAR）、file_size/storage_size（BIGINT，字节）、created_at/updated_at/processed_at/deleted_at（TIMESTAMP）。
chunks：id（VARCHAR，分块 ID）、tenant_id（INTEGER）、knowledge_base_id/knowledge_id（VARCHAR）、content（TEXT）、chunk_index（INTEGER）、is_enabled（BOOLEAN）、chunk_type（VARCHAR，text/image/table）、created_at/updated_at/deleted_at（TIMESTAMP）。

## 示例
知识库资料：SELECT id, name, description FROM knowledge_bases ORDER BY created_at DESC LIMIT 10
按状态统计文档：SELECT parse_status, COUNT(*) as count FROM knowledges GROUP BY parse_status
存储量：SELECT SUM(storage_size) as total_storage FROM knowledges
关联文档：SELECT kb.name as kb_name, COUNT(k.id) as doc_count FROM knowledge_bases kb LEFT JOIN knowledges k ON kb.id = k.knowledge_base_id GROUP BY kb.id, kb.name

## 注意
WHERE 不手工加入 tenant_id，系统会自动加入；除非必要不重复写 deleted_at 过滤。只允许 SELECT，使用 LIMIT 限制结果，跨表使用合适 JOIN。全部时间是带时区 UTC。`,
	schema: utils.GenerateSchema[DatabaseQueryInput](),
}

type DatabaseQueryInput struct {
	SQL string `json:"sql" jsonschema:"要执行的 SELECT SQL，不要包含 tenant_id 条件，系统会自动加入授权过滤。"`
}

// DatabaseQueryTool allows AI to query the database with auto-injected tenant_id for security
type DatabaseQueryTool struct {
	BaseTool
	db            *gorm.DB
	searchTargets types.SearchTargets
}

// NewDatabaseQueryTool creates a new database query tool
func NewDatabaseQueryTool(db *gorm.DB, searchTargets types.SearchTargets) *DatabaseQueryTool {
	return &DatabaseQueryTool{
		BaseTool:      databaseQueryTool,
		db:            db,
		searchTargets: searchTargets,
	}
}

// Execute executes the database query tool
func (t *DatabaseQueryTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][DatabaseQuery] Execute started")

	tenantID := uint64(0)
	if tid, ok := ctx.Value(types.TenantIDContextKey).(uint64); ok {
		tenantID = tid
	}

	// Parse args from json.RawMessage
	var input DatabaseQueryInput
	if err := json.Unmarshal(args, &input); err != nil {
		logger.Errorf(ctx, "[Tool][DatabaseQuery] Failed to parse args: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, err
	}

	// Extract SQL from input
	if input.SQL == "" {
		logger.Errorf(ctx, "[Tool][DatabaseQuery] Missing or invalid SQL parameter")
		return &types.ToolResult{
			Success: false,
			Error:   "Missing or invalid 'sql' parameter",
		}, fmt.Errorf("missing sql parameter")
	}

	logger.Infof(ctx, "[Tool][DatabaseQuery] Original SQL query:\n%s", input.SQL)
	logger.Infof(ctx, "[Tool][DatabaseQuery] Tenant ID: %d", tenantID)

	// Validate and secure the SQL query
	logger.Debugf(ctx, "[Tool][DatabaseQuery] Validating and securing SQL...")
	securedSQL, err := t.validateAndSecureSQL(input.SQL, tenantID)
	if err != nil {
		logger.Errorf(ctx, "[Tool][DatabaseQuery] SQL validation failed: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("SQL validation failed: %v", err),
		}, err
	}

	logger.Infof(ctx, "[Tool][DatabaseQuery] Secured SQL query:\n%s", securedSQL)
	logger.Infof(ctx, "Executing secured SQL query - original: %s, secured: %s, tenant_id: %d",
		input.SQL, securedSQL, tenantID)

	// Execute the query
	logger.Infof(ctx, "[Tool][DatabaseQuery] Executing query against database...")
	rows, err := t.db.WithContext(ctx).Raw(securedSQL).Rows()
	if err != nil {
		logger.Errorf(ctx, "[Tool][DatabaseQuery] Query execution failed: %v", err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Query execution failed: %v", err),
		}, err
	}
	defer rows.Close()

	logger.Debugf(ctx, "[Tool][DatabaseQuery] Query executed successfully, processing rows...")

	// Get column names
	columns, err := rows.Columns()
	if err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to get columns: %v", err),
		}, err
	}

	// Process results
	results := make([]map[string]interface{}, 0)
	for rows.Next() {
		// Create a slice of interface{} to hold each column value
		columnValues := make([]interface{}, len(columns))
		columnPointers := make([]interface{}, len(columns))
		for i := range columnValues {
			columnPointers[i] = &columnValues[i]
		}

		// Scan the row
		if err := rows.Scan(columnPointers...); err != nil {
			return &types.ToolResult{
				Success: false,
				Error:   fmt.Sprintf("Failed to scan row: %v", err),
			}, err
		}

		// Create a map for this row
		rowMap := make(map[string]interface{})
		for i, colName := range columns {
			val := columnValues[i]
			// Convert []byte to string for better readability
			if b, ok := val.([]byte); ok {
				rowMap[colName] = string(b)
			} else {
				rowMap[colName] = val
			}
		}
		results = append(results, rowMap)
	}

	if err := rows.Err(); err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Error iterating rows: %v", err),
		}, err
	}

	logger.Infof(ctx, "[Tool][DatabaseQuery] Retrieved %d rows with %d columns", len(results), len(columns))
	logger.Debugf(ctx, "[Tool][DatabaseQuery] Columns: %v", columns)

	// Log first few rows for debugging
	if len(results) > 0 {
		logger.Debugf(ctx, "[Tool][DatabaseQuery] First row sample:")
		for key, value := range results[0] {
			logger.Debugf(ctx, "[Tool][DatabaseQuery]   %s: %v", key, value)
		}
	}

	// Format output
	logger.Debugf(ctx, "[Tool][DatabaseQuery] Formatting query results...")
	output := t.formatQueryResults(columns, results)

	logger.Infof(ctx, "[Tool][DatabaseQuery] Execute completed successfully: %d rows returned", len(results))
	return &types.ToolResult{
		Success: true,
		Output:  output,
		Data: map[string]interface{}{
			"columns":      columns,
			"rows":         results,
			"row_count":    len(results),
			"display_type": "database_query",
		},
	}, nil
}

// validateAndSecureSQL validates the SQL query and injects tenant_id conditions
func (t *DatabaseQueryTool) validateAndSecureSQL(sqlQuery string, tenantID uint64) (string, error) {
	searchScopes := searchScopesFromTargets(t.searchTargets)
	if len(searchScopes) == 0 {
		return "", fmt.Errorf("no effective Agent knowledge scope is available")
	}
	securedSQL, validationResult, err := utils.ValidateAndSecureSQL(
		sqlQuery,
		utils.WithSecurityDefaults(tenantID),
		utils.WithSoftDeleteFilter("knowledge_bases", "knowledges", "chunks"),
		utils.WithHiddenKBFilter(),
		utils.WithChunkEnabledFilter(),
		utils.WithInjectionRiskCheck(),
		utils.WithSearchScopes(searchScopes),
	)
	if err != nil {
		return "", err
	}

	if !validationResult.Valid {
		var errMsgs []string
		for _, valErr := range validationResult.Errors {
			errMsgs = append(errMsgs, fmt.Sprintf("%s: %s", valErr.Type, valErr.Message))
		}
		return "", fmt.Errorf("validation failed: %s", strings.Join(errMsgs, "; "))
	}

	return securedSQL, nil
}

func searchScopesFromTargets(searchTargets types.SearchTargets) []utils.SearchScope {
	scopes := make([]utils.SearchScope, 0, len(searchTargets))
	for _, target := range searchTargets {
		if target == nil || target.KnowledgeBaseID == "" {
			continue
		}
		knowledgeIDs, tagIDs := searchTargetScope(target)
		if !searchTargetIsWholeKB(target) && len(knowledgeIDs) == 0 && len(tagIDs) == 0 {
			continue
		}
		scopes = append(scopes, utils.SearchScope{
			KnowledgeBaseID: target.KnowledgeBaseID,
			KnowledgeIDs:    knowledgeIDs,
			TagIDs:          tagIDs,
		})
	}
	return scopes
}

// formatQueryResults formats query results into readable text
func (t *DatabaseQueryTool) formatQueryResults(
	columns []string,
	results []map[string]interface{},
) string {
	output := "=== Query Results ===\n\n"
	output += fmt.Sprintf("Returned %d rows\n\n", len(results))

	if len(results) == 0 {
		output += "No matching records found.\n"
		return output
	}

	output += "=== Data Details ===\n\n"

	// Format each row
	for i, row := range results {
		output += fmt.Sprintf("--- Record #%d ---\n", i+1)
		for _, col := range columns {
			value := row[col]
			// Format the value
			var formattedValue string
			if value == nil {
				formattedValue = "<NULL>"
			} else if jsonData, err := json.Marshal(value); err == nil {
				// Check if it's a complex type
				switch v := value.(type) {
				case string:
					formattedValue = v
				case []byte:
					formattedValue = string(v)
				default:
					formattedValue = string(jsonData)
				}
			} else {
				formattedValue = fmt.Sprintf("%v", value)
			}

			output += fmt.Sprintf("  %s: %s\n", col, formattedValue)
		}
		output += "\n"
	}

	// Add summary statistics if applicable
	if len(results) > 10 {
		output += fmt.Sprintf("Note: Showing %d records out of %d total. Consider using a LIMIT clause to restrict the result count.\n", len(results), len(results))
	}

	return output
}
