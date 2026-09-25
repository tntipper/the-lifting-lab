/** Offline child-process fixture for the real one-use Preview worker composition. */
import { acceptSupervisorPipe, terminateProcessGroup } from '../../scripts/staging-provider-broker-recovery-process-control.mjs'
import { createStagingPreviewDeploymentJournal } from '../../scripts/staging-surface-preview-deployment-journal.mjs'
import { runStagingPreviewDeploymentWorker } from '../../scripts/staging-surface-preview-deployment-worker.mjs'
import { STAGING_ALIAS } from '../../scripts/staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from '../../scripts/staging-surface-activation-native-binding.mjs'

const proof = 'OFFLINE_PREVIEW_FULL_WORKER_PROOF'
const [mode, path] = process.argv.slice(2)
if (!['success', 'lost-post'].includes(mode) || !path?.startsWith('/')) process.exit(2)
const release = await acceptSupervisorPipe({ proof })
const id = 'dpl_offline123', immutableUrl = 'https://offline-123.vercel.app'
const sourceCommit = 'a'.repeat(40), manifestSha256 = 'b'.repeat(64)
const input = Object.freeze({ branch: 'codex/tll-integration', sourceCommit, manifestSha256,
  publicCustomer: false, publicCart: false })
const aliasHost = new URL(STAGING_ALIAS).hostname, createdAt = Date.now()
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers })
const fetcher = async (url, options) => {
  if (options.redirect === 'manual' && url.endsWith('/api/staging/readiness')) {
    return json({ error: { message: 'Protected deployment', code: '401' },
      protection: { vercel_auth_callback: `https://vercel.com/sso-api?url=${encodeURIComponent(url)}&nonce=offline` } },
    401, { 'content-type': 'application/json', server: 'Vercel' })
  }
  if (url.includes('/v9/projects/')) return json({ id: VERCEL_PROJECT_ID, name: 'the-lifting-lab', accountId: VERCEL_TEAM_ID,
    link: { type: 'github', repoId: 1264363509, repoOwnerId: 12345, org: 'tntipper',
      repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } })
  if (options.method === 'POST' && url.includes('/v13/deployments')) {
    if (mode === 'lost-post') throw Error('offline acknowledgement lost')
    return json({ id, readyState: 'READY', target: null })
  }
  if (url.includes('/v13/deployments/')) {
    if (!url.includes('withGitRepoInfo=true')) return json({ id, readyState: 'READY', projectId: VERCEL_PROJECT_ID,
      ownerId: VERCEL_TEAM_ID, target: null })
    return json({ id, projectId: VERCEL_PROJECT_ID, ownerId: VERCEL_TEAM_ID,
      target: null, readyState: 'READY', url: new URL(immutableUrl).hostname, createdAt,
      gitSource: { type: 'github', repoId: 1264363509, ref: input.branch, sha: sourceCommit },
      meta: { githubCommitRef: input.branch, githubCommitSha: sourceCommit,
        tllManifestSha256: manifestSha256 } })
  }
  if (url.includes('/v4/aliases/')) return json({ alias: aliasHost, projectId: VERCEL_PROJECT_ID,
    deploymentId: id, deployment: { id, url: new URL(immutableUrl).hostname } })
  if (url === `${immutableUrl}/api/staging/readiness`) return json({ deploymentId: id, immutableUrl,
    projectRef: 'qdmvngjwkcsilzmqksme', branch: input.branch,
    privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false })
  if (url.endsWith('/tll-broker-token')) return json({ error: 'temporarily_unavailable' }, 503)
  throw Error('unexpected offline URL')
}
try {
  const result = await runStagingPreviewDeploymentWorker({ input,
    journal: createStagingPreviewDeploymentJournal({ path }),
    acquireCredentials: async () => ({ vercelToken: Buffer.from('offline-vercel-token'),
      protectionBypassToken: Buffer.from('offline-bypass-token') }),
    fetch: fetcher, runCli: async () => { throw Error('CLI must not run') },
    stopWorkerGroup: () => terminateProcessGroup(process.pid), signal: new AbortController().signal })
  release()
  process.stdout.write(`${JSON.stringify({ status: result.status, deploymentId: result.deploymentId })}\n`)
} catch {
  release()
  process.exitCode = 1
}
