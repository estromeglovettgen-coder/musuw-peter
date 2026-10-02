// Package tools — shell_exec.
//
// General shell command execution primitive for the agent. The LLM can freely
// explore and operate inside its session-scoped Cube MicroVM: inspect files,
// transform data, run programs, install dependencies, and prepare or verify
// skill outputs.
//
// Design notes:
//
//   - Session-sandbox capability: registration is feature-gated on the
//     sandbox backend exposing SandboxCommandExecutor (Cube, E2B, Docker).
//     shell_exec never runs on the WeKnora host.
//   - Session-scoped: the sandbox is resolved from ToolExecContext.SessionID
//     so the LLM cannot execute against a foreign session, and installed
//     dependencies persist across subsequent tool calls in the same session.
//   - Non-zero exit is a normal signal, not an error: pip install failures,
//     missing binaries, etc. are all valid results the LLM must inspect.
//     Only wire-level errors (sandbox unreachable, timeout) surface as
//     ToolResult.Success = false.
//   - Output truncation: shell installers produce thousands of lines that
//     would blow up the LLM context. We keep the head (leading messages)
//     and the tail (final errors) with an ellipsis marker so the tail —
//     usually the most informative segment — is preserved.
//   - Command shape blacklist: the sandbox is throwaway, but we still refuse
//     obviously destructive patterns (rm -rf /, fork bombs, mkfs...) to
//     protect the LLM from its own hallucinations.
//   - No backgrounding, no stdin: matches the confirmed product decisions.
//     Trailing '&' and 'nohup' are rejected up-front to avoid orphaned
//     processes inside the sandbox.
package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/logger"
	"github.com/Tencent/WeKnora/internal/sandbox"
	"github.com/Tencent/WeKnora/internal/types"
	"github.com/Tencent/WeKnora/internal/utils"
)

// SandboxCommandExecutor is the narrow, tool-facing subset of a session-aware
// sandbox manager that supports executing arbitrary shell commands. In
// production it is satisfied by *sandbox.SessionBoundManager; tests can stub
// it with an in-memory fake. Kept local to the tools package for the same
// reason as SandboxFileSource — no dependency leak into higher layers.
type SandboxCommandExecutor interface {
	ExecShellCommand(
		ctx context.Context,
		sessionID string,
		command string,
		workDir string,
		timeout time.Duration,
		env map[string]string,
	) (*sandbox.ExecuteResult, error)
}

// Limits — kept generous enough for `pip install tensorflow` while still
// bounding the LLM context blast radius.
const (
	// defaultShellExecWorkDir is where commands land when the caller omits
	// work_dir. Matches CubeSandbox.Execute's remote directory convention.
	defaultShellExecWorkDir = "/workspace"
	// defaultShellExecTimeout is applied when the caller omits timeout_sec.
	// 120s is enough for most pip installs; heavier installs can opt in via
	// timeout_sec up to shellExecMaxTimeout.
	defaultShellExecTimeout = 120 * time.Second
	// shellExecMaxTimeout hard-caps timeout_sec. Ten minutes covers even the
	// slow "install libreoffice" case without letting a runaway command
	// pin the session's sandbox for hours.
	shellExecMaxTimeout = 10 * time.Minute
	// shellExecMaxCommandBytes rejects excessively long command strings.
	// Real skill setup one-liners fit comfortably under 8 KiB. Generated
	// scripts belong in write_sandbox_file, not inlined in the command.
	shellExecMaxCommandBytes = 8 * 1024
	// max_output_bytes controls stdout only. Stderr uses a smaller independent
	// budget so verbose failures cannot consume the entire tool result.
	defaultShellExecOutputBytes = 16 * 1024
	maxShellExecOutputBytes     = 64 * 1024
	defaultShellExecStderrBytes = 8 * 1024
	maxShellExecStderrBytes     = 16 * 1024
	maxShellExecErrorBytes      = 4 * 1024
	maxShellExecVisibleBytes    = 64 * 1024
)

// Blacklist patterns. These are cheap sanity checks, not a security
// perimeter — the Cube MicroVM session isolation is the real perimeter.
// The intent is to prevent the LLM from bricking its own session with a
// hallucinated one-liner (e.g. `rm -rf /`).
//
// Each entry is a compiled regexp; we return the first matching entry's
// name in the error so the LLM sees exactly why its command was rejected
// and can adjust.
var shellExecBlacklist = []struct {
	name string
	re   *regexp.Regexp
}{
	// `rm -rf /` and variants (including `rm -Rf --no-preserve-root /`).
	// Reject any rm with a recursive+force flag targeting the filesystem
	// root. We intentionally do NOT block `rm -rf /workspace/foo` — a
	// skill legitimately might clean up its scratch directory.
	{name: "rm_root", re: regexp.MustCompile(`(?i)\brm\s+(?:-[a-z]*[rR][a-z]*[fF][a-z]*|-[a-z]*[fF][a-z]*[rR][a-z]*|--recursive[^;|&]*--force|--force[^;|&]*--recursive)\s+(?:--no-preserve-root\s+)?/(?:\s|$)`)},
	// Classic fork bomb.
	{name: "fork_bomb", re: regexp.MustCompile(`:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:`)},
	// Filesystem-format / raw-device writes.
	{name: "mkfs", re: regexp.MustCompile(`(?i)\bmkfs(\.[a-z0-9]+)?\b`)},
	{name: "dd_to_device", re: regexp.MustCompile(`(?i)\bdd\b[^;|&]*\bof=/dev/`)},
	// Host-level power management. Even inside a MicroVM these serve no
	// legitimate skill purpose and would just tear down the session.
	{name: "shutdown", re: regexp.MustCompile(`(?i)\b(shutdown|reboot|halt|poweroff)\b`)},
	// Explicit backgrounding is a product decision (see file header). Trailing
	// `&` (but not `&&`) or a `nohup` prefix indicates the LLM tried to
	// detach a process.
	{name: "background_amp", re: regexp.MustCompile(`(?:^|[^&])&\s*(?:#.*)?$`)},
	{name: "nohup", re: regexp.MustCompile(`(?i)(^|[;|&\s])nohup\b`)},
}

// Tool schema

var shellExecTool = BaseTool{
	name: ToolShellExec,
	description: `在当前会话隔离的远程沙箱内执行 Shell 命令。

## 用法
可以查看文件、搜索、变换数据、运行程序、管理依赖、安装必要系统库并检查产物。
优先已有 find/ls、cat/head/tail/sed、grep/awk、file。遇到 127 不为 tree 或编辑器等检查工具 apt-get install，包随会话消失。
<sandbox_attachments> 的附件恢复到 /workspace/input，按只读处理，生成文件写 /workspace/output。
额外 Python 包用 python3 -m pip install --target /workspace/.skill-packages/<skill> ...，不修改安装后只读的 /opt/weknora/tenant/skills。apt-get 仅用于当前任务确实需要的系统库。
适用于直接执行命令、查看包括系统路径在内的沙箱目录或文本、管道、解压、编译运行以及准备后续技能输入。

## 不适用
- 不用裸 python3 -c / node -e 判断技能依赖或检查技能生成的 docx/pptx/xlsx；系统 Python 没有 docx、pptx、pandas 等技能包。不要在系统装这些包或改成 .venv/bin/python -c 重复相同代码；用 write_sandbox_file 写脚本，再 execute_skill_script。read_skill 可查技能环境。
- 不对 /opt/weknora/tenant/skills 执行 chown/chmod/ensurepip/pip install。uv venv 常没有 pip；可选包装入会话 .skill-packages，再执行技能，或请用户重新安装技能。
- 不用 & 或 nohup 后台运行，执行是同步的。
- 大文件通过 write_sandbox_file，不用 cat、heredoc、python -c；小修改用 edit_sandbox_file。
- 不用 ls/find/cat/file 探查技能脚本；read_skill(skill_name) 已列出。技能目录含 .venv/node_modules；已有 .cjs/.js/.py 路径就是脚本，可直接执行技能。

## 参数
- command（必填）：/bin/bash -l -c 执行的单行命令，支持管道、重定向、&& / ||。保持短小，长脚本用写文件工具。
- work_dir：默认 /workspace，不存在时创建。
- timeout_sec：默认 120 秒，最多 600；较大安装可能需最大值。
- max_output_bytes：stdout 默认 16384，最多 65536。stderr 默认 8192，通过 max_stderr_bytes 最多 16384；总可见输出最多 65536。
- env：附加环境变量，如 {"PIP_INDEX_URL":"https://mirrors.example.com/pypi/simple"}。
- skill_name：可选，将当前调用者对应技能环境变量仅注入本命令进程，不持久保存；手工执行需要技能凭据的命令时用，普通命令省略。

## 输出
- exit_code 为 0 成功，非 0 是程序失败而非工具失败；检查 stderr 再决定调整、重试或说明。
- stdout / stderr 会截断，保留末尾以显示关键错误；二进制不返回模型，放 /workspace/output 供 ArtifactCollector 收集。
- 向用户展示文件使用 ![description](sandbox:<file name>)，只填精确文件名，不含目录；图片行内展示，图表、表格、文档显示预览卡片。裸文件名和 /workspace/output/... 不会解析。
- duration_ms 为实际耗时。

## 隔离
命令在会话 MicroVM 中，仅影响本会话，不影响主机或其他会话。rm -rf /、fork bomb、mkfs、shutdown 等明显破坏操作预先拒绝；清理自身临时目录如 rm -rf /workspace/tmp 可行。
只有沙箱提供 Cube、E2B 或 Docker 命令执行器时可用，命令不在产品主机运行。`,
	schema: utils.GenerateSchema[ShellExecInput](),
}

// ShellExecInput defines the input parameters for shell_exec.
type ShellExecInput struct {
	// Command is the shell command to execute. Runs under `/bin/bash -l -c`.
	Command string `json:"command" jsonschema:"单行 Shell 命令，支持管道和 &&，使用 /bin/bash -l -c 执行。"`
	// WorkDir is the working directory for the command; defaults to /workspace.
	WorkDir string `json:"work_dir,omitempty" jsonschema:"工作目录，默认 /workspace，不存在时创建。"`
	// TimeoutSec caps execution time. Zero uses the default (120s); the
	// value is hard-capped at 600s regardless of what the LLM requests.
	TimeoutSec int `json:"timeout_sec,omitempty" jsonschema:"单次超时秒数，默认 120，最多 600。"`
	// MaxOutputBytes caps returned stdout. Stderr has an independent smaller
	// fixed budget, and the complete model-visible output is capped at 64 KiB.
	MaxOutputBytes int `json:"max_output_bytes,omitempty" jsonschema:"stdout 返回字节数，默认 16384，最多 65536；stderr 默认 8192，最多 16384；总可见输出最多 65536。"`
	// MaxStderrBytes caps returned stderr independently from stdout.
	MaxStderrBytes int `json:"max_stderr_bytes,omitempty" jsonschema:"stderr 返回字节数，默认 8192，最多 16384。"`
	// Env carries extra environment variables merged into the shell's env.
	Env map[string]string `json:"env,omitempty" jsonschema:"可选附加环境变量，例如 {\"PIP_INDEX_URL\":\"https://mirrors.example.com/pypi/simple\"}。"`
	// SkillName, when set, pulls that skill's scoped environment variables
	// (API keys) into this one command's process only. Resolution
	// reuses the same SkillEnvResolver path as execute_skill_script, so values
	// are per-caller (taken from ctx) and never persist. Omitting it leaves
	// shell_exec's behaviour unchanged.
	SkillName string `json:"skill_name,omitempty" jsonschema:"可选技能名称，仅向本命令进程注入该技能环境变量，与 execute_skill_script 使用相同解析；普通命令省略。"`
}

// SandboxInstallCommandExecutor is the privileged counterpart of
// SandboxCommandExecutor, satisfied by *sandbox.SessionBoundManager via
// sandbox.SessionInstallShellExecutor. It exists as its own named type so the
// install privilege can only be handed over deliberately: nothing that merely
// implements ExecShellCommand can be mistaken for it.
type SandboxInstallCommandExecutor interface {
	ExecShellCommandWithOptions(
		ctx context.Context,
		sessionID string,
		command string,
		opts sandbox.ShellExecOptions,
	) (*sandbox.ExecuteResult, error)
}

// installShellExecutor adapts the privileged executor to the plain executor
// contract the tool speaks, stamping every call as root with the skills image
// root writable. The install agent's whole job is to install dependencies into
// that image, which the default user cannot write.
type installShellExecutor struct {
	inner SandboxInstallCommandExecutor
}

func (e installShellExecutor) ExecShellCommand(
	ctx context.Context,
	sessionID string,
	command string,
	workDir string,
	timeout time.Duration,
	env map[string]string,
) (*sandbox.ExecuteResult, error) {
	return e.inner.ExecShellCommandWithOptions(ctx, sessionID, command, sandbox.ShellExecOptions{
		WorkDir:         workDir,
		Timeout:         timeout,
		Env:             env,
		AllowSkillsRoot: true,
		AsRoot:          true,
	})
}

// ShellExecTool executes shell commands inside the session's sandbox.
type ShellExecTool struct {
	BaseTool
	executor SandboxCommandExecutor
	// workDirRoots are the directories work_dir may point inside. Ordinary
	// sessions get /workspace only; install mode adds the skills image root.
	workDirRoots []string
	// defaultTimeout is applied when the caller omits timeout_sec. Ordinary
	// sessions keep the 120s default; install mode uses the 10-minute cap
	// because dependency installs routinely exceed two minutes.
	defaultTimeout time.Duration
	// envResolver, when non-nil, lets a call carrying SkillName pull that
	// skill's per-caller env into the one command it runs. Nil means no skill
	// env is ever injected — identical to today's behaviour.
	envResolver skills.SkillEnvResolver
	// envCapture, when non-nil, records declared skill credentials a
	// successful ordinary command already used so the next named run can
	// inject them. Install-mode tools never invoke it.
	envCapture SkillEnvCapture
}

// SkillEnvCapture records NAME=value pairs a successful shell_exec already
// used for one skill. The tools package does not persist them; the agent
// service supplies the write. Values must not be logged by the caller.
type SkillEnvCapture func(ctx context.Context, skillName string, pairs map[string]string)

// NewShellExecTool constructs the tool. `executor` MUST NOT be nil:
// callers should feature-gate registration when the sandbox backend
// does not support ad-hoc shell execution (i.e. is not Cube).
func NewShellExecTool(executor SandboxCommandExecutor, envResolver skills.SkillEnvResolver) *ShellExecTool {
	return &ShellExecTool{
		BaseTool:     shellExecTool,
		executor:     executor,
		envResolver:  envResolver,
		workDirRoots: []string{defaultShellExecWorkDir},
	}
}

// NewInstallShellExecTool constructs the install-mode variant: commands run as
// root and may work inside the skills image root. It is registered only for
// the built-in skill installer agent (see AgentConfig.SkillInstallMode).
func NewInstallShellExecTool(executor SandboxInstallCommandExecutor) *ShellExecTool {
	base := shellExecTool
	base.description = installShellExecDescription()
	return &ShellExecTool{
		BaseTool:       base,
		executor:       installShellExecutor{inner: executor},
		workDirRoots:   []string{defaultShellExecWorkDir, sandbox.SkillsImageRoot},
		defaultTimeout: shellExecMaxTimeout,
	}
}

// installShellExecDescription replaces the session-agent "use write_sandbox_file"
// guidance. That tool is not registered in install mode, and the files this
// agent must write sit under the skills image root, which write_sandbox_file
// cannot accept.
func installShellExecDescription() string {
	return `以 root 身份在技能安装沙箱执行 Shell 命令。
这是唯一工具，write_sandbox_file / edit_sandbox_file / list_sandbox_files / read_sandbox_file 均不可用。
work_dir 允许设置为 /opt/weknora/tenant/skills 下的技能目录。
用短重定向写小文件，包括 .weknora/requirements.json，例如 mkdir -p .weknora && cat > .weknora/requirements.json <<'EOF'。
不要调用 write_sandbox_file，它只支持快照前会被清空的 /workspace。
Python 可选依赖安装到技能 .venv，Node 安装到 node_modules，优先 uv pip install / python3 -m venv。
- command：必填，/bin/bash -l -c 执行的单行命令。
- work_dir：可选，默认 /workspace，也允许技能目录。
- timeout_sec：可选，默认 600 秒。
返回 exit_code、stdout、stderr，非 0 不代表工具失败；阅读 stderr 后调整。`
}

// WithEnvCapture attaches an optional capture hook. A nil hook is a no-op so
// callers can pass the wiring result through without a nil check.
func (t *ShellExecTool) WithEnvCapture(capture SkillEnvCapture) *ShellExecTool {
	if t != nil {
		t.envCapture = capture
	}
	return t
}

// OutputLimitChars lets ToolRegistry preserve shell_exec's explicitly bounded,
// caller-configurable output instead of applying its lower generic limit again.
func (t *ShellExecTool) OutputLimitChars(args json.RawMessage) int {
	return maxShellExecVisibleBytes
}

// Execute runs the requested command inside the current session's sandbox.
func (t *ShellExecTool) Execute(ctx context.Context, args json.RawMessage) (*types.ToolResult, error) {
	logger.Infof(ctx, "[Tool][ShellExec] Execute started")

	var input ShellExecInput
	if err := json.Unmarshal(args, &input); err != nil {
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to parse args: %v", err),
		}, nil
	}

	if t.executor == nil {
		return &types.ToolResult{
			Success: false,
			Error:   "shell_exec is not available in this deployment (remote sandbox required)",
		}, nil
	}

	command := strings.TrimSpace(input.Command)
	if command == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "command is required",
		}, nil
	}
	if len(command) > shellExecMaxCommandBytes {
		return &types.ToolResult{
			Success: false,
			Error: fmt.Sprintf(
				"command too long (%d bytes; max %d). Put the file in write_sandbox_file, then run it with shell_exec",
				len(command), shellExecMaxCommandBytes,
			),
		}, nil
	}
	if reason := checkShellExecBlacklist(command); reason != "" {
		logger.Warnf(ctx, "[Tool][ShellExec] rejected by blacklist: %s command=%q",
			reason, maskCommandAssignments(command))
		return &types.ToolResult{
			Success: false,
			Error:   fmt.Sprintf("command rejected by shell_exec safety guard: %s", reason),
		}, nil
	}
	sessionID := resolveSessionID(ctx)
	if sessionID == "" {
		return &types.ToolResult{
			Success: false,
			Error:   "no session ID in context; shell_exec must run inside an agent turn",
		}, nil
	}

	workDir := strings.TrimSpace(input.WorkDir)
	if workDir == "" {
		workDir = defaultShellExecWorkDir
	}
	cleanWorkDir := path.Clean(workDir)
	if !t.workDirAllowed(cleanWorkDir) {
		return &types.ToolResult{
			Success: false,
			Error: fmt.Sprintf(
				"work_dir %q is outside the allowed sandbox roots %s",
				input.WorkDir, strings.Join(t.allowedWorkDirRoots(), ", "),
			),
		}, nil
	}
	workDir = cleanWorkDir

	timeout := t.defaultTimeout
	if timeout <= 0 {
		timeout = defaultShellExecTimeout
	}
	if input.TimeoutSec > 0 {
		timeout = time.Duration(input.TimeoutSec) * time.Second
	}
	if timeout > shellExecMaxTimeout {
		timeout = shellExecMaxTimeout
	}

	logger.Infof(ctx, "[Tool][ShellExec] session=%s work_dir=%s timeout=%s command=%q",
		sessionID, workDir, timeout, maskCommandAssignments(command))

	// The caller's config-wide variables apply to every command; a skill's
	// declared credentials are added only when the model names the skill.
	// Values come from ctx (the current principal), live only for this process,
	// and are overlaid without displacing anything the model passed via env.
	env := input.Env
	// supplied carries the values this one call brings with it, from the env
	// parameter and from NAME=value assignments in the command. They satisfy a
	// required variable that is not stored yet, which is what makes "tell me
	// the key in chat" work, and they are the only values capture may persist.
	supplied := collectUsedSkillEnv(input.Command, input.Env)
	if t.envResolver != nil {
		resolved, missing, rerr := t.envResolver.ResolveEnv(ctx, input.SkillName)
		if rerr != nil {
			return &types.ToolResult{
				Success: false,
				Error:   fmt.Sprintf("failed to resolve environment variables: %v", rerr),
			}, nil
		}
		missing = stillMissing(missing, supplied)
		if len(missing) > 0 {
			return &types.ToolResult{
				Success: false,
				Error: fmt.Sprintf(
					"技能 %q 需要尚未设置的环境变量 %s。"+
						"请用户提供这些值并通过本次调用的 env 传入，"+
						"或让用户在设置 → 沙箱密钥中填写。",
					input.SkillName, strings.Join(missing, ", ")),
			}, nil
		}
		if len(resolved) > 0 && env == nil {
			env = make(map[string]string)
		}
		// Model-supplied env wins over resolved values, matching the
		// execute_skill_script contract.
		skills.ApplyResolvedEnv(env, resolved)
		// A name that already resolved is one the workspace or this caller has
		// filled in. Capture must not touch it: otherwise a hallucinated
		// `export KEY=test` would overwrite a working stored credential.
		supplied = dropResolvedNames(supplied, resolved)
	}
	res, err := t.executor.ExecShellCommand(ctx, sessionID, command, workDir, timeout, env)
	if err != nil {
		logger.Warnf(ctx, "[Tool][ShellExec] execution error: session=%s err=%v", sessionID, err)
		errorText, _ := truncateShellStream(fmt.Sprintf("shell_exec failed: %v", err), maxShellExecErrorBytes)
		return &types.ToolResult{
			Success: false,
			Error:   errorText,
		}, nil
	}

	t.maybeCaptureSkillEnv(ctx, input.SkillName, supplied, res)

	outputLimit := resolveShellOutputLimit(input.MaxOutputBytes)
	stderrLimit := resolveShellStderrLimit(input.MaxStderrBytes)
	stdout, stdoutTruncated, stdoutBinary := prepareShellStream(res.Stdout, outputLimit)
	stderr, stderrTruncated, stderrBinary := prepareShellStream(res.Stderr, stderrLimit)
	errorText, errorTruncated := truncateShellStream(res.Error, maxShellExecErrorBytes)
	truncated := stdoutTruncated || stderrTruncated || errorTruncated

	// Human-readable summary for the LLM.
	var b strings.Builder
	b.WriteString(fmt.Sprintf("=== Shell Exec (session=%s) ===\n\n", sessionID))
	b.WriteString(fmt.Sprintf("**Command**: `%s`\n", command))
	b.WriteString(fmt.Sprintf("**Work Dir**: %s\n", workDir))
	b.WriteString(fmt.Sprintf("**Exit Code**: %d\n", res.ExitCode))
	b.WriteString(fmt.Sprintf("**Duration**: %v\n", res.Duration))
	if res.Killed {
		b.WriteString("**Killed**: yes (timeout or terminated)\n")
	}
	if truncated {
		b.WriteString("**Truncated**: yes (head+tail kept; run `tail -n 200 <logfile>` inside the sandbox for full output)\n")
	}
	if stdoutBinary || stderrBinary {
		b.WriteString("**Binary Output Suppressed**: yes (write binary files to the artifact output directory for download)\n")
	}
	b.WriteString("\n")

	if stdout != "" {
		b.WriteString("## Stdout\n\n```\n")
		b.WriteString(stdout)
		if !strings.HasSuffix(stdout, "\n") {
			b.WriteString("\n")
		}
		b.WriteString("```\n\n")
	}
	if stderr != "" {
		b.WriteString("## Stderr\n\n```\n")
		b.WriteString(stderr)
		if !strings.HasSuffix(stderr, "\n") {
			b.WriteString("\n")
		}
		b.WriteString("```\n\n")
	}
	if errorText != "" {
		b.WriteString("## Error\n\n")
		b.WriteString(errorText)
		b.WriteString("\n")
	}
	if hint := shellExecRecoveryHint(res.ExitCode, command, stderr); hint != "" {
		b.WriteString(hint)
		b.WriteString("\n")
	}
	visibleOutput := b.String()
	visibleOutput, totalTruncated := truncateShellStream(visibleOutput, maxShellExecVisibleBytes)
	truncated = truncated || errorTruncated || totalTruncated

	// The tool call itself succeeds even when the shell command exits non-zero:
	// the LLM needs stderr/exit_code as first-class signals to iterate. We
	// only mark Success=false when a wire-level problem prevented the command
	// from running at all (already handled above via err != nil).
	resultData := map[string]interface{}{
		"display_type":           "shell_exec",
		"session_id":             sessionID,
		"command":                command,
		"work_dir":               workDir,
		"exit_code":              res.ExitCode,
		"stdout":                 stdout,
		"stderr":                 stderr,
		"duration_ms":            res.Duration.Milliseconds(),
		"killed":                 res.Killed,
		"truncated":              truncated,
		"stdout_truncated":       stdoutTruncated,
		"stderr_truncated":       stderrTruncated,
		"stdout_binary":          stdoutBinary,
		"stderr_binary":          stderrBinary,
		"stdout_bytes":           len(res.Stdout),
		"stderr_bytes":           len(res.Stderr),
		"stdout_original_bytes":  len(res.Stdout),
		"stdout_returned_bytes":  len(stdout),
		"stderr_original_bytes":  len(res.Stderr),
		"stderr_returned_bytes":  len(stderr),
		"error_original_bytes":   len(res.Error),
		"error_returned_bytes":   len(errorText),
		"error_truncated":        errorTruncated,
		"total_truncated":        totalTruncated,
		"visible_original_bytes": b.Len(),
		"visible_returned_bytes": len(visibleOutput),
		"max_output_bytes":       outputLimit,
		"max_stderr_bytes":       stderrLimit,
	}

	logger.Infof(ctx, "[Tool][ShellExec] session=%s exit=%d duration=%v killed=%v truncated=%v",
		sessionID, res.ExitCode, res.Duration, res.Killed, truncated)

	return &types.ToolResult{
		Success: true,
		Output:  visibleOutput,
		Data:    resultData,
	}, nil
}

// maybeCaptureSkillEnv persists the credentials this call brought with it, so
// the next run of the same skill does not have to ask again.
//
// The skill must be named explicitly: inferring it from a path in the command
// would let any successful command that merely mentions a skill directory write
// into that skill's credentials. pairs has already had every resolved name
// removed, so this only ever fills a blank.
func (t *ShellExecTool) maybeCaptureSkillEnv(
	ctx context.Context, skillName string, pairs map[string]string, res *sandbox.ExecuteResult,
) {
	if t == nil || t.envCapture == nil || t.isInstallMode() {
		return
	}
	if res == nil || res.ExitCode != 0 {
		return
	}
	skillName = strings.TrimSpace(skillName)
	if !sandbox.IsValidSkillName(skillName) || len(pairs) == 0 {
		return
	}
	t.envCapture(ctx, skillName, pairs)
}

// stillMissing removes from missing every name this call supplied itself.
func stillMissing(missing []string, supplied map[string]string) []string {
	if len(missing) == 0 || len(supplied) == 0 {
		return missing
	}
	out := missing[:0:0]
	for _, name := range missing {
		if strings.TrimSpace(supplied[name]) == "" {
			out = append(out, name)
		}
	}
	return out
}

// dropResolvedNames returns the supplied values that nothing has stored yet.
func dropResolvedNames(supplied, resolved map[string]string) map[string]string {
	if len(supplied) == 0 || len(resolved) == 0 {
		return supplied
	}
	out := make(map[string]string, len(supplied))
	for name, value := range supplied {
		if _, stored := resolved[name]; stored {
			continue
		}
		out[name] = value
	}
	return out
}

func (t *ShellExecTool) isInstallMode() bool {
	for _, root := range t.workDirRoots {
		if root == sandbox.SkillsImageRoot {
			return true
		}
	}
	return false
}

// allowedWorkDirRoots defaults to /workspace so a zero-value tool (or one
// built before install mode existed) keeps the ordinary contract.
func (t *ShellExecTool) allowedWorkDirRoots() []string {
	if len(t.workDirRoots) == 0 {
		return []string{defaultShellExecWorkDir}
	}
	return t.workDirRoots
}

func (t *ShellExecTool) workDirAllowed(cleanWorkDir string) bool {
	for _, root := range t.allowedWorkDirRoots() {
		if isUnderRoot(cleanWorkDir, root) {
			return true
		}
	}
	return false
}

func shellExecRecoveryHint(exitCode int, command, stderr string) string {
	var parts []string
	if h := shellCommandNotFoundHint(exitCode, command, stderr); h != "" {
		parts = append(parts, h)
	}
	if isFrozenSkillVenvFailure(stderr) {
		parts = append(parts, "提示："+frozenSkillTreeGuidance(skillNameFromShellCommand(command)))
		return strings.Join(parts, "\n")
	}
	if h := shellMissingModuleHint(command, stderr); h != "" {
		parts = append(parts, h)
	} else if h := shellInlineEvalHint(command); h != "" {
		parts = append(parts, h)
	}
	return strings.Join(parts, "\n")
}

func shellMissingModuleHint(command, stderr string) string {
	if !isMissingInterpreterModule(stderr) {
		return ""
	}
	skill := skillNameFromShellCommand(command)
	skillArg := "skill_name=<提供这些依赖包的技能名>"
	if skill != "" {
		skillArg = fmt.Sprintf("skill_name=%q", skill)
	}
	return "提示：系统 python3 / node 无法访问技能依赖包（docx、pptx、pandas 等）。" +
		"不要在本会话中用 pip install 安装这些包，也不要将同一程序粘贴到 " +
		"`.venv/bin/python -c`。请使用 write_sandbox_file 写入脚本，然后调用 " +
		"execute_skill_script(" + skillArg + ", script_path=/workspace/output/inspect.py)."
}

func isMissingInterpreterModule(stderr string) bool {
	if isFrozenSkillVenvFailure(stderr) {
		return false
	}
	return strings.Contains(stderr, "ModuleNotFoundError") ||
		strings.Contains(stderr, "No module named") ||
		strings.Contains(stderr, "Cannot find module") ||
		strings.Contains(stderr, "MODULE_NOT_FOUND")
}

func shellInlineEvalHint(command string) string {
	if !isInlineInterpreterProgram(command) {
		return ""
	}
	skill := skillNameFromShellCommand(command)
	skillArg := "skill_name=..."
	if skill != "" {
		skillArg = fmt.Sprintf("skill_name=%q", skill)
	}
	return "提示：不要通过 python -c / node -e 传入多行程序（包括技能的虚拟环境）。" +
		"请使用 write_sandbox_file 写入脚本，然后调用 " +
		"execute_skill_script(" + skillArg + ", script_path=/workspace/output/inspect.py)."
}

func isInlineInterpreterProgram(command string) bool {
	if !hasInlineEvalFlag(command) {
		return false
	}
	return len(command) >= 280 || strings.Count(command, "\n") >= 2
}

func hasInlineEvalFlag(command string) bool {
	lower := strings.ToLower(command)
	pythonEval := strings.Contains(lower, "python") && strings.Contains(lower, " -c")
	nodeEval := strings.Contains(lower, "node") &&
		(strings.Contains(lower, " -e") || strings.Contains(lower, " --eval"))
	return pythonEval || nodeEval
}

func skillNameFromShellCommand(command string) string {
	idx := strings.Index(command, sandbox.SkillsImageRoot+"/")
	if idx < 0 {
		return ""
	}
	rest := command[idx:]
	if end := strings.IndexAny(rest, " \t\"'"); end > 0 {
		rest = rest[:end]
	}
	name, inImage := sandbox.SkillNameFromImagePath(rest)
	if !inImage {
		return ""
	}
	return name
}

// shellCommandNotFoundHint steers the model off apt-get install tree/editors
// after a 127. Those packages are not in the slim image (`file` is), and a
// session install is thrown away.
func shellCommandNotFoundHint(exitCode int, command, stderr string) string {
	if exitCode != 127 && !strings.Contains(strings.ToLower(stderr), "command not found") {
		return ""
	}
	missing := inferredMissingCommand(command, stderr)
	switch missing {
	case "tree", "less", "more", "nano", "vim", "vi":
		return "提示：默认沙箱镜像中没有 `" + missing + "`。请使用 find/ls、head、sed 和 `file`。技能脚本请用 `read_skill` / `execute_skill_script`。不要用 apt-get install 安装检查工具，会话结束后安装的包会被丢弃。"
	default:
		return "提示：该命令尚未安装。优先使用 find、ls、head、tail、cat、sed、grep、awk、file。只有本任务确实需要某个依赖包时才使用 apt-get install，会话结束后安装的包会被丢弃。"
	}
}

func inferredMissingCommand(command, stderr string) string {
	lower := strings.ToLower(stderr)
	const marker = ": command not found"
	if i := strings.Index(lower, marker); i > 0 {
		head := strings.TrimSpace(stderr[:i])
		if j := strings.LastIndexAny(head, ": \t"); j >= 0 {
			head = strings.TrimSpace(head[j+1:])
		}
		if head != "" {
			return path.Base(head)
		}
	}
	fields := strings.Fields(command)
	if len(fields) == 0 {
		return ""
	}
	return path.Base(fields[0])
}

func resolveShellOutputLimit(requested int) int {
	if requested <= 0 {
		return defaultShellExecOutputBytes
	}
	if requested > maxShellExecOutputBytes {
		return maxShellExecOutputBytes
	}
	return requested
}

func resolveShellStderrLimit(requested int) int {
	if requested <= 0 {
		return defaultShellExecStderrBytes
	}
	if requested > maxShellExecStderrBytes {
		return maxShellExecStderrBytes
	}
	return requested
}

// prepareShellStream suppresses binary data before it can enter ToolResult
// Output or Data. Text streams are bounded using head+tail preservation.
func prepareShellStream(s string, limit int) (output string, truncated, binary bool) {
	if isBinaryShellOutput(s) {
		return "", false, true
	}
	output, truncated = truncateShellStream(s, limit)
	return output, truncated, false
}

func isBinaryShellOutput(s string) bool {
	if s == "" {
		return false
	}
	if !utf8.ValidString(s) || strings.IndexByte(s, 0) >= 0 {
		return true
	}
	// Any non-text control byte is enough to suppress the stream. ANSI terminal
	// escapes remain allowed so ordinary colored command output stays readable.
	for _, r := range s {
		if r < 0x20 && r != '\n' && r != '\r' && r != '\t' &&
			r != '\b' && r != '\f' && r != 0x1b {
			return true
		}
	}
	return false
}

// Cleanup releases any resources.
func (t *ShellExecTool) Cleanup(ctx context.Context) error {
	return nil
}

// checkShellExecBlacklist reports a non-empty reason string when command
// matches one of the blacklist patterns. Returns "" for allowed commands.
func checkShellExecBlacklist(command string) string {
	for _, entry := range shellExecBlacklist {
		if entry.re.MatchString(command) {
			return entry.name
		}
	}
	return ""
}

// truncateShellStream reduces s to at most limit bytes by keeping the head
// and tail of the stream. The tail is prioritised because the final lines
// of a shell run almost always carry the actionable diagnostic (success
// marker, traceback, "ERROR: could not find matching distribution").
//
// Returns the (possibly truncated) content and a flag indicating whether
// any trimming happened.
func truncateShellStream(s string, limit int) (string, bool) {
	if limit <= 0 || len(s) <= limit {
		return s, false
	}
	// Include the marker inside the byte budget. Its omitted-byte count depends
	// on the retained size, so compute it once, then recalculate the final split.
	marker := fmt.Sprintf("\n...[truncated %d bytes]...\n", len(s)-limit)
	if len(marker) >= limit {
		return s[len(s)-limit:], true
	}
	kept := limit - len(marker)
	head := kept / 4
	tail := kept - head
	marker = fmt.Sprintf("\n...[truncated %d bytes]...\n", len(s)-head-tail)
	if len(marker) != limit-kept {
		kept = limit - len(marker)
		head = kept / 4
		tail = kept - head
	}
	var b strings.Builder
	b.Grow(limit)
	b.WriteString(s[:head])
	b.WriteString(marker)
	b.WriteString(s[len(s)-tail:])
	return b.String(), true
}
