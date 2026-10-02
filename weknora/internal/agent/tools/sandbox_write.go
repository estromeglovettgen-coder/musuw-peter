// Package tools — write_sandbox_file.
//
// Lets the LLM write a text file into the current session's sandbox without
// stuffing the bytes through a shell_exec heredoc. shell_exec keeps an 8 KiB
// command cap; generated scripts (PPT builders, reports) routinely exceed it.
//
// Design notes:
//   - Session-scoped: the sandbox is resolved from ToolExecContext.SessionID.
//   - Path guardrail: writes sit under /workspace and never under
//     /workspace/input (staged attachments stay read-only). Prefer
//     /workspace/output for files the user should download.
//   - Content stays out of ToolResult.Data/Output: the model already has the
//     bytes it just sent. The result is path + size so the next call can
//     shell_exec the file.
package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"strings"

	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
)

const maxWriteSandboxBytes = 256 * 1024

// writeSandboxMissingFieldHint is appended when schema validation fails
// (typically a truncated call that only sent `content`).
const writeSandboxMissingFieldHint = "\n如果上一次调用被截断，请用完整的 JSON 对象重试：" +
	"先写 `path`（例如 /workspace/output/script.py），再写 `content`。大文件请分段处理。"

// SandboxFileSink is the write-side counterpart of SandboxFileSource.
// Production uses *sandbox.SessionBoundManager via SessionFileStore.
type SandboxFileSink interface {
	WriteSessionWorkspaceFile(ctx context.Context, sessionID, filePath string, content []byte) error
}

var writeSandboxFileTool = BaseTool{
	name: ToolWriteSandboxFile,
	description: `在当前会话沙箱创建或覆盖脚本、报告及其他文本文件。
不要用 shell_exec 的 cat、heredoc、python -c 发送大文件，这些会超过命令长度限制。
需要技能依赖的脚本随后用 execute_skill_script(skill_name=..., script_path=<该路径>) 执行；独立脚本可用 shell_exec，例如 python3 /workspace/output/generate_ppt.py。
用户产物（pptx、pdf、png、html）放 /workspace/output 供下载；临时脚本可在 /workspace 内，不能在只读附件 /workspace/input。
JSON 参数必须同时包含 path 和 content，先输出 path。大文件拆成多个文件，不用单个超长 content。
适用于新建代码、保存较长报告或配置、覆盖当前会话文件；仅改几行用 edit_sandbox_file。不要写二进制，由脚本在 /workspace/output 生成。
path 必须是 /workspace 下的绝对文件路径，不能是 /workspace、/workspace/output、/workspace/input 这些目录本身。
每次 content 最多 262144 字节，返回绝对路径和字节数，不回显文件内容。
` + pythonQuoteGuidance + ``,
	schema: utils.GenerateSchema[WriteSandboxFileInput](),
}

// WriteSandboxFileInput defines the input parameters for write_sandbox_file.
type WriteSandboxFileInput struct {
	Path    string `json:"path" jsonschema:"要写入的绝对沙箱路径，位于 /workspace 下且不能位于 /workspace/input；可下载产物优先放 /workspace/output。"`
	Content string `json:"content" jsonschema:"文件完整文本，将覆盖现有文件；最多 262144 字节，不发送二进制。"`
}

// WriteSandboxFileTool writes a text file into the session sandbox.
type WriteSandboxFileTool struct {
	BaseTool
	sink SandboxFileSink
}

// NewWriteSandboxFileTool constructs the tool. `sink` MUST NOT be nil.
func NewWriteSandboxFileTool(sink SandboxFileSink) *WriteSandboxFileTool {
	return &WriteSandboxFileTool{
		BaseTool: writeSandboxFileTool,
		sink:     sink,
	}
}

// Execute writes the requested file into the current session's sandbox.
func (t *WriteSandboxFileTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][WriteSandboxFile] Execute started")

	var input WriteSandboxFileInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, nil
	}

	if t.sink == nil {
		return &types.ToolResult{
			Success: false,
			Error:   "sandbox file writing is not available in this deployment",
		}, nil
	}

	trimmed := strings.TrimSpace(input.Path)
	if trimmed == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "path is required; write under /workspace/output for artifacts or /workspace for scratch scripts",
		}, nil
	}

	sessionID := resolveSessionID(ctx)
	if sessionID == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "no session ID in context; write_sandbox_file must run inside an agent turn",
		}, nil
	}

	clean := path.Clean(trimmed)
	rootDir, ok := matchingWritableRoot(clean)
	if !ok {
		return &types.ToolResult{
			Success: false,
			Error:   workspaceWriteScopeError(input.Path),
		}, nil
	}

	content := []byte(input.Content)
	if len(content) > maxWriteSandboxBytes {
		return &types.ToolResult{
			Success: false,
			Error: fmt.Sprintf(
				"content too large (%d bytes; max %d). Split the work across files or shrink the script",
				len(content), maxWriteSandboxBytes,
			),
		}, nil
	}
	if isBinaryShellOutput(string(content)) {
		return &types.ToolResult{
			Success: false,
			Error:   "binary content is not accepted; write a text script and have it produce binary files under /workspace/output",
		}, nil
	}

	if err := t.sink.WriteSessionWorkspaceFile(ctx, sessionID, clean, content); err != nil {
		logger.Warnf(ctx, "[Tool][WriteSandboxFile] write failed: session=%s path=%s err=%v",
			sessionID, clean, err)
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("failed to write %s: %v", clean, err),
		}, nil
	}

	logger.Infof(ctx, "[Tool][WriteSandboxFile] session=%s path=%s bytes=%d",
		sessionID, clean, len(content))

	if hint := pythonScriptSyntaxHint(clean, input.Content); hint != "" {
		return &types.ToolResult{
			Success: false,
			Error:   hint,
			Output:  fmt.Sprintf("=== Wrote sandbox file with syntax problems: %s ===\n\n%s\n", clean, hint),
			Data: map[string]interface{}{
				"display_type": ToolWriteSandboxFile,
				"session_id":   sessionID,
				"path":         clean,
				"root":         rootDir,
				"name":         path.Base(clean),
				"size":         len(content),
				"syntax_error": true,
			},
		}, nil
	}

	output := fmt.Sprintf(
		"=== Wrote sandbox file: %s ===\n\nbytes=%d\n\n"+
			"如果此脚本需要技能的依赖包，请使用\n"+
			"execute_skill_script(skill_name=<skill>, script_path=%s)\n"+
			"以使用技能的虚拟环境。独立脚本可使用：\n"+
			"shell_exec python3 %s\n\n"+
			"交付给用户的文件应保存到 %s。\n",
		clean, len(content), clean, clean, sandbox.SessionOutputRoot,
	)
	return &types.ToolResult{
		Success: true,
		Output:  output,
		Data: map[string]interface{}{
			"display_type": ToolWriteSandboxFile,
			"session_id":   sessionID,
			"path":         clean,
			"root":         rootDir,
			"name":         path.Base(clean),
			"size":         len(content),
		},
	}, nil
}

// Cleanup releases any resources.
func (t *WriteSandboxFileTool) Cleanup(ctx context.Context) error {
	return nil
}

// workspaceWriteScopeError explains a refused write/edit path. This is a
// tool-scope convention (attachments stay out of these tools; scripts go
// under /workspace), not a privilege check — shell_exec can already write
// the same session sandbox.
func workspaceWriteScopeError(requested string) string {
	return fmt.Sprintf(
		"this tool only writes files under %s (not under %s, and not the directory roots themselves). path %q is outside that scope; use shell_exec for other locations",
		sandbox.SessionWorkspaceRoot, sandbox.SessionInputRoot, requested,
	)
}

// matchingWritableRoot returns the workspace root that contains clean, or
// ("", false) when the path is outside /workspace, is /workspace itself, or
// sits under the read-only attachment tree.
func matchingWritableRoot(clean string) (string, bool) {
	if !isUnderRoot(clean, sandbox.SessionWorkspaceRoot) ||
		clean == sandbox.SessionWorkspaceRoot ||
		clean == sandbox.SessionOutputRoot ||
		isUnderRoot(clean, sandbox.SessionInputRoot) {
		return "", false
	}
	if isUnderRoot(clean, sandbox.SessionOutputRoot) {
		return sandbox.SessionOutputRoot, true
	}
	return sandbox.SessionWorkspaceRoot, true
}
