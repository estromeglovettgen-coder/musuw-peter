package repository

import (
	"context"
	"sort"
	"strings"

	"github.com/Tencent/WeKnora/internal/types"
)

// PreviewDirectory projects only published titles and the real folder hierarchy.
// Tenant, reviewed KB binding, soft deletion and publication filters apply at
// the database seam; no caller-supplied source resource IDs are accepted by HTTP.
func (r *marketplaceRepository) PreviewDirectory(
	ctx context.Context, tenant uint64, kbIDs []string,
) ([]types.MarketplaceDirectoryEntry, error) {
	result := []types.MarketplaceDirectoryEntry{}
	if tenant == 0 || len(kbIDs) == 0 {
		return result, nil
	}
	var kbs []types.KnowledgeBase
	if err := r.db.WithContext(ctx).Select("id", "name").
		Where("tenant_id = ? AND id IN ? AND is_temporary = ?", tenant, kbIDs, false).
		Find(&kbs).Error; err != nil {
		return nil, err
	}
	names := map[string]string{}
	validIDs := make([]string, 0, len(kbs))
	for _, kb := range kbs {
		names[kb.ID] = kb.Name
		validIDs = append(validIDs, kb.ID)
	}
	if len(validIDs) == 0 {
		return result, nil
	}
	var folders []types.WikiFolder
	if err := r.db.WithContext(ctx).Select("id", "knowledge_base_id", "parent_id", "name").
		Where("tenant_id = ? AND knowledge_base_id IN ?", tenant, validIDs).
		Find(&folders).Error; err != nil {
		return nil, err
	}
	byID := map[string]types.WikiFolder{}
	for _, folder := range folders {
		byID[folder.ID] = folder
	}
	var pages []types.WikiPage
	if err := r.db.WithContext(ctx).Select("id", "knowledge_base_id", "title", "page_type", "folder_id").
		Where("tenant_id = ? AND knowledge_base_id IN ? AND status = ? AND page_type <> ?",
			tenant, validIDs, types.WikiPageStatusPublished, "index").
		Order("title ASC, id ASC").Find(&pages).Error; err != nil {
		return nil, err
	}
	for _, page := range pages {
		path := []string{}
		seen := map[string]bool{}
		for folderID := page.FolderID; folderID != "" && !seen[folderID]; {
			seen[folderID] = true
			folder, ok := byID[folderID]
			if !ok || folder.KnowledgeBaseID != page.KnowledgeBaseID {
				break
			}
			path = append(path, folder.Name)
			folderID = folder.ParentID
		}
		for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
			path[i], path[j] = path[j], path[i]
		}
		path = append([]string{names[page.KnowledgeBaseID]}, path...)
		result = append(result, types.MarketplaceDirectoryEntry{
			ID: page.ID, Title: page.Title, Path: path, PageType: page.PageType,
		})
	}
	sort.SliceStable(result, func(i, j int) bool {
		a, b := strings.Join(result[i].Path, "\x00"), strings.Join(result[j].Path, "\x00")
		if a != b {
			return a < b
		}
		return result[i].Title < result[j].Title
	})
	return result, nil
}
