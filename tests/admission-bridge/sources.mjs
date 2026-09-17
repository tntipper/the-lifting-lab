// Only roles are mapped: PostgreSQL roles are cluster-wide and canonical roles
// belong to separate fixtures. Schemas/functions/SQL/protocol strings are unchanged.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
export const mappings = Object.freeze({
  tll_broker_owner: 'tll_ab_broker_owner', tll_broker_executor: 'tll_ab_broker_executor', tll_broker_role_setup: 'tll_ab_broker_role_setup',
  tll_provisional_owner: 'tll_ab_provisional_owner', tll_provisional_executor: 'tll_ab_provisional_executor', tll_provisional_role_setup: 'tll_ab_provisional_role_setup',
  tll_bridge_owner: 'tll_ab_bridge_owner', tll_bridge_executor: 'tll_ab_bridge_executor',
})
export const migrations = [
  ['202609150007_customer_subject_broker_repository.sql', '37448121534cca6fee076cbccc783b1eb13622d319d8151a4366f91e0afbce5b'],
  ['202609170008_customer_provisional_admission_repository.sql', '2c98a3de46b6bab744681f05dadad0a10b4b258dd63b251beda9f636591ec089'],
  ['202609170010_customer_admission_bridge.sql', null],
]
export const digest = text => createHash('sha256').update(text).digest('hex')
export function source(index) {
  const [name, pin] = migrations[index], original = readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8')
  if (pin && digest(original) !== pin) throw Error('Reviewed migration source hash changed')
  let adapted = original
  for (const [canonical, local] of Object.entries(mappings)) adapted = adapted.replace(new RegExp(`(?<![A-Za-z0-9_$])${canonical}(?![A-Za-z0-9_$])`, 'g'), local)
  let restored = adapted
  for (const [canonical, local] of Object.entries(mappings)) restored = restored.replace(new RegExp(`(?<![A-Za-z0-9_$])${local}(?![A-Za-z0-9_$])`, 'g'), canonical)
  if (restored !== original) throw Error('Fixture changed non-role source bytes')
  return { name, original, adapted, sha256: digest(original) }
}
export const body = text => {
  if (!text.includes('BEGIN;\n') || !text.endsWith('COMMIT;\n')) throw Error('Migration transaction shape changed')
  return text.replace('BEGIN;\n', '').replace(/COMMIT;\n$/, '')
}
