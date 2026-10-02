package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/types/interfaces"
	"github.com/Tencent/WeKnora/internal/utils"
)

type graphConfigSummary struct {
	Nodes     []string
	Relations []string
}

var queryKnowledgeGraphTool = BaseTool{
	name: ToolQueryKnowledgeGraph,
	description: `查询已启用实体关系提取的知识库中的真实存储图谱，探索实体关系和知识网络。
适用于实体关系（例如 Docker 与 Kubernetes）、概念关联、特定实体相关信息、架构和系统关系。
普通文本搜索或精确正文使用 knowledge_search；没有配置图谱提取的库不适用。

## 参数
- knowledge_base_ids（必填）：1–10 个短 bN 知识库 ID，仅启用图谱提取的库有效。
- query（必填）：实体名、关系问题或概念。
知识库需提前配置节点类型（例如 Technology、Tool、Concept）和关系（例如 depends_on、uses、contains）并启用提取。

## 流程
关系探索后用 list_knowledge_chunks 查看细节；网络分析后用 knowledge_search 补全理解；主题研究可先语义检索，再查图谱。
输出会说明图谱配置状态，结果严格保持在智能体的知识库、文档和标签范围内。`,
	schema: utils.GenerateSchema[QueryKnowledgeGraphInput](),
}

// QueryKnowledgeGraphInput defines the input parameters for query knowledge graph tool
type QueryKnowledgeGraphInput struct {
	KnowledgeBaseIDs []string `json:"knowledge_base_ids" jsonschema:"要查询的短 bN 知识库 ID 数组。"`
	Query            string   `json:"query" jsonschema:"查询内容，实体名称或关系问题。"`
}

// QueryKnowledgeGraphTool queries the knowledge graph for entities and relationships
type QueryKnowledgeGraphTool struct {
	BaseTool
	knowledgeBaseService  interfaces.KnowledgeBaseService
	graphRepository       interfaces.RetrieveGraphRepository
	scopeKnowledgeService interfaces.KnowledgeService
	searchTargets         types.SearchTargets
	scopeEnforced         bool
}

// WithKnowledgeScope enables document/tag resolution for Agent calls. Narrow
// scopes become document-specific Neo4j queries before any graph is returned.
func (t *QueryKnowledgeGraphTool) WithKnowledgeScope(
	knowledgeService interfaces.KnowledgeService,
) *QueryKnowledgeGraphTool {
	t.scopeKnowledgeService = knowledgeService
	return t
}

// NewQueryKnowledgeGraphTool creates a new query knowledge graph tool
func NewQueryKnowledgeGraphTool(
	knowledgeBaseService interfaces.KnowledgeBaseService,
	graphRepository interfaces.RetrieveGraphRepository,
	searchTargets ...types.SearchTargets,
) *QueryKnowledgeGraphTool {
	tool := &QueryKnowledgeGraphTool{
		BaseTool:             queryKnowledgeGraphTool,
		knowledgeBaseService: knowledgeBaseService,
		graphRepository:      graphRepository,
	}
	// Presence of the variadic argument — not its length — enables the Agent
	// authorization boundary, so an empty scope fails closed.
	if len(searchTargets) > 0 {
		tool.searchTargets = searchTargets[0]
		tool.scopeEnforced = true
	}
	return tool
}

// Execute searches Neo4j entity relationships in the server-owned Agent scope.
func (t *QueryKnowledgeGraphTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	var input QueryKnowledgeGraphInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{Success: false, Error: fmt.Sprintf("failed to parse args: %v", err)}, err
	}
	if len(input.KnowledgeBaseIDs) == 0 || len(input.KnowledgeBaseIDs) > 10 {
		err := fmt.Errorf("knowledge_base_ids must contain 1 to 10 KB IDs")
		return &types.ToolResult{Success: false, Error: err.Error()}, err
	}
	for _, id := range input.KnowledgeBaseIDs {
		if strings.TrimSpace(id) == "" {
			err := fmt.Errorf("knowledge_base_ids cannot contain empty IDs")
			return &types.ToolResult{Success: false, Error: err.Error()}, err
		}
	}
	if t.scopeEnforced {
		if err := validateKnowledgeBaseIDsInSearchTargets(t.searchTargets, input.KnowledgeBaseIDs); err != nil {
			return &types.ToolResult{Success: false, Error: err.Error()}, err
		}
	}
	query := strings.TrimSpace(input.Query)
	if query == "" {
		err := fmt.Errorf("query is required")
		return &types.ToolResult{Success: false, Error: err.Error()}, err
	}
	if t.graphRepository == nil {
		err := fmt.Errorf("knowledge graph backend is unavailable")
		return &types.ToolResult{Success: false, Error: err.Error()}, err
	}

	graphConfigs := make(map[string]graphConfigSummary)
	kbCounts := make(map[string]int)
	nodes := make(map[string]map[string]interface{})
	edges := make(map[string]map[string]interface{})
	relationLines := make(map[string]string)
	var failures []string
	successfulQueries := 0
	for _, kbID := range dedupNonEmptyStrings(input.KnowledgeBaseIDs) {
		kb, err := t.knowledgeBaseService.GetKnowledgeBaseByIDOnly(ctx, kbID)
		if err != nil || kb == nil || kb.ID != kbID {
			failures = append(failures, fmt.Sprintf("KB %s: knowledge base unavailable", kbID))
			continue
		}
		if !kb.IsGraphEnabled() {
			failures = append(failures, fmt.Sprintf("KB %s: graph extraction is disabled", kbID))
			continue
		}
		graphConfigs[kbID] = summarizeGraphConfig(kb.ExtractConfig)
		namespaces, err := t.graphNamespacesForKB(ctx, kb)
		if err != nil {
			failures = append(failures, fmt.Sprintf("KB %s: %v", kbID, err))
			continue
		}
		// An empty document/tag scope must never widen to a whole-KB query.
		if len(namespaces) == 0 {
			kbCounts[kbID] = 0
			successfulQueries++
			continue
		}
		for _, namespace := range namespaces {
			graph, searchErr := t.graphRepository.SearchNode(ctx, namespace, []string{query})
			if searchErr != nil || graph == nil {
				failures = append(failures, fmt.Sprintf("KB %s: graph query failed or backend unavailable", kbID))
				continue
			}
			successfulQueries++
			for _, node := range graph.Node {
				if node == nil || strings.TrimSpace(node.Name) == "" {
					continue
				}
				key := graphEntityKey(namespace, node.Name)
				nodes[key] = map[string]interface{}{
					"id": key, "label": node.Name, "attributes": node.Attributes,
					"kb_id": kbID, "knowledge_id": namespace.Knowledge,
				}
			}
			for _, relation := range graph.Relation {
				if relation == nil || relation.Node1 == "" || relation.Node2 == "" || relation.Type == "" {
					continue
				}
				sourceID := graphEntityKey(namespace, relation.Node1)
				targetID := graphEntityKey(namespace, relation.Node2)
				for _, endpoint := range []struct{ id, name string }{{sourceID, relation.Node1}, {targetID, relation.Node2}} {
					if _, exists := nodes[endpoint.id]; !exists {
						nodes[endpoint.id] = map[string]interface{}{
							"id": endpoint.id, "label": endpoint.name, "kb_id": kbID,
							"knowledge_id": namespace.Knowledge,
						}
					}
				}
				key := sourceID + "|" + relation.Type + "|" + targetID
				edges[key] = map[string]interface{}{
					"source": sourceID, "target": targetID, "type": relation.Type,
					"kb_id": kbID, "knowledge_id": namespace.Knowledge,
				}
				relationLines[key] = fmt.Sprintf("%s —[%s]→ %s", relation.Node1, relation.Type, relation.Node2)
			}
		}
	}
	nodeKeys := sortedMapKeys(nodes)
	edgeKeys := sortedMapKeys(edges)
	nodeRows := make([]map[string]interface{}, 0, len(nodeKeys))
	edgeRows := make([]map[string]interface{}, 0, len(edgeKeys))
	for _, key := range nodeKeys {
		nodeRows = append(nodeRows, nodes[key])
	}
	for _, key := range edgeKeys {
		edgeRows = append(edgeRows, edges[key])
		kbID := edges[key]["kb_id"].(string)
		kbCounts[kbID]++
	}
	var output strings.Builder
	fmt.Fprintf(&output, "Knowledge graph query: %s\nFound %d entities and %d relationships.\n",
		query, len(nodeRows), len(edgeRows))
	if len(edgeRows) > 0 {
		output.WriteString("Relationships:\n")
		for _, key := range edgeKeys {
			fmt.Fprintf(&output, "- %s\n", relationLines[key])
		}
	}
	if len(failures) > 0 {
		output.WriteString("Graph query errors:\n")
		for _, failure := range failures {
			fmt.Fprintf(&output, "- %s\n", failure)
		}
	}
	success := successfulQueries > 0
	result := &types.ToolResult{
		Success: success,
		Output:  output.String(),
		Data: map[string]interface{}{
			"display_type":       "graph_query_results",
			"knowledge_base_ids": input.KnowledgeBaseIDs,
			"query":              query,
			"results":            []map[string]interface{}{},
			"count":              len(edgeRows),
			"kb_counts":          kbCounts,
			"graph_configs":      graphConfigsToData(graphConfigs),
			"graph_config":       aggregateGraphConfig(graphConfigs),
			"has_graph_config":   len(graphConfigs) > 0,
			"graph_data": map[string]interface{}{
				"nodes": nodeRows, "edges": edgeRows,
				"total_nodes": len(nodeRows), "total_edges": len(edgeRows),
			},
			"errors": failures,
		},
	}
	if !success {
		result.Error = "knowledge graph query failed"
		return result, fmt.Errorf("%s", result.Error)
	}
	return result, nil
}

// graphNamespacesForKB keeps document and tag selections inside the Neo4j
// query itself. Graph nodes without chunks cannot be safely filtered afterward.
func (t *QueryKnowledgeGraphTool) graphNamespacesForKB(
	ctx context.Context, kb *types.KnowledgeBase,
) ([]types.NameSpace, error) {
	if !t.scopeEnforced {
		return []types.NameSpace{{KnowledgeBase: kb.ID}}, nil
	}
	var documentIDs []string
	for _, target := range t.searchTargets {
		if target == nil || target.KnowledgeBaseID != kb.ID {
			continue
		}
		if target.TenantID != kb.TenantID {
			return nil, fmt.Errorf("knowledge base ownership changed")
		}
		if searchTargetIsWholeKB(target) {
			return []types.NameSpace{{KnowledgeBase: kb.ID}}, nil
		}
		explicitIDs, tagIDs := searchTargetScope(target)
		documentIDs = append(documentIDs, explicitIDs...)
		if len(tagIDs) > 0 {
			if t.scopeKnowledgeService == nil {
				return nil, fmt.Errorf("knowledge service is unavailable for tag scope")
			}
			taggedIDs, err := t.scopeKnowledgeService.ListKnowledgeIDsByTagIDs(
				ctx, kb.TenantID, kb.ID, tagIDs,
			)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve tag scope: %w", err)
			}
			documentIDs = append(documentIDs, taggedIDs...)
		}
	}
	documentIDs = dedupNonEmptyStrings(documentIDs)
	sort.Strings(documentIDs)
	namespaces := make([]types.NameSpace, 0, len(documentIDs))
	for _, id := range documentIDs {
		namespaces = append(namespaces, types.NameSpace{KnowledgeBase: kb.ID, Knowledge: id})
	}
	return namespaces, nil
}

func graphEntityKey(namespace types.NameSpace, name string) string {
	return namespace.KnowledgeBase + "/" + namespace.Knowledge + "/" + name
}

func sortedMapKeys[V any](values map[string]V) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func summarizeGraphConfig(config *types.ExtractConfig) graphConfigSummary {
	if config == nil {
		return graphConfigSummary{}
	}

	return graphConfigSummary{
		Nodes:     uniqueSortedNodeNames(config.Nodes),
		Relations: uniqueSortedRelationNames(config.Relations),
	}
}

func uniqueSortedNodeNames(nodes []*types.GraphNode) []string {
	seen := make(map[string]struct{}, len(nodes))
	names := make([]string, 0, len(nodes))
	for _, node := range nodes {
		if node == nil || node.Name == "" {
			continue
		}
		if _, exists := seen[node.Name]; exists {
			continue
		}
		seen[node.Name] = struct{}{}
		names = append(names, node.Name)
	}
	sort.Strings(names)
	return names
}

func uniqueSortedRelationNames(relations []*types.GraphRelation) []string {
	seen := make(map[string]struct{}, len(relations))
	names := make([]string, 0, len(relations))
	for _, relation := range relations {
		if relation == nil || relation.Type == "" {
			continue
		}
		if _, exists := seen[relation.Type]; exists {
			continue
		}
		seen[relation.Type] = struct{}{}
		names = append(names, relation.Type)
	}
	sort.Strings(names)
	return names
}

func graphConfigsToData(graphConfigs map[string]graphConfigSummary) map[string]map[string]interface{} {
	if len(graphConfigs) == 0 {
		return nil
	}

	data := make(map[string]map[string]interface{}, len(graphConfigs))
	for kbID, config := range graphConfigs {
		data[kbID] = map[string]interface{}{
			"nodes":     config.Nodes,
			"relations": config.Relations,
		}
	}
	return data
}

func aggregateGraphConfig(graphConfigs map[string]graphConfigSummary) map[string]interface{} {
	if len(graphConfigs) == 0 {
		return nil
	}

	merged := graphConfigSummary{}
	for _, config := range graphConfigs {
		merged.Nodes = append(merged.Nodes, config.Nodes...)
		merged.Relations = append(merged.Relations, config.Relations...)
	}

	return map[string]interface{}{
		"nodes":     uniqueStrings(merged.Nodes),
		"relations": uniqueStrings(merged.Relations),
	}
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}
