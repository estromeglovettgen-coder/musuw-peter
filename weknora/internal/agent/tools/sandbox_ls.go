// Package tools — list_sandbox_files.
//
// Read-only tool that lets the LLM enumerate files under a session's
// inspectable sandbox directories. Without this tool, the LLM cannot
// see files produced by prior skill invocations or staged chat
// attachments and has to guess paths when chaining work together.
//
// Design notes:
//   - Session-scoped: the sandbox path is resolved from the tool exec
//     context (`ToolExecContext.SessionID`). The LLM cannot pass an
//     arbitrary session ID.
//   - Directory guardrail: `path` must resolve underneath one of the
//     inspectable roots — the artifact output dir
//     (`$WEKNORA_SKILL_OUTPUT_DIR`, default `/workspace/output`) or the
//     session input dir (`/workspace/input`). Output stays aligned with
//     ArtifactCollector; input is where chat attachments are staged.
//     Omitting `path` still lists output so a listing does not dump
//     every attachment into context.
//   - Read-only: this tool never creates, modifies or deletes anything
//     inside the sandbox. Model-authored files go through write_sandbox_file.
//   - Graceful "no sandbox": if the session has never spawned a sandbox
//     yet (chat-only turn, or sandbox was reaped), the tool returns an
//     empty listing with a helpful message rather than an error, so the
//     LLM can decide to invoke a skill first.
package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
)

// SandboxFileSource is the narrow, tool-facing subset of a session-aware
// sandbox manager. In production it is satisfied by
// *sandbox.SessionBoundManager; tests can stub it with an in-memory fake.
//
// Keeping the interface local to the tools package avoids leaking a
// dependency on internal/application/service (which is a higher layer)
// and mirrors the pattern used by ArtifactCollector.SandboxArtifactSource.
type SandboxFileSource interface {
	ListSessionFiles(ctx context.Context, sessionID, dir string) ([]sandbox.RemoteDirEntry, error)
	StatSessionFile(ctx context.Context, sessionID, path string) (*sandbox.RemoteStatEntry, error)
	ReadSessionFile(ctx context.Context, sessionID, path string) ([]byte, error)
}

// defaultListSandboxMaxEntries caps a single list_sandbox_files call at
// this many entries so a runaway directory can't blow up the LLM context.
// Aligns with the "sane pagination" advice in the Anthropic tool-use guide.
const (
	defaultListSandboxMaxEntries = 200
	maxListSandboxMaxEntries     = 500
)

// Tool schema

var listSandboxFilesTool = BaseTool{
	name: ToolListSandboxFiles,
	description: `列出当前会话允许查看的沙箱文件。
串联技能、后一个技能需要前一个技能产物前，必须先列出文件，不猜路径。也用于确认技能实际产出文件，再告知用户已完成。
path 可取 /workspace/input 或当前 <sandbox_attachments> 中的附件路径，查看上传资料。
适用于追问此前报告或图表、串联技能、检查附件及列出当前全部产物。
不查看技能安装目录 /opt/weknora/tenant/skills/...，应使用 read_skill(skill_name=...) 获取 SKILL.md 和文件列表（技能还含 .venv / node_modules）。不列 /workspace 本身、/etc 等系统位置。

## 路径与输出
不传 path 时使用 $WEKNORA_SKILL_OUTPUT_DIR，通常 /workspace/output。传入路径必须位于产物目录或 /workspace/input 下，任意系统目录如 /etc、/home 或技能目录会被拒绝。
递归遍历子目录，以平面列表返回文件，含可直接传给 read_sandbox_file 的绝对 path、size、modified_at。
还未调用技能、无运行中沙箱时，返回空列表及清楚说明，不是错误。`,
	schema: utils.GenerateSchema[ListSandboxFilesInput](),
}

// ListSandboxFilesInput defines the input parameters for list_sandbox_files.
type ListSandboxFilesInput struct {
	// Path is the absolute path inside the sandbox to list. When empty
	// the tool falls back to skills.ArtifactOutputDir(). Must sit under
	// the artifact output directory or /workspace/input.
	Path string `json:"path,omitempty" jsonschema:"可选：要列出的绝对沙箱路径，默认会话产物目录。必须位于产物目录或 /workspace/input 下。"`
	// MaxEntries caps the listing size to protect the LLM context.
	// Zero uses defaultListSandboxMaxEntries.
	MaxEntries int `json:"max_entries,omitempty" jsonschema:"可选：最多返回文件数，默认 200，最多 500。只检查某文件是否存在时可用较小值。"`
}

// ListSandboxFilesTool exposes SandboxFileSource.ListSessionFiles to the
// agent as a read-only enumeration primitive.
type ListSandboxFilesTool struct {
	BaseTool
	source SandboxFileSource
}

// NewListSandboxFilesTool constructs the tool. `source` MUST NOT be nil:
// callers should feature-gate registration in the agent bootstrap when
// the sandbox backend does not support per-session file inspection.
func NewListSandboxFilesTool(source SandboxFileSource) *ListSandboxFilesTool {
	return &ListSandboxFilesTool{
		BaseTool: listSandboxFilesTool,
		source:   source,
	}
}

// Execute enumerates files under the requested path inside the current
// session's sandbox.
func (t *ListSandboxFilesTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][ListSandboxFiles] Execute started")

	var input ListSandboxFilesInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, nil
	}

	if t.source == nil {
		return &types.ToolResult{
			Success: false,
			Error:   "sandbox file inspection is not available in this deployment",
		}, nil
	}

	// Resolve session ID from tool exec context (preferred) or the
	// ambient context helper (fallback for direct unit tests).
	sessionID := resolveSessionID(ctx)
	if sessionID == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "no session ID in context; list_sandbox_files must run inside an agent turn",
		}, nil
	}

	// Resolve target directory. When the caller omits path we scan the
	// same directory ArtifactCollector drains. An explicit path may also
	// sit under /workspace/input so staged chat attachments are listable.
	targetDir := strings.TrimSpace(input.Path)
	if targetDir == "" {
		targetDir = skills.ArtifactOutputDir()
	} else {
		targetDir = path.Clean(targetDir)
	}
	rootDir, ok := matchingInspectableRoot(targetDir)
	if !ok {
		return &types.ToolResult{
			Success: false,
			Error:   inspectablePathError(input.Path),
		}, nil
	}

	maxEntries := input.MaxEntries
	if maxEntries <= 0 {
		maxEntries = defaultListSandboxMaxEntries
	}
	if maxEntries > maxListSandboxMaxEntries {
		maxEntries = maxListSandboxMaxEntries
	}

	entries, err := t.source.ListSessionFiles(ctx, sessionID, targetDir)
	if err != nil {
		logger.Warnf(ctx, "[Tool][ListSandboxFiles] list failed: session=%s dir=%s err=%v",
			sessionID, targetDir, err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("failed to list %s: %v", targetDir, err),
		}, nil
	}

	// Deterministic ordering by path so multiple calls return the same
	// pagination window even when the underlying backend does not
	// guarantee ordering.
	sort.SliceStable(entries, func(i, j int) bool {
		return entries[i].Path < entries[j].Path
	})

	truncated := false
	if len(entries) > maxEntries {
		entries = entries[:maxEntries]
		truncated = true
	}

	// Build human-readable output for the LLM. Machine-consumable data
	// goes into ToolResult.Data.
	var b strings.Builder
	b.WriteString(fmt.Sprintf("=== Sandbox listing: %s ===\n\n", targetDir))
	if len(entries) == 0 {
		b.WriteString("No files found under this path. Either nothing has been written here yet, or the sandbox has been reaped.\n")
	} else {
		b.WriteString(fmt.Sprintf("Found %d file(s)", len(entries)))
		if truncated {
			b.WriteString(fmt.Sprintf(" (truncated to %d; increase max_entries to see more)", maxEntries))
		}
		b.WriteString(":\n\n")
		for _, e := range entries {
			b.WriteString(fmt.Sprintf("- %s (size=%d, modified=%s)\n",
				e.Path, e.Size, formatSandboxModTime(e.ModTime)))
		}
	}

	// Serialise entries for structured consumption.
	items := make([]map[string]interface{}, 0, len(entries))
	for _, e := range entries {
		items = append(items, map[string]interface{}{
			"name":        e.Name,
			"path":        e.Path,
			"size":        e.Size,
			"modified_at": formatSandboxModTime(e.ModTime),
		})
	}

	logger.Infof(ctx, "[Tool][ListSandboxFiles] session=%s dir=%s count=%d truncated=%v",
		sessionID, targetDir, len(items), truncated)

	return &types.ToolResult{
		Success: true,
		Output:  b.String(),
		Data: map[string]interface{}{
			"session_id": sessionID,
			"path":       targetDir,
			"root":       rootDir,
			"entries":    items,
			"count":      len(items),
			"truncated":  truncated,
		},
	}, nil
}

// Cleanup releases any resources.
func (t *ListSandboxFilesTool) Cleanup(ctx context.Context) error {
	return nil
}

// formatSandboxModTime renders a mod time in the RFC3339 shape the tool has
// historically emitted. Zero times render as the empty string so LLM output
// stays visually clean.
func formatSandboxModTime(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

// resolveSessionID pulls the session ID out of the tool exec context (set
// by the agent engine per tool call) with a fallback to the ambient
// context helper used elsewhere in WeKnora.
func resolveSessionID(ctx context.Context) string {
	if meta, ok := ToolExecFromContext(ctx); ok && meta != nil && meta.SessionID != "" {
		return meta.SessionID
	}
	if sid, ok := types.SessionIDFromContext(ctx); ok {
		return sid
	}
	return ""
}

// sandboxInspectableRoots is the allowlist for list_sandbox_files and
// read_sandbox_file. Artifact output is where skills write downloadable
// files; session input is where chat attachments are staged. Anything
// else (including /workspace itself) stays unreachable so these tools
// cannot become a general-purpose filesystem reader.
func sandboxInspectableRoots() []string {
	return []string{skills.ArtifactOutputDir(), sandbox.SessionInputRoot}
}

func inspectableRootsDescription() string {
	return strings.Join(sandboxInspectableRoots(), ", ")
}

// inspectablePathError explains a refused list/read path. Skill image
// paths are the common miss: the model sees /opt/weknora/tenant/skills/<name>
// in read_skill's environment section and retries with this tool or ls.
func inspectablePathError(requested string) string {
	base := fmt.Sprintf(
		"this tool only lists/reads session artifacts and attachments under %s. path %q is outside that scope",
		inspectableRootsDescription(), requested,
	)
	clean := path.Clean(strings.TrimSpace(requested))
	name, inImage := sandbox.SkillNameFromImagePath(clean)
	if !inImage {
		return base + ". 这些工具只能访问会话文件和附件。技能文件请用 read_skill(skill_name=..., file_path=...)。"
	}
	if name == "" {
		return base + fmt.Sprintf(
			". 该路径是技能安装根目录。请用 read_skill(skill_name=...) 读取已列出的技能，不要列出 %s。",
			sandbox.SkillsImageRoot,
		)
	}
	hint := fmt.Sprintf(
		". 该路径属于技能 %q。请用 read_skill(skill_name=%q) 加载 SKILL.md 并查看文件列表",
		name, name,
	)
	if rel := relativeSkillFileFromImagePath(clean, name); rel != "" {
		hint += fmt.Sprintf(", 或使用 read_skill(skill_name=%q, file_path=%q) 读取该文件", name, rel)
	}
	return base + hint + fmt.Sprintf(
		". 不要 ls %s（其中包含 .venv / node_modules）。",
		sandbox.SkillsImageRoot,
	)
}

func relativeSkillFileFromImagePath(clean, skillName string) string {
	dir, err := sandbox.SkillDirFor(skillName)
	if err != nil || clean == dir {
		return ""
	}
	prefix := dir + "/"
	if strings.HasPrefix(clean, prefix) {
		return strings.TrimPrefix(clean, prefix)
	}
	return ""
}

// matchingInspectableRoot returns the allowlisted root that contains
// clean, or ("", false) when the path sits outside every root.
func matchingInspectableRoot(clean string) (string, bool) {
	for _, root := range sandboxInspectableRoots() {
		if isUnderRoot(clean, root) {
			return root, true
		}
	}
	return "", false
}

// isUnderRoot reports whether clean sits at or underneath root. Both
// arguments must already be cleaned. The list/read tools use this as a
// scope check so they stay on artifacts and attachments; it is not a
// privilege boundary (shell_exec can already reach the same files).
func isUnderRoot(clean, root string) bool {
	if clean == root {
		return true
	}
	rootWithSep := root
	if !strings.HasSuffix(rootWithSep, "/") {
		rootWithSep += "/"
	}
	return strings.HasPrefix(clean, rootWithSep)
}
