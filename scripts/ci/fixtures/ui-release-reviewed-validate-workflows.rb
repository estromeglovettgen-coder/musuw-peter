#!/usr/bin/env ruby
# frozen_string_literal: true

# Syntax and policy contract for the repository's delivery workflows. This is
# intentionally dependency-free so a clean GitHub runner can validate YAML
# before installing application dependencies.

require "psych"
require "json"

ROOT = File.expand_path("../..", __dir__)
WORKFLOW_DIR = File.join(ROOT, ".github", "workflows")
EXPECTED = %w[ci.yml deploy-storefront.yml deploy-production.yml deploy-operations.yml].freeze

def fail_contract(message)
  warn "workflow contract: #{message}"
  exit 1
end

def parse_yaml(path)
  Psych.safe_load(File.read(path), aliases: false, permitted_classes: [], permitted_symbols: [])
rescue Psych::Exception => error
  fail_contract "#{path}: invalid YAML: #{error.message}"
end

def root_key(document, key)
  # Psych follows YAML 1.1 and parses the unquoted GitHub `on` key as true.
  document[key] || (key == "on" ? document[true] : nil)
end

def assert_hash(value, label)
  fail_contract "#{label} must be a mapping" unless value.is_a?(Hash)
end

def assert_trigger(document, label)
  trigger = root_key(document, "on")
  fail_contract "#{label} has no on trigger" if trigger.nil?
  fail_contract "#{label} uses pull_request_target" if trigger.to_s.include?("pull_request_target")
end

def walk_uses(value, result = [])
  case value
  when Hash
    value.each_value { |child| walk_uses(child, result) }
  when Array
    value.each { |child| walk_uses(child, result) }
  when String
    result << value if value.start_with?("actions/", "astral-sh/", "cloudflare/", "docker/") && value.include?("@")
  end
  result
end

paths = EXPECTED.map { |name| File.join(WORKFLOW_DIR, name) }
paths.each { |path| fail_contract "missing #{path}" unless File.file?(path) }

documents = paths.to_h { |path| [File.basename(path), parse_yaml(path)] }
expected_runner = "ubuntu-24.04"
documents.each do |name, document|
  assert_hash(document, name)
  assert_trigger(document, name)
  permissions = document["permissions"]
  assert_hash(permissions, "#{name}.permissions")
  expected_permissions = case name
  when "deploy-storefront.yml"
    { "contents" => "read", "actions" => "read" }
  when "deploy-production.yml", "deploy-operations.yml"
    { "contents" => "read", "actions" => "read", "deployments" => "read" }
  else
    { "contents" => "read" }
  end
  fail_contract "#{name} grants permissions outside its contract" unless permissions == expected_permissions
  walk_uses(document).each do |reference|
    ref = reference.split("@", 2).last
    fail_contract "#{name} has an unpinned action #{reference}" unless ref.match?(%r{\Av\d+(?:\.\d+(?:\.\d+)?)?\z|\A[0-9a-f]{40}\z})
  end
  document.fetch("jobs").each do |job_name, job|
    next unless job.is_a?(Hash)
    next if name == "deploy-production.yml"

    fail_contract "#{name}.jobs.#{job_name} must use the pinned standard GitHub-hosted runner" unless job["runs-on"] == expected_runner
  end
end

ci = documents.fetch("ci.yml")
ci_on = root_key(ci, "on")
fail_contract "ci.yml must run on pull requests" unless ci_on.key?("pull_request")
fail_contract "ci.yml must run on pushes to main" unless ci_on.dig("push", "branches") == ["main"]
fail_contract "ci.yml must cancel superseded runs" unless ci.dig("concurrency", "cancel-in-progress") == true
required_ci_paths = %w[openspec/** AGENTS.md README.md THIRD_PARTY_NOTICES.md SOURCE_MANIFEST* *PROVENANCE* docs/DEPLOYMENT.md integration/weknora-staging/** scripts/weknora-staging/** scripts/weknora-staging-deploy.sh integration/operations/** playwright.operations*.config.ts]
%w[pull_request push].each do |trigger|
  configured = Array(ci_on.dig(trigger, "paths"))
  missing = required_ci_paths.reject { |path| configured.include?(path) }
  fail_contract "ci.yml #{trigger} paths omit delivery authority: #{missing.join(", ")}" unless missing.empty?
end
ci_text = File.read(File.join(WORKFLOW_DIR, "ci.yml"))
frontend_steps = Array(ci.dig("jobs", "frontend", "steps"))
frontend_build = frontend_steps.find { |step| step.is_a?(Hash) && step["name"] == "Build frontend" }
fail_contract "frontend build must pin NODE_OPTIONS to a 4096 MiB heap" unless frontend_build&.dig("env", "NODE_OPTIONS") == "--max-old-space-size=4096"
fail_contract "frontend tests must not inherit the build-only NODE_OPTIONS override" if ci.dig("jobs", "frontend", "env", "NODE_OPTIONS")

expected_npm_cache_policy = "npm"
{
  "frontend" => "weknora/frontend/package-lock.json",
  "auth" => "auth/package-lock.json",
  "storefront" => "storefront/package-lock.json",
  "dsh-plugin" => "weknora/packages/dsh-weknora/package-lock.json",
  "repository-contracts" => "package-lock.json"
}.each do |job_name, dependency_path|
  setup_node = Array(ci.dig("jobs", job_name, "steps")).find { |step| step.is_a?(Hash) && step["uses"].to_s.start_with?("actions/setup-node@") }
  fail_contract "hosted #{job_name} CI must use the official npm cache" unless setup_node&.dig("with", "cache") == expected_npm_cache_policy && setup_node&.dig("with", "cache-dependency-path") == dependency_path
end

go_steps = Array(ci.dig("jobs", "go", "steps"))
setup_go = go_steps.find { |step| step.is_a?(Hash) && step["uses"].to_s.start_with?("actions/setup-go@") }
expected_go_cache_policy = true
fail_contract "hosted Go CI must use the official module and build cache" unless setup_go&.dig("with", "cache") == expected_go_cache_policy && setup_go&.dig("with", "cache-dependency-path") == "weknora/go.sum"

docreader_steps = Array(ci.dig("jobs", "docreader", "steps"))
setup_python = docreader_steps.find { |step| step.is_a?(Hash) && step["uses"].to_s.start_with?("actions/setup-python@") }
fail_contract "DocReader setup-python must not request the unavailable pip cache" if setup_python&.dig("with", "cache") == "pip"
fail_contract "DocReader setup-python must not retain a pip cache dependency path" if setup_python&.dig("with", "cache-dependency-path")
setup_uv = docreader_steps.find { |step| step.is_a?(Hash) && step["uses"].to_s.start_with?("astral-sh/setup-uv@") }
fail_contract "DocReader must use setup-uv's cache instead of setup-python pip cache" unless setup_uv&.dig("with", "enable-cache") == true
tracked_scan_path = File.join(ROOT, "scripts", "ci", "tracked-source-scan.mjs")
fail_contract "tracked publish-boundary scanner is missing" unless File.file?(tracked_scan_path)
fail_contract "tracked publish-boundary scanner is not executable" unless File.executable?(tracked_scan_path)
fail_contract "repository contracts do not run the tracked publish-boundary scanner" unless ci_text.include?("node scripts/ci/tracked-source-scan.mjs")
fail_contract "repository contracts do not run the browser-direct R2 CORS policy test" unless ci_text.include?("bash scripts/r2-cors/contract.test.sh")
fail_contract "repository contracts reference excluded legacy architecture tests" if ci_text.include?("tests/architecture/")
fail_contract "canonical CI omits the direct deployment seam contract" unless ci_text.include?("bash scripts/weknora-production/deploy-ci-seams-contract.test.sh")
fail_contract "canonical CI omits the restricted gate simulation" unless ci_text.include?("bash scripts/weknora-production/musuw-deploy-gate-simulation.test.sh")
%w[
  contract.test.sh
  verify-static.sh
  capacity-preflight.test.sh
  gate-simulation.test.sh
].each do |staging_contract|
  expected_command = "bash scripts/weknora-staging/#{staging_contract}"
  fail_contract "canonical CI omits staging contract: #{staging_contract}" unless ci_text.include?(expected_command)
end
tracked_scan_text = File.read(tracked_scan_path)
%w[server desktop dist node_modules .runtime keys].each do |sentinel|
  fail_contract "tracked publish-boundary scanner does not cover #{sentinel}" unless tracked_scan_text.include?(sentinel)
end
source_manifest_text = File.read(File.join(ROOT, "scripts", "ci", "source-manifest.mjs"))
fail_contract "source manifest must count Git-tracked source instead of local dependency output" unless source_manifest_text.include?("ls-files")

storefront = documents.fetch("deploy-storefront.yml")
storefront_on = root_key(storefront, "on")
storefront_workflow_run = storefront_on.fetch("workflow_run", {})
%w[build deploy].each do |job_name|
  setup_node = Array(storefront.dig("jobs", job_name, "steps")).find { |step| step.is_a?(Hash) && step["uses"].to_s.start_with?("actions/setup-node@") }
  fail_contract "hosted storefront #{job_name} must use the official npm cache" unless setup_node&.dig("with", "cache") == expected_npm_cache_policy && setup_node&.dig("with", "cache-dependency-path") == "storefront/package-lock.json"
end
fail_contract "storefront deploy must listen for completed CI workflow runs on main" unless storefront_workflow_run.dig("workflows") == ["CI"] && storefront_workflow_run.dig("types") == ["completed"] && storefront_workflow_run.dig("branches") == ["main"]
fail_contract "storefront deploy must retain a manual workflow_dispatch" unless storefront_on.key?("workflow_dispatch")
fail_contract "storefront deploy must have a build dependency" unless storefront.dig("jobs", "deploy", "needs") == "build"
fail_contract "storefront deploy must not cancel after Cloudflare mutation" unless storefront.dig("concurrency", "cancel-in-progress") == false
fail_contract "storefront deploy must use its isolated production environment" unless storefront.dig("jobs", "deploy", "environment") == "storefront-production"
storefront_dispatch = storefront_on.fetch("workflow_dispatch")
assert_hash(storefront_dispatch, "deploy-storefront.yml.workflow_dispatch")
storefront_input = storefront_dispatch.dig("inputs", "immutable_ref")
assert_hash(storefront_input, "deploy-storefront.yml.workflow_dispatch.inputs.immutable_ref")
fail_contract "storefront immutable_ref input must be required" unless storefront_input["required"] == true && storefront_input["type"] == "string"
storefront_text = File.read(File.join(WORKFLOW_DIR, "deploy-storefront.yml"))
wrangler_path = File.join(ROOT, "storefront", "wrangler.jsonc")
fail_contract "storefront wrangler config is missing" unless File.file?(wrangler_path)
wrangler_config = JSON.parse(File.read(wrangler_path).sub(%r{(^|\s)//.*$}, "\\1"))
fail_contract "storefront wrangler workers_dev must be disabled" unless wrangler_config["workers_dev"] == false
fail_contract "storefront wrangler preview_urls must be disabled" unless wrangler_config["preview_urls"] == false
fail_contract "storefront deploy must use Cloudflare credentials" unless storefront_text.include?("CLOUDFLARE_API_TOKEN") && storefront_text.include?("CLOUDFLARE_ACCOUNT_ID")
fail_contract "storefront deploy must annotate the Worker with the selected SHA" unless storefront_text.include?("--message") && storefront_text.include?("RELEASE_SHA") && storefront_text.include?("--tag")
fail_contract "storefront workflow_run must select workflow_run.head_sha and never github.sha" unless storefront_text.include?("github.event.workflow_run.head_sha") && !storefront_text.include?("github.sha")
fail_contract "storefront workflow_run must require canonical CI success" unless storefront_text.include?("github.repository == 'estromeglovettgen-coder/musuw'") && storefront_text.include?("github.event.workflow_run.name == 'CI'") && storefront_text.include?("github.event.workflow_run.conclusion == 'success'") && storefront_text.include?("github.event.workflow_run.head_branch == 'main'")
fail_contract "storefront dispatch must select an immutable checkout ref" unless storefront_text.include?("inputs.immutable_ref") && storefront_text.include?("git rev-parse HEAD")
fail_contract "storefront dispatch must require successful CI for the selected SHA" unless storefront_text.include?("actions/runs") && storefront_text.include?("workflow_dispatch") && storefront_text.include?(".name == \"CI\"") && storefront_text.include?(".conclusion == \"success\"")
fail_contract "storefront deploy must smoke-test both public aliases and locale" unless storefront_text.include?("https://musuw.com") && storefront_text.include?("https://www.musuw.com") && storefront_text.match?(/content-language/i) && storefront_text.include?("__MUSUW_LOCALE__")
fail_contract "storefront deploy must retain release evidence" unless storefront_text.include?("wrangler deployments list") && storefront_text.include?("upload-artifact") && storefront_text.include?("sha256")
%w[target deployed_at health_result worker_version_id auth_handoff ci_workflow_run].each do |field|
  fail_contract "storefront release evidence omits #{field}" unless storefront_text.include?(field)
end
fail_contract "storefront deploy must capture a pre-deploy version" unless storefront_text.include?("previous_version_id") && storefront_text.include?("versions")
fail_contract "storefront deploy/smoke failure must rollback and re-probe" unless storefront_text.include?("wrangler rollback") && storefront_text.include?("automatic Cloudflare rollback") && storefront_text.scan("https://musuw.com").length >= 2 && storefront_text.scan("https://www.musuw.com").length >= 2
fail_contract "storefront smoke must verify the product auth handoff reachability" unless storefront_text.include?("https://app.musuw.com/auth/start")

production = documents.fetch("deploy-production.yml")
production_on = root_key(production, "on")
production_workflow_run = production_on.fetch("workflow_run", {})
fail_contract "production deploy must listen for completed CI workflow runs on main" unless production_workflow_run.dig("workflows") == ["CI"] && production_workflow_run.dig("types") == ["completed"] && production_workflow_run.dig("branches") == ["main"]
fail_contract "production deploy must retain a manual exact-SHA dispatch" unless production_on.key?("workflow_dispatch")
fail_contract "production deploy must not publish from a tag or ordinary push trigger" if production_on.key?("push")
fail_contract "production deploy must not cancel an active release" unless production.dig("concurrency", "cancel-in-progress") == false
production_authorize = production.dig("jobs", "authorize")
production_build = production.dig("jobs", "build")
production_deploy = production.dig("jobs", "deploy")
production_staging = production.dig("jobs", "deploy-staging")
assert_hash(production_authorize, "deploy-production.yml.jobs.authorize")
assert_hash(production_build, "deploy-production.yml.jobs.build")
assert_hash(production_deploy, "deploy-production.yml.jobs.deploy")
assert_hash(production_staging, "deploy-production.yml.jobs.deploy-staging")
fail_contract "production authorization must run on the pinned standard GitHub-hosted runner" unless production_authorize["runs-on"] == expected_runner
fail_contract "production image build must run on the pinned standard GitHub-hosted runner" unless production_build["runs-on"] == expected_runner
fail_contract "production build must follow authorization" unless production_build["needs"] == "authorize"
fail_contract "production deploy must wait for authorization, immutable images, and staging verification" unless Array(production_deploy["needs"]) == %w[authorize build deploy-staging]
fail_contract "staging deploy must wait for authorization and immutable images" unless Array(production_staging["needs"]) == %w[authorize build]
fail_contract "production deploy must run on the pinned standard GitHub-hosted runner" unless production_deploy["runs-on"] == expected_runner
fail_contract "staging deploy must run on the pinned standard GitHub-hosted runner" unless production_staging["runs-on"] == expected_runner
fail_contract "production deploy must use its isolated server environment" unless production.dig("jobs", "deploy", "environment") == "server-production"
fail_contract "staging deploy must use its independent staging environment" unless production.dig("jobs", "deploy-staging", "environment") == "staging"
fail_contract "production build runner must not receive the production environment" if production_build.key?("environment")
fail_contract "production package write and artifact read must be scoped to the image-build job" unless production_build["permissions"] == { "contents" => "read", "actions" => "read", "packages" => "write" }
fail_contract "production deploy must receive only read access to GHCR" unless production_deploy["permissions"] == { "contents" => "read", "packages" => "read" }
fail_contract "production authorization must not receive package write" if production.dig("jobs", "authorize", "permissions", "packages") == "write"
production_dispatch = production_on.fetch("workflow_dispatch")
assert_hash(production_dispatch, "deploy-production.yml.workflow_dispatch")
production_input = production_dispatch.dig("inputs", "immutable_ref")
assert_hash(production_input, "deploy-production.yml.workflow_dispatch.inputs.immutable_ref")
fail_contract "production immutable_ref input must be required" unless production_input["required"] == true && production_input["type"] == "string"
production_text = File.read(File.join(WORKFLOW_DIR, "deploy-production.yml"))
production_build_steps = Array(production_build["steps"])
production_deploy_steps = Array(production_deploy["steps"])
production_authorize_steps = Array(production_authorize["steps"])
production_authorize_checkout = production_authorize_steps.find { |step| step.is_a?(Hash) && step.fetch("uses", "").start_with?("actions/checkout@") }
production_build_checkout = production_build_steps.find { |step| step.is_a?(Hash) && step.fetch("uses", "").start_with?("actions/checkout@") }
production_build_checkout_assert = production_build_steps.find { |step| step.is_a?(Hash) && step["name"] == "Assert the detached checkout matches the authorized SHA" }
production_deploy_checkout = production_deploy_steps.find { |step| step.is_a?(Hash) && step.fetch("uses", "").start_with?("actions/checkout@") }
production_node_setup = production_build_steps.find { |step| step.is_a?(Hash) && step.fetch("uses", "").start_with?("actions/setup-node@") }
production_native_preflight = production_build_steps.find { |step| step.is_a?(Hash) && step["name"] == "Assert native AMD64 build execution" }
production_static_build = production_build_steps.find { |step| step.is_a?(Hash) && step["name"] == "Build production browser bundles on native x64" }
production_buildx = production_build_steps.find { |step| step.is_a?(Hash) && step["id"] == "buildx" }
production_app_image = production_build_steps.find { |step| step.is_a?(Hash) && step["id"] == "app_image" }
production_frontend_image = production_build_steps.find { |step| step.is_a?(Hash) && step["id"] == "frontend_image" }
production_images = production_build_steps.find { |step| step.is_a?(Hash) && step["id"] == "images" }
production_registry_login = production_build_steps.find { |step| step.is_a?(Hash) && step["name"] == "Log in to GitHub Container Registry" }
production_pin_images = production_deploy_steps.find { |step| step.is_a?(Hash) && step["name"] == "Pin approved GHCR image refs in the server input" }
fail_contract "production browser build must cap the Node heap below the 4 GB host RAM" unless production_static_build&.dig("env", "NODE_OPTIONS") == "--max-old-space-size=3072"
fail_contract "production authorization must retain its full-history checkout for main ancestry proof" unless production_authorize_checkout&.dig("with", "fetch-depth") == 0 && production_authorize_checkout&.dig("with", "persist-credentials") == true
expected_authorize_outputs = {
  "release_sha" => "${{ steps.resolve.outputs.release_sha }}",
  "ci_workflow_run" => "${{ steps.resolve.outputs.ci_workflow_run }}"
}
fail_contract "production authorization must expose only the approved release and CI identities" unless production_authorize["outputs"] == expected_authorize_outputs
fail_contract "production authorization must not retain the regional source-artifact transport" if JSON.generate(production_authorize).match?(/source_bundle|source_artifact|upload-artifact/)
fail_contract "production build must check out the exact authorized SHA without persisted credentials" unless production_build_checkout&.dig("with", "ref") == "${{ needs.authorize.outputs.release_sha }}" && production_build_checkout&.dig("with", "persist-credentials") == false
fail_contract "production build must not retain the regional artifact downloader" if JSON.generate(production_build).match?(/SOURCE_ARTIFACT|SOURCE_ARCHIVE|blob\.core\.windows\.net|Range: bytes|actions\/artifacts/)
fail_contract "production deploy must retain the exact-SHA Git checkout required by the source-manifest seam" unless production_deploy_checkout&.dig("with", "ref") == "${{ needs.authorize.outputs.release_sha }}" && production_deploy_checkout&.dig("with", "fetch-depth") == 0
node_cache_paths = production_node_setup&.dig("with", "cache-dependency-path").to_s
fail_contract "production browser build must use official Node setup for the exact checked-in version and lockfiles" unless production_node_setup&.dig("with", "node-version-file") == ".nvmrc" && production_node_setup&.dig("with", "cache") == "npm" && node_cache_paths.include?("auth/package-lock.json") && node_cache_paths.include?("weknora/frontend/package-lock.json")
fail_contract "production build must fail closed unless runner and Docker daemon are native x64" unless production_native_preflight&.dig("env", "RUNNER_ARCH") == "${{ runner.arch }}" && production_native_preflight["run"].to_s.include?("docker info") && production_native_preflight["run"].to_s.include?("x86_64")
checkout_assert_run = production_build_checkout_assert&.fetch("run", "").to_s
fail_contract "production build must assert the checked-out authorized SHA before construction" unless production_build_checkout_assert&.dig("env", "RELEASE_SHA") == "${{ needs.authorize.outputs.release_sha }}" && checkout_assert_run.include?('test "$(git rev-parse HEAD)" = "$RELEASE_SHA"')
fail_contract "production exact-SHA checkout must be asserted before dependency installation or construction" unless production_build_steps.index(production_build_checkout).to_i < production_build_steps.index(production_build_checkout_assert).to_i && production_build_steps.index(production_build_checkout_assert).to_i < production_build_steps.index(production_node_setup).to_i && production_build_steps.index(production_node_setup).to_i < production_build_steps.index(production_static_build).to_i
image_validation_run = production_images&.fetch("run", "").to_s
fail_contract "production hosted build must not route through a regional apt mirror" if production_text.include?("APT_MIRROR_ARG") || production_text.include?("mirrors.cloud.tencent.com")
fail_contract "production workflow must not install QEMU emulation" if JSON.generate(production_build).include?("setup-qemu")
fail_contract "production Buildx must use the official action with checked-in bounded configuration and cleanup" unless production_buildx&.fetch("uses", "") == "docker/setup-buildx-action@v4" && production_buildx&.dig("with", "driver") == "docker-container" && production_buildx&.dig("with", "buildkitd-config") == ".github/buildkitd.production.toml" && production_buildx&.dig("with", "cleanup") == true && !production_buildx&.dig("with", "keep-state")
fail_contract "production GHCR login must use the official action, job token, and logout cleanup" unless production_registry_login&.fetch("uses", "") == "docker/login-action@v4" && production_registry_login&.dig("with", "registry") == "ghcr.io" && production_registry_login&.dig("with", "username") == "${{ github.actor }}" && production_registry_login&.dig("with", "password") == "${{ github.token }}" && production_registry_login&.dig("with", "logout") == true
fail_contract "production image construction must use two official sequential Buildx actions before digest validation" unless [production_app_image, production_frontend_image].all? { |step| step&.fetch("uses", "") == "docker/build-push-action@v7" } && production_build_steps.index(production_buildx).to_i < production_build_steps.index(production_registry_login).to_i && production_build_steps.index(production_registry_login).to_i < production_build_steps.index(production_app_image).to_i && production_build_steps.index(production_app_image).to_i < production_build_steps.index(production_frontend_image).to_i && production_build_steps.index(production_frontend_image).to_i < production_build_steps.index(production_images).to_i
fail_contract "production build must not retain custom Docker credential or Buildx state machinery" if JSON.generate(production_build).match?(/DOCKER_CONFIG|BUILDX_CONFIG|docker buildx create|docker login ghcr\.io|--keep-state/)
buildkit_config_path = File.join(ROOT, ".github", "buildkitd.production.toml")
fail_contract "production BuildKit GC configuration is missing" unless File.file?(buildkit_config_path)
buildkit_config = File.read(buildkit_config_path)
fail_contract "production BuildKit must enable job-scoped GC with bounded concurrency" unless buildkit_config.include?("gc = true") && buildkit_config.include?("max-parallelism = 2")
fail_contract "production BuildKit must not retain self-hosted disk floors or regional mirrors" if buildkit_config.match?(/maxUsedSpace|minFreeSpace|registry\.|mirror/i)
daemon_config_path = File.join(ROOT, ".github", "docker-daemon.production-builder.json")
fail_contract "production must not retain a self-hosted Docker daemon mirror configuration" if File.exist?(daemon_config_path)
expected_image_outputs = {
  "app_digest" => "${{ steps.images.outputs.app_digest }}",
  "app_ref" => "${{ steps.images.outputs.app_ref }}",
  "frontend_digest" => "${{ steps.images.outputs.frontend_digest }}",
  "frontend_ref" => "${{ steps.images.outputs.frontend_ref }}"
}
fail_contract "production build must expose validated immutable image digests and refs" unless production_build["outputs"] == expected_image_outputs
app_image_inputs = production_app_image&.fetch("with", {}) || {}
frontend_image_inputs = production_frontend_image&.fetch("with", {}) || {}
fail_contract "production application image action must preserve native context, immutable tag, labels, arguments, AnyDoc, and minimum provenance" unless app_image_inputs["context"] == "./weknora" && app_image_inputs["file"] == "./integration/weknora-production/Dockerfile.app.runtime" && app_image_inputs["platforms"] == "linux/amd64" && app_image_inputs["push"] == true && app_image_inputs["tags"] == "ghcr.io/estromeglovettgen-coder/musuw-app:${{ needs.authorize.outputs.release_sha }}" && app_image_inputs["labels"].to_s.include?("org.opencontainers.image.source=${{ github.server_url }}/${{ github.repository }}") && app_image_inputs["labels"].to_s.include?("org.opencontainers.image.revision=${{ needs.authorize.outputs.release_sha }}") && app_image_inputs["build-args"].to_s.include?("VERSION_ARG=main-81142df") && app_image_inputs["build-args"].to_s.include?("WITH_ANYDOC=1") && app_image_inputs["build-args"].to_s.include?("IMAGE_REVISION_ARG=${{ needs.authorize.outputs.release_sha }}") && !app_image_inputs["build-args"].to_s.include?("COMMIT_ID_ARG=") && app_image_inputs["build-args"].to_s.include?("BUILD_TIME_ARG=production-github-hosted-amd64") && app_image_inputs["build-args"].to_s.include?("GO_VERSION_ARG=go1.26") && app_image_inputs["provenance"] == "mode=min"
fail_contract "production frontend image action must preserve native context, immutable tag, labels, arguments, and minimum provenance" unless frontend_image_inputs["context"] == "." && frontend_image_inputs["file"] == "./integration/weknora-production/Dockerfile.frontend" && frontend_image_inputs["platforms"] == "linux/amd64" && frontend_image_inputs["push"] == true && frontend_image_inputs["tags"] == "ghcr.io/estromeglovettgen-coder/musuw-frontend:${{ needs.authorize.outputs.release_sha }}" && frontend_image_inputs["labels"].to_s.include?("org.opencontainers.image.source=${{ github.server_url }}/${{ github.repository }}") && frontend_image_inputs["labels"].to_s.include?("org.opencontainers.image.revision=${{ needs.authorize.outputs.release_sha }}") && frontend_image_inputs["build-args"].to_s.include?("VERSION_ARG=main-81142df") && frontend_image_inputs["build-args"].to_s.include?("REVISION_ARG=${{ needs.authorize.outputs.release_sha }}") && frontend_image_inputs["provenance"] == "mode=min"
fail_contract "production application image must use its own maximum-mode GitHub Actions cache scope" unless app_image_inputs["cache-from"] == "type=gha,scope=musuw-app-amd64" && app_image_inputs["cache-to"] == "type=gha,mode=max,scope=musuw-app-amd64,ignore-error=true"
fail_contract "production frontend image must use its own maximum-mode GitHub Actions cache scope" unless frontend_image_inputs["cache-from"] == "type=gha,scope=musuw-frontend-amd64" && frontend_image_inputs["cache-to"] == "type=gha,mode=max,scope=musuw-frontend-amd64,ignore-error=true"
fail_contract "production image cache must not publish mutable registry cache tags" if JSON.generate([production_app_image, production_frontend_image]).include?("type=registry")
fail_contract "production digest validator must consume both official action digests, wait for registry consistency, and verify remote immutable refs" unless production_images&.dig("env", "APP_DIGEST") == "${{ steps.app_image.outputs.digest }}" && production_images&.dig("env", "FRONTEND_DIGEST") == "${{ steps.frontend_image.outputs.digest }}" && image_validation_run.include?('docker buildx imagetools inspect "$repository@$digest"') && image_validation_run.include?('docker buildx imagetools inspect "$expected_tag"') && image_validation_run.include?("--format '{{json .Manifest}}'") && image_validation_run.include?("manifest.digest") && image_validation_run.include?('test "$tag_digest" = "$digest" || return 1') && image_validation_run.include?("wait_for_registry_digest()") && image_validation_run.include?("for attempt in {1..12}") && image_validation_run.include?("sleep 5") && image_validation_run.include?('wait_for_registry_digest "$APP_DIGEST"') && image_validation_run.include?('wait_for_registry_digest "$FRONTEND_DIGEST"') && image_validation_run.include?("app_ref") && image_validation_run.include?("frontend_ref")
fail_contract "production deploy must consume the build job's immutable image refs" unless production_pin_images&.dig("env", "APP_IMAGE") == "${{ needs.build.outputs.app_ref }}" && production_pin_images&.dig("env", "FRONTEND_IMAGE") == "${{ needs.build.outputs.frontend_ref }}"
fail_contract "production deploy must not rebuild images or browser bundles" if JSON.generate(production_deploy).match?(/build-push-action|setup-buildx-action|Build production browser bundles/)
fail_contract "production image build must not reference any production secret" if JSON.generate(production_build).match?(/secrets\.|MUSUW_PRODUCTION_SSH|WEKNORA_DEPLOY_SSH|KNOWN_HOSTS/)
%w[VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_WEKNORA_OAUTH_CLIENT_ID].each do |public_name|
  fail_contract "production image build must receive public #{public_name} as a repository variable" unless JSON.generate(production_build).include?("vars.#{public_name}")
  fail_contract "production deploy must consume the same public #{public_name} repository variable" unless JSON.generate(production_deploy).include?("vars.#{public_name}")
end
fail_contract "production workflow must not retain a second auth-public secret source" if production_text.include?("MUSUW_AUTH_PUBLIC_ENV")
%w[WEKNORA_DEPLOY_KNOWN_HOSTS_FILE WEKNORA_DEPLOY_SSH_KEY WEKNORA_DEPLOY_REMOTE WEKNORA_DEPLOY_REVISION].each do |name|
  fail_contract "production deploy missing #{name} seam" unless production_text.include?(name)
end
fail_contract "production workflow_run must select the successful canonical CI head SHA" unless production_text.include?("github.event.workflow_run.head_sha") && production_text.include?("github.event.workflow_run.conclusion == 'success'") && production_text.include?("github.event.workflow_run.repository.full_name == 'estromeglovettgen-coder/musuw'")
fail_contract "production dispatch must be restricted to main" unless (production_text.include?("EVENT_REF") || production_text.include?("GITHUB_REF")) && production_text.include?("refs/heads/main") && production_text.include?("workflow_dispatch")
fail_contract "production deploy must resolve an immutable checkout input" unless production_text.include?("inputs.immutable_ref") && production_text.include?("git rev-parse HEAD")
fail_contract "production deploy must prove the revision belongs to origin/main" unless production_text.include?("origin/main") && production_text.include?("merge-base")
fail_contract "production release input must be a full 40-character SHA only" unless production_text.include?("^[0-9a-fA-F]{40}$") && !production_text.include?("refs/tags/") && !production_text.include?("git cat-file -t")
fail_contract "production dispatch must fail closed for unsupported release modes" unless production_text.include?("release_mode must be staging-only or promote") && production_text.include?("staging-only|promote")
fail_contract "production deploy must require a successful CI run for the revision" unless production_text.include?("actions/runs") && production_text.include?("CI") && production_text.include?("conclusion")
fail_contract "production deploy must pin checkout to the resolved SHA" unless production_text.include?("ref: ${{ needs.authorize.outputs.release_sha }}")
fail_contract "production deploy must execute the direct SHA-only runner" unless production_text.include?("bash scripts/weknora-deploy.sh \"$WEKNORA_DEPLOY_REVISION\"") && production_text.include?("remote_gate prepare") && production_text.include?("remote_gate deploy")
fail_contract "production deploy must build and push both immutable GHCR images" unless [production_app_image, production_frontend_image].all? { |step| step&.fetch("uses", "") == "docker/build-push-action@v7" && step&.dig("with", "push") == true }
fail_contract "production deploy must stream the short-lived GHCR token through the restricted runner" unless production_text.include?("WEKNORA_DEPLOY_GHCR_USERNAME") && production_text.include?("WEKNORA_DEPLOY_GHCR_TOKEN")
fail_contract "production image build must use the committed auth lockfile" unless production_text.include?("npm ci --prefix auth") && File.file?(File.join(ROOT, "auth", "package-lock.json"))
fail_contract "production deploy must assert the fixed release helper" unless production_text.include?("release-ci.sh") && production_text.include?("musuw-deploy-gate")
fail_contract "production deploy must retain release manifest/checksum evidence" unless production_text.include?("upload-artifact") && production_text.include?("sha256sum") && production_text.include?("source_manifest") && production_text.include?("source_bundle_sha256")
%w[target deployed_at health_result app_image frontend_image ci_workflow_run].each do |field|
  fail_contract "production release evidence omits #{field}" unless production_text.include?(field)
end
fail_contract "production success manifest must fail closed without server identity/checksum" unless production_text.include?("RELEASE_OUTCOME") && production_text.include?("test \"$server_release_id\" = \"$expected_release_id\"") && production_text.include?("=~ ^[0-9a-fA-F]{64}$")
fail_contract "production workflow must not use write permissions" if production_text.include?("contents: write") || production_text.include?("actions: write")

# Production is an explicit promotion action only.  A completed CI workflow or
# a staging-only dispatch may build and verify staging, but neither path may
# touch the production environment.
production_deploy_if = production_deploy.fetch("if", "").to_s
fail_contract "production deploy must be manual promote-only" unless production_deploy_if.include?("github.event_name == 'workflow_dispatch'") && production_deploy_if.include?("inputs.release_mode == 'promote'") && !production_deploy_if.include?("github.event_name == 'workflow_run'")
fail_contract "workflow_run must never promote production" if production_deploy_if.include?("workflow_run")

# Isolated staging is deliberately part of this release workflow rather than a
# second build/pipeline.  Keep these assertions close to the production seam so
# a future edit cannot silently let production bypass the staging gate.
staging_text = JSON.generate(production_staging)
staging_steps = Array(production_staging["steps"])
staging_prepare = staging_steps.find { |step| step.is_a?(Hash) && step["id"] == "staging_prepare" }
staging_pin = staging_steps.find { |step| step.is_a?(Hash) && step["name"] == "Pin approved GHCR image refs in the staging input" }
staging_deploy = staging_steps.find { |step| step.is_a?(Hash) && step["name"] == "Execute the staging SHA-only release seam" }
staging_verify = staging_steps.find { |step| step.is_a?(Hash) && step["name"] == "Verify the deployed staging digest pair" }
staging_record = staging_steps.find { |step| step.is_a?(Hash) && step["name"] == "Write the verified staging release record" }
staging_upload = staging_steps.find { |step| step.is_a?(Hash) && step.fetch("uses", "").start_with?("actions/upload-artifact@") }
staging_cleanup = staging_steps.find { |step| step.is_a?(Hash) && step["name"] == "Remove temporary staging deployment inputs" }
fail_contract "staging deploy must not build or push images" if staging_text.match?(/build-push-action|setup-buildx-action|Build production browser bundles/)
fail_contract "staging deploy must consume the authorized SHA and build image refs" unless staging_pin&.dig("env", "RELEASE_SHA") == "${{ needs.authorize.outputs.release_sha }}" && staging_pin&.dig("env", "APP_IMAGE") == "${{ needs.build.outputs.app_ref }}" && staging_pin&.dig("env", "FRONTEND_IMAGE") == "${{ needs.build.outputs.frontend_ref }}"
fail_contract "staging deploy must use the independent SHA-only runner seam" unless staging_deploy&.fetch("run", "").to_s.include?('bash scripts/weknora-staging-deploy.sh "$WEKNORA_STAGING_REVISION"') && staging_text.include?("WEKNORA_STAGING_GHCR_TOKEN")
fail_contract "staging deploy must verify the exact digest pair through the fixed remote gate" unless staging_verify&.fetch("run", "").to_s.include?('musuw-staging-gate verify $RELEASE_SHA $APP_IMAGE $FRONTEND_IMAGE') && staging_verify.dig("env", "APP_IMAGE") == "${{ needs.build.outputs.app_ref }}" && staging_verify.dig("env", "FRONTEND_IMAGE") == "${{ needs.build.outputs.frontend_ref }}" && !staging_verify.fetch("run", "").to_s.include?("bash scripts/weknora-staging/verify-deployed.sh")
fail_contract "staging deploy must use staging-only runtime inputs" unless staging_text.include?("MUSUW_STAGING_PUBLIC_ENV") && staging_text.include?("MUSUW_STAGING_AUTH_PUBLIC_ENV") && staging_text.include?("WEKNORA_STAGING_RUNTIME_DIR") && staging_text.include?("WEKNORA_STAGING_KNOWN_HOSTS_FILE") && staging_text.include?("WEKNORA_STAGING_SSH_KEY") && staging_text.include?("WEKNORA_STAGING_REMOTE")
fail_contract "staging deploy must pin the dotted staging hostname" unless staging_text.include?("APP_EXTERNAL_URL=https://staging.musuw.com") && staging_text.include?("FRONTEND_BASE_URL=https://staging.musuw.com") && staging_text.include?("MUSUW_AUTH_PUBLIC_ORIGIN=https://staging.musuw.com")
fail_contract "staging deploy must retain a deployment release record without claiming full E2E acceptance" unless staging_record&.fetch("run", "").to_s.include?("staging_deployment") && !staging_record.fetch("run", "").to_s.include?("staging_acceptance") && staging_record.fetch("run", "").to_s.include?("app_image") && staging_record.fetch("run", "").to_s.include?("frontend_image") && staging_record.fetch("run", "").to_s.include?("app_digest") && staging_record.fetch("run", "").to_s.include?("frontend_digest") && staging_upload
fail_contract "staging deploy must remove its temporary key and runtime inputs" unless staging_cleanup&.dig("if") == "always()" && staging_cleanup.fetch("run", "").to_s.include?("rm -f")
fail_contract "staging prepare must validate restricted staging SSH inputs" unless staging_prepare&.fetch("run", "").to_s.include?("musuw-staging-deploy@") && staging_prepare.fetch("env", {}).values.any? { |value| value.to_s.include?("MUSUW_STAGING_PUBLIC_ENV") }
fail_contract "production deploy must use the artifact-validated refs after the staging gate" unless production_pin_images&.dig("env", "RELEASE_SHA") == "${{ needs.authorize.outputs.release_sha }}" && production_pin_images&.dig("env", "APP_IMAGE") == "${{ needs.build.outputs.app_ref }}" && production_pin_images&.dig("env", "FRONTEND_IMAGE") == "${{ needs.build.outputs.frontend_ref }}" && production_pin_images.fetch("run", "").to_s.include?('[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]]')
fail_contract "production deploy must be conditional on a successful staging gate" unless production_deploy.fetch("if", "").to_s.include?("needs.deploy-staging.result == 'success'")

release_dispatch = production_on.fetch("workflow_dispatch")
release_mode_input = release_dispatch.dig("inputs", "release_mode")
staging_run_input = release_dispatch.dig("inputs", "staging_run_id")
staging_e2e_input = release_dispatch.dig("inputs", "staging_e2e_result")
assert_hash(release_mode_input, "deploy-production.yml.workflow_dispatch.inputs.release_mode")
assert_hash(staging_run_input, "deploy-production.yml.workflow_dispatch.inputs.staging_run_id")
assert_hash(staging_e2e_input, "deploy-production.yml.workflow_dispatch.inputs.staging_e2e_result")
fail_contract "release_mode must support only staging-only and exact promotion paths" unless release_mode_input["required"] == true && release_mode_input["type"] == "choice" && release_mode_input["default"] == "staging-only" && Array(release_mode_input["options"]) == %w[staging-only promote]
fail_contract "staging_run_id must be an optional exact prior-run input" unless staging_run_input["required"] == false && staging_run_input["type"] == "string"
fail_contract "release acceptance must default closed and expose explicit reviewed results" unless staging_e2e_input["required"] == true && staging_e2e_input["type"] == "choice" && staging_e2e_input["default"] == "not-confirmed" && Array(staging_e2e_input["options"]) == %w[not-confirmed full-sandbox-e2e-green ui-regression-green reviewed-model-release reviewed-integration-release reviewed-curated-release]
fail_contract "reviewed model acceptance must use the trusted exact candidate/baseline/run guard" unless production_text.include?('git show "$EVENT_SHA:scripts/ci/verify-reviewed-model-release.py"') && production_text.include?('python3 "$RUNNER_TEMP/verify-reviewed-model-release.py" "$actual" "$UI_BASE_SHA" "$REQUESTED_STAGING_RUN_ID"') && production_text.include?('full Sandbox E2E NOT claimed')
fail_contract "reviewed integration acceptance must use its trusted exact candidate/baseline/run guard without claiming full Sandbox E2E" unless production_text.include?('git show "$EVENT_SHA:scripts/ci/verify-reviewed-integration-release.py"') && production_text.include?('python3 "$RUNNER_TEMP/verify-reviewed-integration-release.py" "$actual" "$UI_BASE_SHA" "$REQUESTED_STAGING_RUN_ID"') && production_text.include?('targeted IM/embed acceptance passed; full Sandbox E2E NOT claimed')
fail_contract "reviewed curated acceptance must use its trusted exact candidate/baseline/run guard without claiming full Sandbox E2E" unless production_text.include?('git show "$EVENT_SHA:scripts/ci/verify-reviewed-curated-release.py"') && production_text.include?('python3 "$RUNNER_TEMP/verify-reviewed-curated-release.py" "$actual" "$UI_BASE_SHA" "$REQUESTED_STAGING_RUN_ID"') && production_text.include?('limited acceptance only; full Sandbox E2E NOT claimed')
fail_contract "UI acceptance must verify an explicit production baseline using the trusted dispatch scope policy" unless release_dispatch.dig("inputs", "ui_base_sha", "type") == "string" && production_text.include?('git show "$EVENT_SHA:scripts/ci/verify-ui-release-scope.py"') && production_text.include?('python3 "$RUNNER_TEMP/verify-ui-release-scope.py" "$UI_BASE_SHA" "$actual"') && production_text.include?("acceptance_class")
fail_contract "promotion must restore a prior staging artifact instead of rebuilding" unless production_build.fetch("steps").any? { |step| step.is_a?(Hash) && step["name"] == "Restore and validate the verified staging release record" && step.fetch("uses", "").start_with?("actions/download-artifact@") } && JSON.generate(production_build).include?("staging_run_id") && JSON.generate(production_build).include?("staging_deployment") && JSON.generate(production_build).include?("release_mode")
fail_contract "promotion must verify SHA and digest fields from the prior staging record" unless JSON.generate(production_build).include?("commit_sha") && JSON.generate(production_build).include?("app_ref") && JSON.generate(production_build).include?("frontend_ref") && JSON.generate(production_build).include?("app_digest") && JSON.generate(production_build).include?("frontend_digest") && JSON.generate(production_build).include?("staging_run_id")
fail_contract "staging acceptance must be able to run without promoting production" unless staging_text.include?("staging-only") && production_deploy_if.include?("workflow_dispatch") && production_deploy_if.include?("promote") && !production_deploy_if.include?("staging-only")
fail_contract "production promotion must require explicit full Sandbox E2E attestation" unless production_deploy_if.include?("inputs.staging_e2e_result == 'full-sandbox-e2e-green'") && production_text.include?("required_reviewers")
fail_contract "production promotion must permit only the explicitly reviewed integration tuple through its dedicated class" unless production_text.include?("promote:reviewed-integration-release") && production_deploy_if.include?("inputs.staging_e2e_result == 'reviewed-integration-release'")
fail_contract "production promotion must permit only the explicitly reviewed curated tuple through its dedicated class" unless production_text.include?("promote:reviewed-curated-release") && production_deploy_if.include?("inputs.staging_e2e_result == 'reviewed-curated-release'")
staging_restore = production_build.fetch("steps").find { |step| step.is_a?(Hash) && step["name"] == "Check the prior staging release record and immutable refs" }
staging_restore_run = staging_restore&.fetch("run", "").to_s
fail_contract "promotion must accept only a staging-only release record tied to the source run" unless staging_restore_run.include?('.release_mode == "staging-only"') && staging_restore_run.include?("(.workflow_run | tostring) == $run")

build_promote_guard = "${{ github.event_name != 'workflow_dispatch' || inputs.release_mode != 'promote' }}"
%w[production_static_build production_app_image production_frontend_image].each do |step_id|
  step = { "production_static_build" => production_static_build, "production_app_image" => production_app_image, "production_frontend_image" => production_frontend_image }.fetch(step_id)
  fail_contract "promotion must not #{step_id.tr("_", " ")} or rebuild images" unless step&.dig("if") == build_promote_guard
end
fail_contract "promotion must verify currently deployed staging digests through the fixed remote gate" unless staging_verify&.dig("if").nil? && staging_verify.fetch("run", "").to_s.include?("musuw-staging-gate verify")

fail_contract "staging image refs must not cross a secret-mask-prone environment job output" unless production_staging.fetch("outputs", {}).empty? && !JSON.generate(production_deploy).include?("needs.deploy-staging.outputs")

operations = documents.fetch("deploy-operations.yml")
operations_on = root_key(operations, "on")
fail_contract "operations release must be manual-only" unless operations_on.keys == ["workflow_dispatch"]
operations_ref = operations_on.dig("workflow_dispatch", "inputs", "immutable_ref")
fail_contract "operations release must require a complete commit identity" unless operations_ref.is_a?(Hash) && operations_ref["required"] == true && operations_ref["type"] == "string"
fail_contract "operations release must not cancel an in-flight deployment" unless operations.dig("concurrency", "cancel-in-progress") == false
ops_authorize = operations.dig("jobs", "authorize")
ops_build = operations.dig("jobs", "build")
ops_deploy = operations.dig("jobs", "deploy")
fail_contract "operations build must follow revision authorization" unless ops_build["needs"] == "authorize"
fail_contract "operations deployment must consume the authorized build" unless ops_deploy["needs"] == %w[authorize build]
fail_contract "operations deployment must keep its own protected Environment" unless ops_deploy["environment"] == "operations-production"
fail_contract "operations authorization or build must never receive a protected Environment" if ops_authorize.key?("environment") || ops_build.key?("environment")
fail_contract "operations authorization or build must never receive server credentials" if JSON.generate([ops_authorize, ops_build]).include?("secrets.")
ops_authorize_text = JSON.generate(ops_authorize)
%w[refs/heads/main origin/main merge-base actions/workflows/ci.yml/runs head_sha event=push status=success required_reviewers estromeglovettgen-coder].each do |guard|
  fail_contract "operations authorization omits #{guard}" unless ops_authorize_text.include?(guard)
end
ops_build_steps = Array(ops_build["steps"])
ops_checkout = ops_build_steps.find { |step| step["uses"].to_s.start_with?("actions/checkout@") }
fail_contract "operations build must check out only the authorized SHA without credentials" unless ops_checkout&.dig("with", "ref") == "${{ needs.authorize.outputs.revision }}" && ops_checkout&.dig("with", "persist-credentials") == false
fail_contract "operations build must retain its immutable artifact" unless ops_build_steps.any? { |step| step["uses"].to_s.start_with?("actions/upload-artifact@") }
ops_deploy_steps = Array(ops_deploy["steps"])
fail_contract "operations deploy must download the exact build artifact" unless ops_deploy_steps.any? { |step| step["uses"].to_s.start_with?("actions/download-artifact@") && step.dig("with", "name") == "operations-${{ needs.authorize.outputs.revision }}" }
ops_deploy_text = JSON.generate(ops_deploy)
%w[musuw-operations-deploy musuw-operations StrictHostKeyChecking=yes sha256sum CHECKSUM].each do |guard|
  fail_contract "operations deploy omits #{guard}" unless ops_deploy_text.include?(guard)
end
fail_contract "operations deploy must not receive application deployment credentials" if ops_deploy_text.match?(/MUSUW_PRODUCTION_|WEKNORA_DEPLOY_|MUSUW_STAGING_/)
%w[admin:test admin:deploy:test admin:e2e:recovery].each do |script|
  fail_contract "canonical CI omits #{script}" unless ci_text.include?("npm run #{script}")
end
package_scripts = JSON.parse(File.read(File.join(ROOT, "package.json"))).fetch("scripts")
fail_contract "operations runtime test glob must include local and server tests" unless package_scripts["admin:test"] == "node --test scripts/musuw-admin-*.test.mjs"
fail_contract "operations deployment tests must execute behavioral artifact contracts" unless package_scripts["admin:deploy:test"] == "python3 scripts/operations-deploy.test.py"
fail_contract "operations browser recovery must use its isolated fixture" unless package_scripts["admin:e2e:recovery"] == "playwright test --config=playwright.operations-recovery.config.ts"

puts "workflow contract green: #{EXPECTED.join(", ")}"
