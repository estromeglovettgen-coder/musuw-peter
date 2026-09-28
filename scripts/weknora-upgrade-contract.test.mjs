import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const weknoraRoot = path.join(repositoryRoot, "weknora");

const expectedPostgresMigrations = [
  "000094_knowledge_base_auto_tag_config",
  "000095_message_artifacts",
  "000096_tenant_sandbox_config",
  "000097_session_sandbox_config",
  "000098_memory",
  "000099_message_usage",
  "000100_tenant_skills",
  "000101_skill_install_transcript",
  "000102_skill_snapshot_planned_name",
  "000103_env_vars",
  "000104_skill_catalog",
];

const expectedSqliteMigrations = [
  "000013_knowledge_base_auto_tag_config",
  "000014_memory",
  "000015_messages_attachments_and_invitation_fields",
  "000016_task_queue_and_dead_letters",
  "000017_system_admin_and_settings",
  "000018_processing_spans_and_pending_subtasks",
  "000019_embed_channel_memory_flag",
  "000020_knowledge_multi_tags",
  "000021_principal_model",
  "000022_message_usage",
  "000023_sandbox_artifacts_compat",
];

async function assertMigrationPairs(directory, expectedStems) {
  const names = new Set(await readdir(directory));
  for (const stem of expectedStems) {
    assert.ok(names.has(`${stem}.up.sql`), `missing ${stem}.up.sql`);
    assert.ok(names.has(`${stem}.down.sql`), `missing ${stem}.down.sql`);
  }

  const directionsByVersion = new Map();
  for (const name of names) {
    const match = /^(\d{6})_.+\.(up|down)\.sql$/.exec(name);
    if (!match) continue;
    const [, version, direction] = match;
    const directions = directionsByVersion.get(version) ?? new Set();
    assert.ok(
      !directions.has(direction),
      `migration version ${version} has more than one ${direction} meaning`,
    );
    directions.add(direction);
    directionsByVersion.set(version, directions);
  }

  for (const [version, directions] of directionsByVersion) {
    assert.deepEqual(
      [...directions].sort(),
      ["down", "up"],
      `migration version ${version} must have an up/down pair`,
    );
  }
}

async function assertFileContains(relativePath, expectedFragments) {
  const content = await readFile(path.join(weknoraRoot, relativePath), "utf8");
  for (const fragment of expectedFragments) {
    assert.ok(
      content.includes(fragment),
      `${relativePath} lost required Musuw/target contract fragment: ${fragment}`,
    );
  }
}

test("the vendored kernel provenance pins the requested official commit", async () => {
  const provenance = JSON.parse(
    await readFile(
      path.join(
        repositoryRoot,
        "third_party/weknora/active-upstream-source.json",
      ),
      "utf8",
    ),
  );

  assert.equal(
    provenance.commit,
    "81142dfd17b2778087e95d3a317483a2fd909b91",
  );
  assert.equal(provenance.sourceDirectory, "weknora");
  assert.equal(provenance.import.latestMigration, 104);
  assert.equal(provenance.import.latestSQLiteMigration, 23);
});

test("Musuw migration meanings remain fixed and upstream migrations append", async () => {
  await assertMigrationPairs(
    path.join(weknoraRoot, "migrations/versioned"),
    expectedPostgresMigrations,
  );
  await assertMigrationPairs(
    path.join(weknoraRoot, "migrations/sqlite"),
    expectedSqliteMigrations,
  );

  const postgresNames = new Set(
    await readdir(path.join(weknoraRoot, "migrations/versioned")),
  );
  assert.ok(postgresNames.has("000080_default_searxng_provider.up.sql"));
  assert.ok(postgresNames.has("000093_complimentary_entitlements.up.sql"));
  assert.ok(!postgresNames.has("000080_knowledge_base_auto_tag_config.up.sql"));

  const sqliteNames = new Set(
    await readdir(path.join(weknoraRoot, "migrations/sqlite")),
  );
  assert.ok(sqliteNames.has("000003_consumer_plan_entitlements.up.sql"));
  assert.ok(sqliteNames.has("000012_complimentary_entitlements.up.sql"));
  assert.ok(!sqliteNames.has("000003_knowledge_base_auto_tag_config.up.sql"));

  const [sqliteInit, sqliteCompat] = await Promise.all([
    readFile(path.join(weknoraRoot, "migrations/sqlite/000000_init.up.sql"), "utf8"),
    readFile(
      path.join(weknoraRoot, "migrations/sqlite/000023_sandbox_artifacts_compat.up.sql"),
      "utf8",
    ),
  ]);
  for (const schemaObject of [
    "sandbox_config_id",
    "artifacts",
    "tenant_sandbox_configs",
  ]) {
    assert.ok(
      !sqliteInit.includes(schemaObject),
      `${schemaObject} must not be init-only because an existing v12 DB would miss it`,
    );
    assert.ok(
      sqliteCompat.includes(schemaObject),
      `SQLite compatibility migration must add ${schemaObject}`,
    );
  }
});

test("representative fixed-target capabilities are present at their owning modules", async () => {
  await Promise.all(
    [
      "internal/application/service/memory/service.go",
      "internal/sandbox/capabilities.go",
      "internal/agent/skills/env_resolver.go",
      "frontend/src/views/settings/MemorySettings.vue",
      "frontend/src/views/settings/SandboxSettings.vue",
      "frontend/src/views/settings/SkillSettings.vue",
      "docreader/parser/docx_merge.py",
      "packages/dsh-weknora/package.json",
    ].map((relativePath) => access(path.join(weknoraRoot, relativePath))),
  );
});

test("Musuw host development links the official AnyDoc engine when its archive exists", async () => {
  const musuwDev = await readFile(
    path.join(repositoryRoot, "scripts/musuw-dev"),
    "utf8",
  );

  assert.ok(
    musuwDev.includes("third_party/anydoc-go/lib/darwin_arm64/libanydoc_go.a"),
    "host development must resolve the same AnyDoc archive as upstream main",
  );
  assert.ok(
    musuwDev.includes("export GO_BUILD_TAGS=anydoc"),
    "host development must enable the AnyDoc build tag when the archive is present",
  );
  assert.ok(
    musuwDev.includes('go run -tags "${GO_BUILD_TAGS:-}" -ldflags="$ldflags" ./cmd/server'),
    "the host Go command must consume the resolved AnyDoc build tag",
  );
});

test("Musuw host development can opt into an isolated Standard acceptance runtime", () => {
  const musuwDev = path.join(repositoryRoot, "scripts/musuw-dev");
  const evaluate = (body) => execFileSync(
    "bash",
    ["-c", `source "${musuwDev}" help >/dev/null; ${body}`],
    { encoding: "utf8" },
  );

  assert.equal(
    evaluate("MUSUW_PRODUCT_EDITION=lite; MUSUW_DEV_PRODUCT_EDITION=standard; apply_host_product_edition_override; printf '%s' \"$MUSUW_PRODUCT_EDITION\""),
    "standard",
  );
  assert.equal(
    evaluate("MUSUW_PRODUCT_EDITION=lite; unset MUSUW_DEV_PRODUCT_EDITION; apply_host_product_edition_override; printf '%s' \"$MUSUW_PRODUCT_EDITION\""),
    "lite",
  );
  assert.throws(
    () => evaluate("MUSUW_DEV_PRODUCT_EDITION=enterprise; apply_host_product_edition_override"),
    /development product edition must be lite or standard/,
  );
});

test("high-risk Musuw product semantics remain composed with the target", async () => {
  await Promise.all([
    assertFileContains("internal/application/service/user.go", [
      "authenticationFenceError",
      "code_verifier",
      "bindOIDCIdentity",
      "ErrAuthenticationUnavailable",
    ]),
    assertFileContains("internal/router/router.go", [
      "liteProductGate()",
      "PaddleWebhook",
      "PaddlePublicConfig",
      "RegisterSandboxConfigRoutes",
      "RegisterMemoryRoutes",
    ]),
    assertFileContains("internal/container/container.go", [
      "NewEntitlementRepository",
      "NewPaddleBillingOperationRepository",
      "NewAccountErasureService",
      "NewModelServiceWithConsumerResolver",
      "configureAccountErasureRecovery",
    ]),
    assertFileContains("internal/application/repository/knowledge.go", [
      "CreateKnowledgeWithStorage",
      "ClaimKnowledgeSourceWithStorage",
      "DeleteKnowledgeWithStorage",
      "DeleteKnowledgeListWithStorage",
    ]),
    assertFileContains("internal/application/service/knowledge_process.go", [
      "prepareTikHubArtifact",
      "ClaimKnowledgeSourceWithStorage",
      "resolveDocReader(",
      "WeKnoraCloudCredentials: s.tenantService.GetWeKnoraCloudCredentials",
    ]),
    assertFileContains("internal/application/service/session_qa_helpers.go", [
      "effectiveWebSearchEnabled",
      "resolveConsumerChatModel",
      "resolveConsumerRerankModelID",
      "resolveRequestThinking",
    ]),
    assertFileContains("internal/types/tenant.go", [
      "ComplimentaryPlan",
      "PaddleSubscriptionID",
      "OpenRouterDesiredLimitMicrousd",
      "GetOpenRouter",
      "default:1073741824",
    ]),
    assertFileContains("internal/types/chat.go", [
      'json:"error_code,omitempty"',
      'json:"reasoning_details,omitempty"',
    ]),
    assertFileContains("internal/types/task.go", [
      'QueueBilling        = "billing"',
      'TypeAccountErasure           = "account:erase"',
      'json:"strict,omitempty"',
    ]),
    assertFileContains("internal/application/service/custom_agent.go", [
      "isPlatformManagedBuiltinAgentID",
      "ErrCannotModifyBuiltin",
    ]),
    assertFileContains("internal/types/knowledgebase.go", [
      "ApplyPlatformKnowledgeBaseDefaults",
      "PlatformKnowledgeBaseEmbeddingModelID",
    ]),
    assertFileContains("internal/agent/engine.go", [
      '"query_len"',
      "ErrorCode: openrouter.ErrorCode(err)",
      "ReasoningDetails: response.ReasoningDetails",
    ]),
  ]);
});
