import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

async function fixture () {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tll-retired-design-')))
  const scripts = join(root, 'repository', 'scripts')
  const home = join(root, 'home')
  await mkdir(scripts, { recursive: true }); await mkdir(home)
  for (const name of ['staging-readonly-preflight.mjs', 'staging-readonly-preflight-keychain.py', 'staging-readonly-historical-design-qualification.mjs']) {
    await copyFile(new URL(`../scripts/${name}`, import.meta.url), join(scripts, name))
  }
  return { root, scripts, home, marker: join(root, 'retired-executed'),
    historical: join(root, 'implementation-state/staging/generation-launcher-2026-09-18/native_adapter.py'),
    env: { PATH: '/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8' } }
}
function child (f, source) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
    cwd: join(f.root, 'repository'), env: f.env, encoding: 'utf8', timeout: 15_000, maxBuffer: 16_384,
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
}
for (const state of ['missing', 'tampered']) test(`retired design ${state}: disabled entry never reads credentials, spawns native code or dispatches network`, async () => {
  const f = await fixture()
  try {
    if (state === 'tampered') {
      await mkdir(join(f.root, 'implementation-state/staging/generation-launcher-2026-09-18'), { recursive: true })
      await writeFile(f.historical, `open(${JSON.stringify(f.marker)}, 'w').write('retired code executed')\nraise RuntimeError('never execute this fixture')\n`)
    }
    child(f, `
      import assert from 'node:assert/strict'; import cp from 'node:child_process'; import https from 'node:https';
      import { syncBuiltinESMExports } from 'node:module';
      let spawns=0, requests=0, reads=0;
      cp.spawnSync=()=>{spawns++; throw Error('native spawn forbidden')};
      https.request=()=>{requests++; throw Error('network forbidden')}; syncBuiltinESMExports();
      const api=await import(${JSON.stringify(pathToFileURL(join(f.scripts, 'staging-readonly-preflight.mjs')).href)});
      assert.deepEqual(await api.runPreflightOnce(), {status:'NATIVE_ACCESS_DISABLED',target:api.PROJECT_REF,queryId:api.QUERY_ID});
      assert.deepEqual(await api.runPreflightOnce({readToken:()=>{reads++;throw Error('read forbidden')},post:()=>{requests++;throw Error('post forbidden')}}), {status:'NATIVE_ACCESS_DISABLED',target:api.PROJECT_REF,queryId:api.QUERY_ID});
      assert.equal(spawns,0); assert.equal(requests,0); assert.equal(reads,0);
    `)
    const cli = spawnSync(process.execPath, [join(f.scripts, 'staging-readonly-preflight.mjs')], { env: f.env, encoding: 'utf8', timeout: 15_000 })
    assert.equal(cli.status, 0); assert.equal(cli.stderr, '')
    assert.equal(JSON.parse(cli.stdout).status, 'NATIVE_ACCESS_DISABLED')
    assert.equal(existsSync(f.marker), false)
    const historical = spawnSync(process.execPath, [join(f.scripts, 'staging-readonly-historical-design-qualification.mjs')], { env: f.env, encoding: 'utf8', timeout: 15_000 })
    assert.equal(historical.status, 1); assert.equal(historical.stderr, '')
    const receipt = JSON.parse(historical.stdout)
    assert.equal(receipt.status, 'BLOCKED_HISTORICAL_PROVENANCE')
    assert.equal(receipt.evidenceStatus, 'UNVERIFIED'); assert.equal(receipt.authorization, 'NONE')
    assert.equal(receipt.reason, state === 'missing' ? 'MISSING_ARTIFACT' : 'ARTIFACT_MISMATCH')
    assert.equal(receipt.expectedSha256, '835cc3394a3f01e18df91d2e111d384aa48592f10e8a239c603b59cd56627bed')
    assert.equal(existsSync(f.marker), false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})

test('native dispatch selects only the committed current helper and wipes synthetic output, even with malicious retired bytes', async () => {
  const f = await fixture()
  try {
    await mkdir(join(f.root, 'implementation-state/staging/generation-launcher-2026-09-18'), { recursive: true })
    await writeFile(f.historical, `open(${JSON.stringify(f.marker)}, 'w').write('never execute')\n`)
    const path = join(f.scripts, 'staging-readonly-preflight.mjs')
    const source = await readFile(path, 'utf8')
    // This owned module copy enables only the injected dispatch boundary; no real native helper runs.
    await writeFile(path, source.replace('export const NATIVE_ACCESS_APPROVED = false', 'export const NATIVE_ACCESS_APPROVED = true'))
    child(f, `
      import assert from 'node:assert/strict'; import cp from 'node:child_process'; import {syncBuiltinESMExports} from 'node:module';
      let calls=0; const stdout=Buffer.from('sbp_'+'a'.repeat(40)); const stderr=Buffer.alloc(0);
      cp.spawnSync=(command,args,options)=>{
        calls++; assert.equal(command,'/usr/bin/python3');
        assert.deepEqual(args,['-I','-S',${JSON.stringify(join(f.scripts, 'staging-readonly-preflight-keychain.py'))}]);
        assert.deepEqual(options.env,{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'});
        assert.equal(options.timeout,15000); assert.equal(options.maxBuffer,512);
        return {status:0,stdout,stderr};
      }; syncBuiltinESMExports();
      const api=await import(${JSON.stringify(pathToFileURL(path).href)});
      if(process.platform==='darwin') {
        assert.equal(api.readTokenFromExactKeychain(),'sbp_'+'a'.repeat(40)); assert.equal(calls,1);
        assert.ok(stdout.every(byte=>byte===0));
      } else {assert.throws(()=>api.readTokenFromExactKeychain()); assert.equal(calls,0)}
    `)
    assert.equal(existsSync(f.marker), false)
  } finally { await rm(f.root, { recursive: true, force: true }) }
})
