import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { PREVIEW_GIT_PUBLISH_JOURNAL_PATH } from '../scripts/staging-preview-git-publish-journal.mjs'
import { PREVIEW_GIT_PUBLISH_JOURNAL_V2_PATH,
  createPreviewGitPublishJournalV2 } from '../scripts/staging-preview-git-publish-journal-v2.mjs'

test('new publication uses a distinct fixed record and leaves the old one untouched', () => {
  assert.equal(PREVIEW_GIT_PUBLISH_JOURNAL_V2_PATH, resolve(import.meta.dirname,
    '../../implementation-state/staging/tll-preview-git-publish-v2.json'))
  assert.notEqual(PREVIEW_GIT_PUBLISH_JOURNAL_V2_PATH, PREVIEW_GIT_PUBLISH_JOURNAL_PATH)
  assert.equal(typeof createPreviewGitPublishJournalV2().read, 'function')
})
