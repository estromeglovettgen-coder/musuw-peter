package service

import (
	"context"
	"strings"
	"unicode/utf8"

	"github.com/Tencent/WeKnora/internal/types"
)

// Preview exposes only deliberately public catalog metadata. It never creates
// a MarketplaceScope, which would also authorize reading paid Wiki bodies.
func (s *marketplaceService) Preview(ctx context.Context, id string) (*types.MarketplacePreview, error) {
	if _, _, err := marketplaceActor(ctx); err != nil {
		return nil, err
	}
	p, err := s.repo.GetProduct(ctx, id)
	if err != nil {
		return nil, err
	}
	if p.Status != "published" || p.PublishedTenantID == 0 || len(p.PlatformKnowledgeBaseIDs) == 0 {
		return nil, types.ErrMarketplaceNotFound
	}
	directory, err := s.repo.PreviewDirectory(ctx, p.PublishedTenantID, p.PlatformKnowledgeBaseIDs)
	if err != nil {
		return nil, err
	}
	return &types.MarketplacePreview{
		Directory: directory,
		Examples:  append([]types.MarketplaceExample{}, p.SampleConversations...),
	}, nil
}

func validateMarketplaceExamples(input *[]types.MarketplaceExample) error {
	if input == nil {
		return nil
	}
	if len(*input) > 6 {
		return types.ErrMarketplaceInvalid
	}
	for i := range *input {
		example := &(*input)[i]
		example.Question = strings.TrimSpace(example.Question)
		example.Answer = strings.TrimSpace(example.Answer)
		if example.Question == "" || example.Answer == "" ||
			utf8.RuneCountInString(example.Question) > 500 || utf8.RuneCountInString(example.Answer) > 16000 {
			return types.ErrMarketplaceInvalid
		}
	}
	return nil
}
