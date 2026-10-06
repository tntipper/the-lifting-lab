import test from 'node:test'
import assert from 'node:assert/strict'
import { assessStagingPreviewGitAcceptance, STAGING_PREVIEW_GIT_ACCEPTANCE_ENABLED } from '../scripts/staging-preview-git-acceptance.mjs'
import { STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const sha = 'a'.repeat(40), manifest = 'b'.repeat(64)
const deploymentId = 'dpl_Ab123', immutableUrl = 'https://the-lifting-lab-abc123.vercel.app'
const project = Object.freeze({
  target: Object.freeze({ projectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', project: 'the-lifting-lab',
    scope: 'my-lifting-lab-s-projects', teamId: 'team_gf7cgIkkoeMLtODFDDT5MrW4',
    environment: 'preview', branch: 'codex/tll-integration' }),
  repository: Object.freeze({ provider: 'github', repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab',
    ownerId: 776655, productionBranch: 'main', sourceless: true }),
})
const git = Object.freeze({ status: 'SOURCE_PROOF_VERIFIED', sourceCommit: sha, manifestSha256: manifest })
const deployment = Object.freeze({ projectId: project.target.projectId, teamId: project.target.teamId,
  branch: project.target.branch, alias: STAGING_ALIAS, deploymentId, immutableUrl,
  gitProvider: 'github', repositoryId: '1264363509', gitSourceCommit: sha,
  applicationManifestSha256: null })
const surface = Object.freeze({
  deployment: Object.freeze({ ...deployment, project: 'the-lifting-lab', scope: 'my-lifting-lab-s-projects' }),
  surface: Object.freeze({
    edge: Object.freeze({ target: STAGING_SURFACE_TARGET, functionName: 'customer-subject-broker', enabled: false }),
    flags: Object.freeze({ target: STAGING_SURFACE_TARGET, privateCustomer: false, privateCart: false,
      publicCustomer: false, publicCart: false }),
  }),
})
const selectedSource = Object.freeze({ sourceCommit: sha, manifestSha256: manifest })
const evidence = () => ({ selectedSource, project, gitBefore: git, before: deployment, surface, after: deployment, gitAfter: git })
const held = value => assert.deepEqual(assessStagingPreviewGitAcceptance(value), { status: 'SOURCE_ACCEPTANCE_HOLD' })

test('exact Git commit and manifest plus deployment-bound disabled runtime yield a source-only receipt', () => {
  assert.equal(STAGING_PREVIEW_GIT_ACCEPTANCE_ENABLED, false)
  const result = assessStagingPreviewGitAcceptance(evidence())
  assert.deepEqual(result, { status: 'SOURCE_PROVEN_RUNTIME_HELD', projectRef: 'qdmvngjwkcsilzmqksme',
    projectId: project.target.projectId, repositoryId: '1264363509', branch: project.target.branch,
    deploymentId, immutableUrl, sourceCommit: sha, gitManifestSha256: manifest })
  assert.equal(Object.isFrozen(result), true)
  assert.equal(Object.hasOwn(result, 'applicationManifestSha256'), false)
})

test('source proof, repository, branch and metadata conflicts hold without an acceptance receipt', () => {
  held({ ...evidence(), selectedSource: undefined })
  held({ ...evidence(), selectedSource: { ...selectedSource, sourceCommit: 'c'.repeat(40) } })
  held({ ...evidence(), selectedSource: { ...selectedSource, manifestSha256: 'c'.repeat(64) } })
  held({ ...evidence(), selectedSource: { ...selectedSource, sourceCommit: [sha] } })
  for (const key of ['sourceCommit', 'manifestSha256']) {
    let reads = 0
    const accessor = { ...selectedSource }
    Object.defineProperty(accessor, key, { enumerable: true, get() { reads++; return selectedSource[key] } })
    held({ ...evidence(), selectedSource: accessor })
    assert.equal(reads, 0)
  }
  held({ ...evidence(), gitBefore: undefined })
  held({ ...evidence(), gitAfter: { ...git, sourceCommit: 'c'.repeat(40) } })
  held({ ...evidence(), gitAfter: { ...git, manifestSha256: 'c'.repeat(64) } })
  held({ ...evidence(), gitBefore: { ...git, manifestSha256: 'invalid' } })
  held({ ...evidence(), project: { ...project, repository: { ...project.repository, repoId: 22 } } })
  held({ ...evidence(), project: { ...project, target: { ...project.target, projectId: 'prj_other' } } })
  held({ ...evidence(), project: { ...project, target: { ...project.target, teamId: 'team_other' } } })
  held({ ...evidence(), project: { ...project, target: { ...project.target, environment: 'production' } } })
  held({ ...evidence(), before: { ...deployment, branch: 'main' } })
  held({ ...evidence(), before: { ...deployment, alias: 'https://other.vercel.app' } })
  held({ ...evidence(), after: { ...deployment, applicationManifestSha256: 'c'.repeat(64) } })
  const matchingMetadata = { ...deployment, applicationManifestSha256: manifest }
  assert.equal(assessStagingPreviewGitAcceptance({ ...evidence(), before: matchingMetadata, after: matchingMetadata,
    surface: { ...surface, deployment: { ...surface.deployment, applicationManifestSha256: manifest } } }).status,
  'SOURCE_PROVEN_RUNTIME_HELD')
})

test('moving alias, changed source, enabled runtime or mismatched surface stays held', () => {
  held({ ...evidence(), after: { ...deployment, deploymentId: 'dpl_Different' } })
  held({ ...evidence(), after: { ...deployment, gitSourceCommit: 'c'.repeat(40) } })
  held({ ...evidence(), surface: { ...surface, deployment: { ...surface.deployment, immutableUrl: 'https://other.vercel.app' } } })
  held({ ...evidence(), surface: { ...surface, surface: { ...surface.surface,
    flags: { ...surface.surface.flags, publicCustomer: true } } } })
  for (const key of ['privateCustomer', 'privateCart', 'publicCart']) held({ ...evidence(), surface: { ...surface,
    surface: { ...surface.surface, flags: { ...surface.surface.flags, [key]: true } } } })
  held({ ...evidence(), surface: { ...surface, surface: { ...surface.surface,
    edge: { ...surface.surface.edge, enabled: true } } } })
  held({ ...evidence(), surface: { ...surface, surface: { ...surface.surface,
    flags: { ...surface.surface.flags, target: { ...STAGING_SURFACE_TARGET, projectRef: 'wrhgscovsgsudtedbljr' } } } } })
})

test('source gate stays pure and cannot deploy, contact a host or enable sign-in', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('../scripts/staging-preview-git-acceptance.mjs', import.meta.url), 'utf8'))
  assert.doesNotMatch(source, /fetch\(|child_process|Keychain|createDeployment\(|process\.env|process\.argv/)
})
