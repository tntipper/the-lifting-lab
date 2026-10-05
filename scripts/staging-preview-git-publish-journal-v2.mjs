/** New one-use publication identity; the consumed v1 record remains immutable evidence. */
import { resolve } from 'node:path'
import { createPreviewGitPublishJournal, PREVIEW_GIT_PUBLISH_JOURNAL_PATH } from './staging-preview-git-publish-journal.mjs'

export const PREVIEW_GIT_PUBLISH_JOURNAL_V2_PATH = resolve(import.meta.dirname,
  '../../implementation-state/staging/tll-preview-git-publish-v2.json')

export function createPreviewGitPublishJournalV2() {
  if (PREVIEW_GIT_PUBLISH_JOURNAL_V2_PATH === PREVIEW_GIT_PUBLISH_JOURNAL_PATH) {
    throw new Error('Fresh publication journal unavailable')
  }
  return createPreviewGitPublishJournal({ path: PREVIEW_GIT_PUBLISH_JOURNAL_V2_PATH })
}
