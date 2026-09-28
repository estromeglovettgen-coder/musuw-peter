import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('./uploadSources.ts', import.meta.url), 'utf8')
const directUpload = readFileSync(new URL('../../../api/knowledge-base/direct-upload.ts', import.meta.url), 'utf8')
const dropdown = readFileSync(new URL('../components/KbUploadSourceDropdown.vue', import.meta.url), 'utf8')
const platform = readFileSync(new URL('../../platform/index.vue', import.meta.url), 'utf8')

/**
 * Consumer video upload policy is intentionally kept at the existing upload
 * source seam.  These fixtures describe the three behaviours the UI must
 * preserve once the pure partition helper is introduced:
 *
 *   Free + videos only  -> emit no files and report every video as blocked
 *   Free + mixed files  -> retain ordinary files and report blocked videos
 *   Paid                -> retain every supported file
 *
 * This is a source-contract red regression: it must stay red until the
 * helper is implemented, but it does not prescribe the popup copy or modify
 * the homepage composer.
 */
const scenarios = [
  {
    name: 'Free only video',
    files: ['clip.mp4', 'recording.webm'],
    videoUpload: false,
    allowed: 0,
    blocked: 2,
  },
  {
    name: 'Free mixed ordinary and video files',
    files: ['notes.pdf', 'clip.mp4', 'table.csv'],
    videoUpload: false,
    allowed: 2,
    blocked: 1,
  },
  {
    name: 'Paid keeps all supported files',
    files: ['notes.pdf', 'clip.mp4', 'table.csv'],
    videoUpload: true,
    allowed: 3,
    blocked: 0,
  },
]

const isVideoFixture = (name) =>
  ['mp4', 'mpeg', 'mov', 'webm'].some((extension) => name.toLowerCase().endsWith(`.${extension}`))

function extractPartitionHelper() {
  const sourceFile = ts.createSourceFile(
    'uploadSources.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === 'partitionFilesForConsumerPlan',
  )
  assert.ok(declaration, 'partitionFilesForConsumerPlan is not implemented yet')

  const snippet = source
    .slice(declaration.getStart(sourceFile), declaration.end)
    .replace(/^export\s+/, '')
  const transpiled = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const module = { exports: {} }
  // The helper is deliberately pure; evaluating only its declaration keeps
  // this matrix independent of Vue, TDesign, and browser globals.
  new Function(
    'module',
    'exports',
    'UPLOAD_VIDEO_EXTENSIONS',
    `${transpiled}\nmodule.exports.partitionFilesForConsumerPlan = partitionFilesForConsumerPlan;`,
  )(
    module,
    module.exports,
    ['mp4', 'mpeg', 'mov', 'webm'],
  )
  return module.exports.partitionFilesForConsumerPlan
}

function extractSocialShareHelper() {
  const sourceFile = ts.createSourceFile(
    'uploadSources.ts',
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  )
  const names = new Set(['SOCIAL_HOSTS', 'SOCIAL_URL_PATTERN', 'SOCIAL_TRAILING_PUNCTUATION'])
  const declarations = sourceFile.statements.filter((statement) => {
    if (ts.isFunctionDeclaration(statement)) {
      return statement.name?.text === 'isSupportedSocialShareInput'
    }
    if (!ts.isVariableStatement(statement)) return false
    return statement.declarationList.declarations.some(
      declaration => ts.isIdentifier(declaration.name) && names.has(declaration.name.text),
    )
  })
  assert.equal(declarations.length, 4, 'social share helper declarations changed unexpectedly')
  const snippet = declarations
    .map(statement => source.slice(statement.getStart(sourceFile), statement.end).replace(/^export\s+/, ''))
    .join('\n')
  const transpiled = ts.transpileModule(snippet, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const module = { exports: {} }
  new Function(
    'module',
    'exports',
    `${transpiled}\nmodule.exports.isSupportedSocialShareInput = isSupportedSocialShareInput;`,
  )(module, module.exports)
  return module.exports.isSupportedSocialShareInput
}

test('consumer upload partition exposes the video gate and blocked-file result', () => {
  assert.match(source, /export function partitionFilesForConsumerPlan\s*\(/)
  assert.match(source, /videoUpload\s*:\s*boolean/)
  assert.match(source, /allowedFiles/)
  assert.match(source, /blockedVideoFiles/)
  assert.match(source, /UPLOAD_VIDEO_EXTENSIONS/)
})

test('consumer upload partition documents all Free/Paid acceptance cases', () => {
  const partition = extractPartitionHelper()
  assert.equal(typeof partition, 'function', 'partition helper must be callable')

  for (const scenario of scenarios) {
    const files = scenario.files.map((name) => ({ name }))
    const result = partition(files, { videoUpload: scenario.videoUpload })
    assert.equal(result.allowedFiles.length, scenario.allowed, scenario.name)
    assert.equal(result.blockedVideoFiles.length, scenario.blocked, scenario.name)
    assert.deepEqual(
      result.allowedFiles.map((file) => file.name),
      scenario.files.filter((name) => scenario.videoUpload || !isVideoFixture(name)),
      `${scenario.name} must retain ordinary files in order`,
    )
    assert.deepEqual(
      result.blockedVideoFiles.map((file) => file.name),
      scenario.files.filter((name) => !scenario.videoUpload && isVideoFixture(name)),
      `${scenario.name} must report blocked videos in order`,
    )
    assert.equal(
      result.allowedFiles.length + result.blockedVideoFiles.length,
      files.length,
      `${scenario.name} must account for every fixture`,
    )
  }
})

test('knowledge upload dropdown passes the entitlement decision to the same partition seam', () => {
  assert.match(dropdown, /getCurrentEntitlement/)
  assert.match(dropdown, /entitlement\.video_upload !== true/)
  assert.match(dropdown, /partitionFilesForConsumerPlan/)
  assert.match(dropdown, /blockedVideoFiles/)
  assert.match(dropdown, /videoUpload/)
})

test('global knowledge drops reuse the video gate without changing chat drops', () => {
  assert.match(platform, /if \(isChatDropRoute\(\)\)[\s\S]*?return;[\s\S]*?partitionFilesForConsumerPlan/)
  assert.match(platform, /listKnowledgeFolders/)
  assert.match(platform, /exceedsConsumerStorageQuota/)
  assert.match(platform, /exceedsConsumerDocumentLimit/)
  assert.match(platform, /entitlement\.video_upload !== true/)
  assert.match(platform, /files: filesToDispatch/)
  assert.match(platform, /videoMixedUpgradeBody/)
  assert.match(platform, /showConsumerUpgradePrompt/)
  assert.match(platform, /let blockingUpgradeBody: string \| null = null/)
  assert.match(platform, /if \(blockingUpgradeBody\)[\s\S]*?else if \(blockedVideoCount > 0\)/)
})

test('large videos use recoverable multipart transport and retry idempotent completion', () => {
  assert.match(directUpload, /const multipart = true/)
  assert.match(directUpload, /retryDirectControlRequest\(\(\) => post\(/)
  assert.match(directUpload, /DIRECT_UPLOAD_MAX_ATTEMPTS = 3/)
})

test('supported social share hosts use server-owned media routing', () => {
  const isSupported = extractSocialShareHelper()
  for (const input of [
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '分享 https://x.com/example/status/1234567890123456789。',
    'https://www.instagram.com/reel/AbCdEf123/',
    'https://www.xiaohongshu.com/explore/64f123456789abcdef123456',
    'https://www.tiktok.com/@creator/video/1234567890123456789',
    '复制打开抖音 https://v.douyin.com/AbCdEf12/ 复制此文本',
  ]) {
    assert.equal(isSupported(input), true, input)
  }
  for (const input of [
    'https://example.com/article',
    'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://x.com/a/status/123456 https://x.com/b/status/654321',
    'https://user:password@x.com/a/status/123456',
  ]) {
    assert.equal(isSupported(input), false, input)
  }
})
