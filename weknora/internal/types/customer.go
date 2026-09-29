package types

import (
	"context"
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"strings"
)

// CustomerProfile marks a document KB as a customer project. Generated facts
// remain in the native Wiki; this stores only manually managed information.
type CustomerProfile struct {
	Status                 string   `json:"status"`
	Tags                   []string `json:"tags"`
	Contact                string   `json:"contact"`
	Note                   string   `json:"note"`
	SharedKnowledgeBaseIDs []string `json:"shared_knowledge_base_ids"`
	WikiSlug               string   `json:"wiki_slug"`
}

func (p CustomerProfile) Value() (driver.Value, error) { return json.Marshal(p) }
func (p *CustomerProfile) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	var data []byte
	switch v := value.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return fmt.Errorf("invalid customer profile type %T", value)
	}
	return json.Unmarshal(data, p)
}

func (p *CustomerProfile) Validate() error {
	if p == nil {
		return nil
	}
	if len(p.Status) > 100 || len(p.Contact) > 1000 || len(p.Note) > 12000 || len(p.WikiSlug) > 512 || len(p.Tags) > 30 || len(p.SharedKnowledgeBaseIDs) > 30 {
		return fmt.Errorf("customer profile exceeds size limit")
	}
	for _, tag := range p.Tags {
		if len(tag) > 100 {
			return fmt.Errorf("customer tag exceeds size limit")
		}
	}
	return nil
}

// CustomerConfig holds workspace-wide choices, not customer facts. Removing a
// choice intentionally leaves existing profiles unchanged.
type CustomerConfig struct {
	Statuses  []string           `json:"statuses"`
	Tags      []string           `json:"tags"`
	Templates []CustomerTemplate `json:"templates"`
}

func DefaultCustomerConfig() *CustomerConfig {
	return &CustomerConfig{Statuses: []string{"待了解", "沟通中", "已成交", "服务中", "已归档"}, Tags: []string{}, Templates: []CustomerTemplate{}}
}

// Templates contain native create-time settings, not customer identities or
// generated content. References still pass native KB authorization on creation.
type CustomerTemplate struct {
	ID          string                 `json:"id"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Config      CustomerTemplateConfig `json:"config"`
}

type CustomerTemplateDefaults struct {
	Status                 string   `json:"status"`
	Tags                   []string `json:"tags"`
	Note                   string   `json:"note"`
	SharedKnowledgeBaseIDs []string `json:"shared_knowledge_base_ids"`
}

type CustomerTemplateConfig struct {
	CustomerProfile          CustomerTemplateDefaults  `json:"customer_profile"`
	ChunkingConfig           ChunkingConfig            `json:"chunking_config"`
	EmbeddingModelID         string                    `json:"embedding_model_id"`
	SummaryModelID           string                    `json:"summary_model_id"`
	VectorStoreID            string                    `json:"vector_store_id,omitempty"`
	StorageBackendID         string                    `json:"storage_backend_id,omitempty"`
	StorageProviderConfig    *StorageProviderConfig    `json:"storage_provider_config"`
	VLMConfig                CustomerTemplateVLMConfig `json:"vlm_config"`
	ASRConfig                ASRConfig                 `json:"asr_config"`
	ExtractConfig            *ExtractConfig            `json:"extract_config"`
	QuestionGenerationConfig *QuestionGenerationConfig `json:"question_generation_config"`
	AutoTagConfig            *AutoTagConfig            `json:"auto_tag_config"`
	WikiConfig               *WikiConfig               `json:"wiki_config"`
	IndexingStrategy         IndexingStrategy          `json:"indexing_strategy"`
}

// Native VLMConfig also has legacy inline credentials. A reusable template
// deliberately accepts only its model reference and interpretation settings.
type CustomerTemplateVLMConfig struct {
	Enabled             bool   `json:"enabled"`
	ModelID             string `json:"model_id"`
	DescriptionLanguage string `json:"description_language,omitempty"`
	CustomInstructions  string `json:"custom_instructions,omitempty"`
}

func (c CustomerConfig) Value() (driver.Value, error) { return json.Marshal(c) }
func (c *CustomerConfig) Scan(value interface{}) error {
	if value == nil {
		return nil
	}
	switch v := value.(type) {
	case []byte:
		return json.Unmarshal(v, c)
	case string:
		return json.Unmarshal([]byte(v), c)
	default:
		return fmt.Errorf("invalid customer config type %T", value)
	}
}

func (c *CustomerConfig) Validate() error {
	if len(c.Statuses) == 0 || len(c.Statuses) > 50 || len(c.Tags) > 100 {
		return fmt.Errorf("请保留 1–50 个客户状态，标签不能超过 100 个")
	}
	for _, values := range [][]string{c.Statuses, c.Tags} {
		seen := make(map[string]bool, len(values))
		for i, value := range values {
			value = strings.TrimSpace(value)
			if value == "" || len(value) > 100 || seen[value] {
				return fmt.Errorf("状态和标签不能留空、重复或超过 100 字节")
			}
			values[i], seen[value] = value, true
		}
	}
	if c.Tags == nil {
		c.Tags = []string{}
	}
	if len(c.Templates) > 50 {
		return fmt.Errorf("客户模板不能超过 50 套")
	}
	ids, names := map[string]bool{}, map[string]bool{}
	for i := range c.Templates {
		template := &c.Templates[i]
		template.ID = strings.TrimSpace(template.ID)
		template.Name = strings.TrimSpace(template.Name)
		if template.ID == "" || len(template.ID) > 100 || ids[template.ID] || template.Name == "" || len(template.Name) > 240 || names[template.Name] || len(template.Description) > 2000 {
			return fmt.Errorf("模板名称不能为空或重复，且名称和说明不能过长")
		}
		ids[template.ID], names[template.Name] = true, true
		defaults := template.Config.CustomerProfile
		profile := CustomerProfile{Status: defaults.Status, Tags: defaults.Tags, Note: defaults.Note, SharedKnowledgeBaseIDs: defaults.SharedKnowledgeBaseIDs}
		if err := profile.Validate(); err != nil {
			return err
		}
		data, err := json.Marshal(template.Config)
		if err != nil || len(data) > 128*1024 {
			return fmt.Errorf("单套客户模板配置不能超过 128 KB")
		}
	}
	if c.Templates == nil {
		c.Templates = []CustomerTemplate{}
	}
	return nil
}

const CustomerKnowledgeBaseContextKey ContextKey = "customer_knowledge_base_id"

func WithCustomerKnowledgeBase(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, CustomerKnowledgeBaseContextKey, id)
}

func CustomerKnowledgeBaseFromContext(ctx context.Context) string {
	id, _ := ctx.Value(CustomerKnowledgeBaseContextKey).(string)
	return id
}
