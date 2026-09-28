#!/usr/bin/env python3
"""Fail-closed allowlist for the immutable UI release range."""
from __future__ import annotations
import json
import re
import subprocess
import sys
from pathlib import Path

SHA = re.compile(r"^[0-9a-fA-F]{40}$")
UI = ("weknora/frontend/src/assets/", "weknora/frontend/src/components/", "weknora/frontend/src/i18n/", "weknora/frontend/src/views/chat/", "weknora/frontend/src/views/knowledge/", "weknora/frontend/e2e/")
ROOT = {
    "e2e/knowledge-folder-actions.spec.ts",
    "e2e/knowledge-toolbar.spec.ts",
    "e2e/knowledge-folders.spec.ts",
    "e2e/knowledge-batch-cancel.spec.ts",
    "e2e/chat-history-feedback.spec.ts",
    "e2e/document-feedback.spec.ts",
    "e2e/session-batch-manage.spec.ts",
    "playwright.session-batch.config.ts",
    ".github/workflows/ci.yml",
    "scripts/ci/verify-ui-release-scope.py",
    "scripts/ci/verify-ui-release-scope.test.py",
    "third_party/weknora/upgrades/81142df/resolution-ledger.tsv",
    "third_party/weknora/upgrades/81142df/resolution-overrides.tsv",
    "third_party/weknora/upgrades/81142df/resolution-summary.json",
}
PROTECTED = ("backend", "billing", "payment", "checkout", "entitlement", "subscription", "auth", "openrouter", "locks", "buildruntimeconfig", "build-runtime-config")

# Reviewed presentation fixes and their accompanying files, including loading feedback.
# Delivery-policy blobs from b587a89d already governed production run 35459344687;
# carrying that identical policy forward adds no application model/runtime change.
# Pin content, not just sensitive filenames: later edits need a fresh review.
# The two documentation entries also include this clarification of the policy.
REVIEWED_UI_CONTENT = {
    # Documentation links only; retain exact-content review for channel settings.
    "weknora/frontend/src/views/integrations/IntegrationSettingsSection.vue": {"08c0c4a5da3342e0a4305ecb6ff8b7be9621b638"},
    # Embed presentation files also contain session, token, origin, and message
    # handling. Pin the exact reviewed blobs instead of broadly allowing paths.
    "weknora/frontend/public/musuw-widget.js": {"ea25bcf9e9e6b7241a15b346424b8f3f4b3ad0c3"},
    "weknora/frontend/src/views/embed/EmbedChatCore.vue": {"9b35394dab0cb71a4113410cbfb274b32f411974"},
    "weknora/frontend/src/views/embed/EmbedPage.vue": {"f20ac3e9b03f8970e49cb3c9be32b28a70752894"},
    "weknora/frontend/src/views/embed/EmbedBotMessage.vue": {"08a85705c180f0d28e34cded6a465522c0884c9f"},
    "weknora/frontend/src/views/embed/EmbedUserMessage.vue": {"47623ae286d001ce714aa4629dc366d568f6f046"},
    "scripts/ci/verify-reviewed-model-release.test.py": {"2bb3840cce83cb2c8d47ccfc2b5b7f5b2ef05898"},
    "scripts/ci/verify-reviewed-model-release.py": {"2c45c6d2fa40a70f1cc1f3fe56e58009b5e78df1"},
    "docs/MODEL_RELEASE_20260919.md": {"fa7fd465fc253a5781c8e3db700cc23fc3cc2373"},
    # Mobile presentation audit: exact content only; no auth/runtime authority.
    'weknora/frontend/index.html': {"a0a1fda49e3226a5e064bf9599c24b6a8a1356a2"},
    'weknora/frontend/src/views/platform/index.vue': {"b7476b5d28ea173f636e78895da68de26a356e57"},
    'auth/src/styles.css': {"576975befbf82c9ad56037bed4f342e4f36893d6"},
    'e2e/mobile-fixture-api.mjs': {"2c550eb1ecc0cdaff57116b0c57d5098a757c05a"},
    "e2e/mobile-layout.md": {"d8ccce7a55b6383234c60589835e2170cf0a8fff"},
    "weknora/frontend/src/hooks/useKnowledgeBase.ts": {"f61ae64f29f66e34c30734af13ad144914c7d887"},
    ".github/workflows/deploy-production.yml": {"9a76d9923b9c28de0e4175a4b88370109dc8d525", "a5971dec25b35056d796eec3c79cffd11382fc16", "11bdd2059ab4c398892f8d3aef199efabb4e9cec"},
    # The new blob only provisions the already-reviewed, bounded customer-service
    # channel secrets inside the protected storefront deploy environment. Keep
    # this exact-content pin so later workflow edits still require review.
    # 9ff30b1 adds only the public GA4 measurement ID to the storefront build;
    # analytics still requires the visitor's explicit consent in the reviewed UI.
    # fc32fcc adds reviewed canonical locale/redirect smoke checks only.
    ".github/workflows/deploy-storefront.yml": {"fc32fcc8365813f191049dca8e7c59c386ed78e9", "de051d83aab6281d0c89b2943dca87c8118fbbd1", "0bd421b23303c181500a49cdff8e141d4ac7d991", "a3426cbc189f35856ca23134c9cc94f4ed57d5fe", "6f345b6505682c959580633c5dfafb01e2d58376", "bf49f05ad8875a1b46baa863294e9b767acb9daf", "9ff30b16b8200ef2d6b7ae75ea538bcf90faa42c"},
    "README.md": {"32bfedf673e7951d615dc231ce12867a218be613"},
    "auth/e2e/background-stability.spec.ts": {"5259bb88fe9802ab6bb04ae72b7fb7664ad9e91e"},
    "auth/playwright.config.ts": {"8982318e2d188f555b20769aeb6da0d60a4b43b9"},
    "auth/src/AuthApp.test.ts": {"81938fa219bd30d2c1ad492292f393e4bac2445d"},
    "auth/src/AuthShowcase.tsx": {"96c26a6ca16ba0b5025921be26fe6765deb3592c"},
    "auth/src/LiquidEther.tsx": {"e6032911a35297b85d21dd76046d04e314ce3483"},
    "docs/DEPLOYMENT.md": {"eab3ccb887935df15ec3ea42f34cc52bdecb2b58", "0d21e1bf823277c1f12fd6ad0f13dc48b4d7195f", "bbbc7b6cd9948ab0a76de01c428e9523d2b25ca9"},
    "docs/STAGING_OPERATIONS.md": {"f2d98dfe3b6176b3f7837f0d1fafbf664f6acb19", "39a5adb3c9a9912a73b7e25bbd8f3dbc5839b863"},
    "e2e/billing-entitlement.spec.ts": {"a00142228e37eb0a8c136eabbda3bd01628c9eee"},
    "e2e/knowledge-upload.spec.ts": {"6272624c5bedf75c5cbbc2b0b72a969e960f37c5", "d519786e0a34e234dcfb2357fa5b673181388a9e"},
    "openspec/changes/deploy-isolated-staging/specs/sandbox-billing-release-gate/spec.md": {"5f89c66ff9261991a42692d8f8f16988c6fc5174", "4eb0d34d0f96341f4e55ae8913c987e0a8e02294"},
    "playwright.billing.config.ts": {"0af6c9ab3d45b26da9a2ad5b0517b0a7d4b64fe0"},
    "playwright.knowledge-upload.config.ts": {"fad968652432f48a144489a70c23b3967030c1a5", "0bb47d368da4d1c558eab3ce0db1cc1e210fc9db", "bde962ce72910dae6b2f618a5b6ba53c6104fc9c", "d44879f4afbe340c02c859ce4f3f82458db94e31"},
    "scripts/ci/validate-workflows.rb": {"5154e0d6c229af1e2180bc1026d47954ecb626af", "72062480c9e6a49c3a2dd50d5935b98436e7021a", "437c9eb6204a039c9971222f3ac8b2ee375604c7", "6abdb58e89f368b4789e09746b8eecafc963d0f6"},
    "scripts/weknora-workflow-simulation.test.sh": {"bf077e542b96ad418d13a3a8091498c05c2e72fb", "fb779bfd40c16055266bc42ceacc47bbe4df3481", "de9073a864cdaca267f713f6bfc350a7a68c4ae5", "4b7d521c2a37acec343a268e3576292a174a69cf"},
    # The exact integration release gate is policy-only. Pin every new file so
    # a later UI-scoped release may carry this reviewed policy but cannot edit it.
    "docs/INTEGRATION_RELEASE_REVIEW_20260921.md": {"7ae4207e8b43a6f26ff86e42b75299ec89bf3328"},
    "scripts/ci/verify-reviewed-integration-release.py": {"65a8f05a68460419b96b0efabde22fe587402307"},
    "scripts/ci/verify-reviewed-integration-release.test.py": {"4aae3b03abbf2bfe0a4e0955c5a6f6bd198d502b"},
    "third_party/weknora/v0.7.2-provenance.json": {"59de0f2d7797ce39b91b0d5db709ac316a2a1876", "601fb80639787f1a3ba6ab43d533608d757fada8", "8735c066f0119c55670bfa512216924ff21c8675", "a433c0d10542e136e68051a318c66d23e055bfad", "e1361c776a4e15ffb2572fe957177202055f3dcf", "161811eafbf08d8f2e76fdfc8b23b0a076b46d8b"},
    "weknora/frontend/e2e/billing-harness.html": {"51526a1a4a971fb3e9393658944c04cf5819cee9"},
    "weknora/frontend/e2e/billing-harness.ts": {"d04631889c795e31a0b3b02a222de4e2bf464d07"},
}

class Rejected(Exception):
    pass

def git(repo: Path, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(["git", "-C", str(repo), *args], capture_output=True, check=False)

def resolve(repo: Path, value: str) -> str:
    if not SHA.fullmatch(value):
        raise Rejected("commit must be a full SHA")
    result = git(repo, "rev-parse", "--verify", f"{value}^{{commit}}")
    if result.returncode or result.stdout.decode().strip().lower() != value.lower():
        raise Rejected("commit cannot be resolved")
    return value.lower()

def changed(repo: Path, baseline: str, candidate: str) -> list[str]:
    result = git(repo, "diff", "--no-ext-diff", "--raw", "--no-renames", "--diff-filter=ACDMRTUXB", "-z", baseline, candidate)
    if result.returncode:
        raise Rejected("git diff failed")
    if not result.stdout:
        return []
    if not result.stdout.endswith(b"\0"):
        raise Rejected("malformed git diff")
    tokens = result.stdout[:-1].split(b"\0")
    if len(tokens) % 2:
        raise Rejected("malformed git diff")
    paths = []
    for i in range(0, len(tokens), 2):
        try:
            fields = tokens[i].decode("ascii").lstrip(":").split()
            path = tokens[i + 1].decode("utf-8")
        except UnicodeDecodeError as error:
            raise Rejected("non-utf8 git diff") from error
        if len(fields) != 5 or fields[-1] not in {"A", "C", "D", "M", "R", "T", "U", "X", "B"}:
            raise Rejected("unsupported git diff")
        if fields[0] in {"120000", "160000"} or fields[1] in {"120000", "160000"}:
            raise Rejected("symlink or submodule change")
        if "000000" not in fields[:2] and fields[0] != fields[1]:
            raise Rejected("file mode change")
        if not path:
            raise Rejected("empty git path")
        paths.append(path)
    return paths

def check_path(path: str) -> None:
    if path.startswith("/") or "\\" in path or any(part in {"", ".", ".."} for part in path.split("/")):
        raise Rejected("unsafe path")
    if path in REVIEWED_UI_CONTENT:
        return
    lowered = path.lower()
    if any(term in lowered for term in PROTECTED):
        raise Rejected("protected path")
    if path == "package.json" or path.startswith("storefront/") or path in ROOT or path.startswith(UI):
        return
    raise Rejected("path outside UI scope")

def package_ok(repo: Path, baseline: str, candidate: str) -> bool:
    before_result = git(repo, "show", f"{baseline}:package.json")
    after_result = git(repo, "show", f"{candidate}:package.json")
    if before_result.returncode or after_result.returncode:
        raise Rejected("package JSON missing")
    try:
        before, after = json.loads(before_result.stdout), json.loads(after_result.stdout)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise Rejected("invalid package JSON") from error
    if not isinstance(before, dict) or not isinstance(after, dict) or not isinstance(before.get("scripts"), dict) or not isinstance(after.get("scripts"), dict):
        raise Rejected("invalid package scripts")
    b_scripts, a_scripts = before["scripts"], after["scripts"]
    if not isinstance(a_scripts.get("app:e2e:batch"), str) or b_scripts.get("app:e2e:batch") == a_scripts.get("app:e2e:batch"):
        raise Rejected("batch script did not change")
    before["scripts"] = {k: v for k, v in b_scripts.items() if k != "app:e2e:batch"}
    after["scripts"] = {k: v for k, v in a_scripts.items() if k != "app:e2e:batch"}
    return before == after

def verify(repo: Path, baseline_arg: str, candidate_arg: str) -> tuple[str, str, int]:
    baseline, candidate = resolve(repo, baseline_arg), resolve(repo, candidate_arg)
    if git(repo, "merge-base", "--is-ancestor", baseline, candidate).returncode:
        raise Rejected("baseline is not an ancestor")
    paths = changed(repo, baseline, candidate)
    for path in paths:
        check_path(path)
        if path in REVIEWED_UI_CONTENT:
            content = git(repo, "rev-parse", "--verify", f"{candidate}:{path}")
            if content.returncode or content.stdout.decode().strip() not in REVIEWED_UI_CONTENT[path]:
                raise Rejected("unreviewed content at a reviewed UI path")
    if "package.json" in paths and not package_ok(repo, baseline, candidate):
        raise Rejected("package changed outside batch script")
    return baseline, candidate, len(paths)

def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: verify-ui-release-scope.py BASELINE_SHA CANDIDATE_SHA", file=sys.stderr)
        return 2
    try:
        root_result = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, check=False)
        if root_result.returncode or not root_result.stdout.strip():
            raise Rejected("not a git repository")
        root = Path(root_result.stdout.decode().strip()).resolve()
        baseline, candidate, count = verify(root, argv[1], argv[2])
    except (OSError, Rejected) as error:
        print(f"ui release scope rejected: {error}", file=sys.stderr)
        return 1
    print(f"count={count} baseline={baseline} candidate={candidate}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
