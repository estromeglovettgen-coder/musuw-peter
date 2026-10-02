package tools

import (
	"strconv"
	"strings"

	"github.com/Tencent/WeKnora/internal/agent/skills"
	"github.com/Tencent/WeKnora/internal/sandbox"
)

// Session skill trees are snapshotted read-only (root-owned, mode 555). uv
// venv often has no pip. Skills that lazily pip-install extras on first use
// cannot write that venv; session agents must use the /workspace overlay
// instead of chown / ensurepip / pip into /opt/weknora/tenant/skills.
//
// That rule is enforced by the filesystem, not by inspecting commands: the
// kernel already refuses the write. What the model needs is a readable reason
// for the EROFS / EPERM / "No module named pip" it gets back, which is what
// the hints below attach after the fact. An up-front command blacklist was
// tried and removed: matching `pip install` next to the skills root also
// rejected the recovery command this guidance recommends (installing into the
// overlay with `-r <skill>/requirements.txt`), while any indirection through a
// shell variable walked straight past it.

func frozenSkillTreeGuidance(skillName string) string {
	pkgDir := sandbox.SessionSkillPackageDir(skillName)
	skillArg := "skill_name=<skill>"
	if skillName != "" {
		skillArg = "skill_name=" + strconv.Quote(skillName)
	}
	return sandbox.SkillsImageRoot + " 下的技能目录在安装后被固定为只读，归 root 所有；uv 虚拟环境通常没有 pip。" +
		"不要对其执行 chown、chmod、ensurepip，也不要向其内部 pip/npm install。" +
		"按需依赖（python-docx、python-pptx 等）应安装到会话的可写目录：" +
		"`python3 -m pip install --target " + pkgDir + " <package>` " +
		"（使用系统 python3，而非技能虚拟环境），然后调用 execute_skill_script(" + skillArg + ")。" +
		"也可以让用户重新安装技能，将额外依赖预装进镜像。"
}

func isFrozenSkillVenvFailure(stderr string) bool {
	if stderr == "" {
		return false
	}
	lower := strings.ToLower(stderr)
	if strings.Contains(stderr, "No module named pip") ||
		strings.Contains(stderr, "No module named 'pip'") {
		return true
	}
	if strings.Contains(lower, "read-only file system") ||
		strings.Contains(lower, "erofs") ||
		strings.Contains(lower, "read-only filesystem") {
		return true
	}
	return strings.Contains(lower, "permission denied") && strings.Contains(lower, ".venv")
}

func skillOnDemandInstallHint(skillName, scriptPath, stdout, stderr string) string {
	installer := skills.IsOnDemandInstallerPath(scriptPath)
	failedInstaller := installer &&
		(isFrozenSkillVenvFailure(stderr) || strings.Contains(strings.ToLower(stdout+stderr), "安装失败") ||
			strings.Contains(strings.ToLower(stdout+stderr), "install failed"))
	if !failedInstaller && !isFrozenSkillVenvFailure(stderr) {
		return ""
	}
	msg := "提示：" + frozenSkillTreeGuidance(skillName)
	if installer {
		msg += "跳过此安装脚本，执行技能的实际业务脚本。"
	}
	return msg
}

func skillMissingPackageHint(skillName, stderr string) string {
	if !isMissingInterpreterModule(stderr) {
		return ""
	}
	return "提示：该技能的只读虚拟环境中没有此依赖包。" +
		frozenSkillTreeGuidance(skillName)
}
