/** Task-owned temporary fixture copies; never edits tracked OFF source or issues authority. */
import { readFile, writeFile, mkdtemp } from 'node:fs/promises'
import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const scripts = new URL('../../scripts/', import.meta.url)
export async function successorFixtureModules({ startedAt, expiresAt } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'tll-successor-native-fixture-'))
  process.once('exit', () => rmSync(root, { recursive: true, force: true }))
  const urls = new Map()
  async function load(name) {
    if (urls.has(name)) return urls.get(name)
    const url = pathToFileURL(join(root, name)).href
    urls.set(name, url)
    let source = await readFile(new URL(name, scripts), 'utf8')
    source = source.replace(/^(export const OWNER_SUCCESSOR_[A-Z0-9_]*ENABLED = )false$/gm, '$1true')
      .replace("export const ACTIVE_WINDOW_STARTED_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_STARTED_AT = '${startedAt}'`)
      .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
      .replaceAll('import.meta.dirname', JSON.stringify(fileURLToPath(scripts)))
    for (const match of [...source.matchAll(/from '(\.\/staging-owner-successor-[a-z-]+\.mjs)'/g)]) {
      const child = match[1].slice(2)
      const imported = child === 'staging-owner-successor-registration.mjs' ? new URL(child, scripts).href : await load(child)
      source = source.replaceAll(`from '${match[1]}'`, `from '${imported}'`)
    }
    source = source.replaceAll("from './", `from '${scripts.href}`)
      .replaceAll("from '../", `from '${new URL('../', scripts).href}`)
    await writeFile(fileURLToPath(url), source, { mode: 0o600, flag: 'wx' })
    return url
  }
  return { import: async name => import(await load(name)), url: load }
}
