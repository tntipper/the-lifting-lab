/** Fake Vercel/Supabase responses for the real one-use Preview worker. No network. */
import assert from 'node:assert/strict'
import { runStagingPreviewDeploymentWorker } from '../../scripts/staging-surface-preview-deployment-worker.mjs'
import { STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../../scripts/staging-surface-activation-transport.mjs'
import { VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from '../../scripts/staging-surface-activation-native-binding.mjs'

const aliasHost = new URL(STAGING_ALIAS).hostname
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json', ...headers },
})

export function createStagingGeneration23PreviewWorkerFixture({ surface, now }) {
  if (!surface?.ports || typeof now !== 'number') throw Error('Offline Preview fixture unavailable')
  const calls = []
  let current
  const fetcher = async (url, options) => {
    assert.equal(options.signal.aborted, false)
    if (options.redirect === 'manual' && url.endsWith('/api/staging/readiness')) {
      assert.equal(options.headers?.['x-vercel-protection-bypass'], undefined)
      return json({ error: { message: 'Protected deployment', code: '401' },
        protection: { vercel_auth_callback: `https://vercel.com/sso-api?url=${encodeURIComponent(url)}&nonce=offline` } },
      401, { server: 'Vercel' })
    }
    if (url.includes('/v9/projects/')) return json({ id: VERCEL_PROJECT_ID,
      name: 'the-lifting-lab', accountId: VERCEL_TEAM_ID,
      link: { type: 'github', repoId: 1264363509, repoOwnerId: 12345,
        org: 'tntipper', repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } })
    if (options.method === 'POST' && url.includes('/v13/deployments')) {
      const body = JSON.parse(options.body)
      assert.equal(body.gitSource.sha, 'a'.repeat(40))
      assert.equal(body.gitSource.ref, 'codex/tll-integration')
      assert.equal(body.project, VERCEL_PROJECT_ID)
      const flags = await surface.ports.readSurfaceFlags(STAGING_SURFACE_TARGET)
      current = await surface.ports.createPreviewDeployment(STAGING_SURFACE_TARGET, {
        branch: body.gitSource.ref, sourceCommit: body.gitSource.sha,
        manifestSha256: body.meta.tllManifestSha256,
        publicCustomer: flags.publicCustomer, publicCart: flags.publicCart,
      })
      calls.push({ operation: 'POST', deploymentId: current.deploymentId })
      return json({ id: current.deploymentId, readyState: 'READY', target: null })
    }
    if (url.includes('/v13/deployments/')) {
      assert.ok(current)
      if (!url.includes('withGitRepoInfo=true')) return json({ id: current.deploymentId,
        readyState: 'READY', projectId: VERCEL_PROJECT_ID, ownerId: VERCEL_TEAM_ID, target: null })
      return json({ id: current.deploymentId, projectId: VERCEL_PROJECT_ID, ownerId: VERCEL_TEAM_ID,
        target: null, readyState: 'READY', url: new URL(current.immutableUrl).hostname,
        createdAt: now, gitSource: { type: 'github', repoId: 1264363509,
          ref: 'codex/tll-integration', sha: current.sourceCommit },
        meta: { githubCommitRef: 'codex/tll-integration', githubCommitSha: current.sourceCommit,
          tllManifestSha256: current.manifestSha256 } })
    }
    if (url.includes('/v4/aliases/')) {
      assert.ok(current)
      return json({ alias: aliasHost, projectId: VERCEL_PROJECT_ID,
        deploymentId: current.deploymentId,
        deployment: { id: current.deploymentId, url: new URL(current.immutableUrl).hostname } })
    }
    if (url.endsWith('/api/staging/readiness')) {
      assert.ok(current)
      const flags = await surface.ports.readSurfaceFlags(STAGING_SURFACE_TARGET)
      return json({ deploymentId: current.deploymentId, immutableUrl: current.immutableUrl,
        projectRef: STAGING_SURFACE_TARGET.projectRef, branch: 'codex/tll-integration',
        privateCustomer: flags.privateCustomer, privateCart: flags.privateCart,
        publicCustomer: flags.publicCustomer, publicCart: flags.publicCart })
    }
    if (url.endsWith('/tll-broker-token')) {
      const flags = await surface.ports.readSurfaceFlags(STAGING_SURFACE_TARGET)
      return json({ error: flags.edge ? 'invalid_client' : 'temporarily_unavailable' },
        flags.edge ? 401 : 503)
    }
    throw Error('Unexpected offline Preview request')
  }
  return Object.freeze({
    calls,
    async runBuild({ input, journal, signal }) {
      return runStagingPreviewDeploymentWorker({ input, journal, signal, now: () => now,
        acquireCredentials: async () => ({ vercelToken: Buffer.from('offline-vercel-token'),
          protectionBypassToken: Buffer.from('offline-bypass-token') }),
        fetch: fetcher, runCli: async () => { throw Error('CLI must not run') },
        stopWorkerGroup: () => { throw Error('Preview worker asked to stop') },
      })
    },
  })
}
