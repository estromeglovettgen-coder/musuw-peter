import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../../assets/business-baselines/ChatIndex.pre-view.vue', import.meta.url), 'utf8')

test('legacy chat attachment uploads refresh the shared quota snapshot immediately', () => {
  assert.match(source, /useCurrentEntitlementStore/)
  assert.match(source, /const entitlementStore = useCurrentEntitlementStore\(\)/)
  assert.match(source, /const refreshEntitlementAfterAttachmentUpload = \(\) => \{[\s\S]*?entitlementStore\.refresh\(\)/)

  const imageUpload = source.slice(source.indexOf('const upload = await uploadTemporaryAttachment('), source.indexOf('const localAttachments'))
  assert.match(imageUpload, /imageAttachmentIds\.push\(upload\.data\.id\)[\s\S]*?refreshEntitlementAfterAttachmentUpload\(\)/)

  const documentUpload = source.slice(source.indexOf('await Promise\.all(localAttachments'.replace('\\.', '.')), source.indexOf('// Send any successfully uploaded attachment'))
  assert.match(documentUpload, /attachment\.documentId = upload\.data\.id[\s\S]*?refreshEntitlementAfterAttachmentUpload\(\)/)
})
