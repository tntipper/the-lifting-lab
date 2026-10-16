import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { createPreviewSourceReadJournal } from '../scripts/staging-preview-source-journal.mjs'
import { runPreviewSourceObservation } from '../scripts/staging-preview-source-observer.mjs'
import { createStagingAccountHostedBaselineVercelBinding } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { createStagingPreviewSourceReadbackBinding } from '../scripts/staging-account-hosted-baseline-surface.mjs'

const projectId = 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4'
const teamId = 'team_gf7cgIkkoeMLtODFDDT5MrW4'
const aliasHost = 'the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app'
const deploymentId = 'dpl_A1b2c3'
const projectUrl = `https://api.vercel.com/v9/projects/${projectId}?teamId=${teamId}`
const aliasUrl = `https://api.vercel.com/v4/aliases/${aliasHost}?projectId=${projectId}&teamId=${teamId}`
const deploymentUrl = `https://api.vercel.com/v13/deployments/${deploymentId}?withGitRepoInfo=true&teamId=${teamId}`
const response = value => new Response(JSON.stringify(value), { status: 200 })
const project = () => ({ id: projectId, name: 'the-lifting-lab', accountId: teamId,
  link: { type: 'github', repoId: 1264363509, repoOwnerId: 123, org: 'tntipper', repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } })
const alias = () => ({ alias: aliasHost, projectId, deploymentId,
  deployment: { id: deploymentId, url: 'the-lifting-lab-abc123.vercel.app' } })
const deployment = () => ({ id: deploymentId, projectId, ownerId: teamId, readyState: 'READY', target: null,
  url: 'the-lifting-lab-abc123.vercel.app', gitSource: { type: 'github', repoId: 1264363509,
    ref: 'codex/tll-integration', sha: 'a'.repeat(40) } })
const uuid = '12345678-1234-4123-8123-123456789abc'
function sandbox (callback) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-preview-source-'))
  try { return callback(join(directory, 'journal.json')) } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('journal is mode-0600, ordered, terminal and rejects replay', () => sandbox(path => {
  const journal = createPreviewSourceReadJournal({ path, makeRunId: () => uuid })
  const first = journal.start()
  assert.equal(fs.statSync(path).mode & 0o777, 0o600)
  assert.throws(() => journal.start())
  assert.throws(() => journal.record(first, 'SOURCE_READ'))
  const projectPhase = journal.record(first, 'PROJECT_READ')
  const sourcePhase = journal.record(projectPhase, 'SOURCE_READ')
  const terminal = journal.finish(sourcePhase, 'OBSERVED')
  assert.equal(terminal.outcome, 'OBSERVED')
  assert.equal(createPreviewSourceReadJournal({ path }).read().outcome, 'OBSERVED')
  assert.throws(() => journal.finish(sourcePhase, 'OBSERVED'))
  assert.throws(() => createPreviewSourceReadJournal({ path }).start())
}))

test('journal handles partial writes and rejects zero-byte writes', () => sandbox(path => {
  const partial = { ...fs, writeSync: (fd, bytes, offset, length, position) => fs.writeSync(fd, bytes, offset, Math.min(2, length), position) }
  const journal = createPreviewSourceReadJournal({ path, fileSystem: partial, makeRunId: () => uuid })
  const first = journal.start()
  const second = journal.record(first, 'PROJECT_READ')
  assert.equal(journal.finish(second, 'READ_UNAVAILABLE').outcome, 'READ_UNAVAILABLE')
  const zeroDirectory = fs.mkdtempSync(join(tmpdir(), 'tll-preview-zero-'))
  const blocked = createPreviewSourceReadJournal({ path: join(zeroDirectory, 'journal.json'),
    fileSystem: { ...fs, writeSync: () => 0 }, makeRunId: () => uuid })
  try { assert.throws(() => blocked.start()) } finally { rmSync(zeroDirectory, { recursive: true, force: true }) }
}))

test('observer makes exactly three fixed Vercel GETs, wipes credential and consumes journal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-preview-observer-'))
  try {
    const path = join(directory, 'journal.json'), calls = [], credential = Buffer.from('private-token-123')
    const fetch = async (url, options) => {
      calls.push({ url, options })
      return response(url === projectUrl ? project() : url === aliasUrl ? alias() : deployment())
    }
    const input = { readCredential: () => credential,
      openProject: vercelToken => createStagingAccountHostedBaselineVercelBinding({ fetch, vercelToken }),
      openSource: vercelToken => createStagingPreviewSourceReadbackBinding({ fetch, vercelToken }),
      journal: createPreviewSourceReadJournal({ path, makeRunId: () => uuid }) }
    const result = await runPreviewSourceObservation(input)
    assert.equal(result.status, 'OBSERVED')
    assert.equal(result.receipt.status, 'CURRENT_SOURCE_UNPROVEN')
    assert.deepEqual(calls.map(item => item.url), [projectUrl, aliasUrl, deploymentUrl])
    assert.ok(calls.every(item => item.options.method === 'GET'))
    assert.ok(credential.every(byte => byte === 0))
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).outcome, 'OBSERVED')
    assert.equal((await runPreviewSourceObservation(input)).status, 'REPLAY_REJECTED')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('repository drift fails closed and consumes the one-shot journal', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-preview-observer-'))
  try {
    const path = join(directory, 'journal.json'), calls = []
    const fetch = async url => {
      calls.push(url)
      return response(url === projectUrl ? { ...project(), link: { ...project().link, repoId: 998877 } }
        : url === aliasUrl ? alias() : deployment())
    }
    const result = await runPreviewSourceObservation({ readCredential: () => Buffer.from('private-token-123'),
      openProject: vercelToken => createStagingAccountHostedBaselineVercelBinding({ fetch, vercelToken }),
      openSource: vercelToken => createStagingPreviewSourceReadbackBinding({ fetch, vercelToken }),
      journal: createPreviewSourceReadJournal({ path, makeRunId: () => uuid }) })
    assert.equal(result.status, 'READ_UNAVAILABLE')
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).outcome, 'RECONCILIATION_REQUIRED')
    assert.deepEqual(calls, [projectUrl])
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('deadline aborts a pending credential read and wipes late delivery', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-preview-observer-'))
  try {
    let deliver, opened = 0
    const credential = Buffer.from('private-token-123')
    const result = await runPreviewSourceObservation({
      readCredential: () => new Promise(resolve => { deliver = resolve }),
      openProject: () => { opened++; throw new Error('should not open') },
      openSource: () => { opened++; throw new Error('should not open') },
      journal: createPreviewSourceReadJournal({ path: join(directory, 'journal.json'), makeRunId: () => uuid }),
      setTimer: callback => { setImmediate(callback); return 1 }, clearTimer: () => {},
    })
    assert.equal(result.status, 'READ_UNAVAILABLE')
    assert.equal(opened, 0)
    assert.equal(JSON.parse(readFileSync(join(directory, 'journal.json'), 'utf8')).outcome, 'RECONCILIATION_REQUIRED')
    deliver(credential)
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(credential.every(byte => byte === 0))
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('expired deadline stops before credential access and mid-project timeout prevents source read', async () => {
  for (const point of ['before-credential', 'mid-project']) {
    const directory = mkdtempSync(join(tmpdir(), 'tll-preview-observer-'))
    try {
      let credentials = 0, sourceReads = 0, timers = 0, ticks = 0
      const result = await runPreviewSourceObservation({
        readCredential: () => { credentials++; return Buffer.from('private-token-123') },
        openProject: () => ({ readProject: ({ signal }) => new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
        }), dispose: () => {} }),
        openSource: () => ({ readSource: () => { sourceReads++; throw new Error('should not read') }, dispose: () => {} }),
        journal: createPreviewSourceReadJournal({ path: join(directory, 'journal.json'), makeRunId: () => uuid }),
        now: point === 'before-credential' ? () => ++ticks === 1 ? 0 : 45_000 : Date.now,
        setTimer: (callback, ms) => setTimeout(callback, ++timers === 2 ? 0 : ms), clearTimer: clearTimeout,
      })
      assert.equal(result.status, 'READ_UNAVAILABLE')
      assert.equal(credentials, point === 'before-credential' ? 0 : 1)
      assert.equal(sourceReads, 0)
      assert.equal(JSON.parse(readFileSync(join(directory, 'journal.json'), 'utf8')).outcome, 'RECONCILIATION_REQUIRED')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }
})

test('journal start and phase-write failures prevent hosted reads', async () => {
  for (const failure of ['start', 'record']) {
    const directory = mkdtempSync(join(tmpdir(), 'tll-preview-observer-'))
    try {
      const path = join(directory, 'journal.json'), actual = createPreviewSourceReadJournal({ path, makeRunId: () => uuid })
      let requests = 0
      const journal = { ...actual,
        start: failure === 'start' ? () => { throw new Error('start unavailable') } : actual.start,
        record: failure === 'record' ? () => { throw new Error('record unavailable') } : actual.record }
      const result = await runPreviewSourceObservation({ readCredential: () => Buffer.from('private-token-123'),
        openProject: () => ({ readProject: () => { requests++; throw new Error('should not read') }, dispose: () => {} }),
        openSource: () => ({ readSource: () => { requests++; throw new Error('should not read') }, dispose: () => {} }), journal })
      assert.equal(result.status, 'READ_UNAVAILABLE')
      assert.equal(requests, 0)
      assert.equal(fs.existsSync(path), failure === 'record')
      if (failure === 'record') assert.equal(JSON.parse(readFileSync(path, 'utf8')).outcome, 'RECONCILIATION_REQUIRED')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }
})

test('cleanup or journal finalization uncertainty never returns an observation', async () => {
  for (const failure of ['none', 'dispose', 'finish']) {
    const directory = mkdtempSync(join(tmpdir(), 'tll-preview-observer-'))
    try {
      const realJournal = createPreviewSourceReadJournal({ path: join(directory, 'journal.json'), makeRunId: () => uuid })
      const journal = failure === 'finish' ? { ...realJournal, finish: () => { throw new Error('disk failure') } } : realJournal
      const result = await runPreviewSourceObservation({
        readCredential: () => Buffer.from('private-token-123'),
        openProject: () => ({ readProject: async () => ({ repository: { provider: 'github', repoId: 1264363509 },
          target: { projectId, teamId } }), dispose: () => { if (failure === 'dispose') throw new Error('cleanup failure') } }),
        openSource: () => ({ readSource: async () => ({ projectId, teamId, branch: 'codex/tll-integration',
          repositoryId: '1264363509', gitProvider: 'github', deploymentId,
          immutableUrl: 'https://the-lifting-lab-abc123.vercel.app', gitSourceCommit: 'a'.repeat(40),
          applicationManifestSha256: null }), dispose: () => {} }),
        journal,
      })
      assert.equal(result.status, failure === 'none' ? 'OBSERVED' : 'READ_UNAVAILABLE')
      const saved = JSON.parse(readFileSync(join(directory, 'journal.json'), 'utf8'))
      assert.equal(saved.outcome, failure === 'none' ? 'OBSERVED' : failure === 'dispose' ? 'RECONCILIATION_REQUIRED' : null)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  }
})

test('live launcher and Keychain selector remain disabled before all access', () => {
  const launcher = readFileSync('scripts/staging-preview-source-live-launcher.mjs', 'utf8')
  const helper = readFileSync('scripts/staging-preview-source-keychain.py', 'utf8')
  assert.match(launcher, /export const PREVIEW_SOURCE_LIVE_ENABLED = false/)
  assert.match(helper, /^APPROVED_PREVIEW_SOURCE_READ = False$/m)
  assert.match(launcher, /if \(PREVIEW_SOURCE_LIVE_ENABLED !== true\) return/)
  assert.doesNotMatch(helper, /vercel-bypass|Supabase CLI/)
})
