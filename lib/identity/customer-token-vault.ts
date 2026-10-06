// Node-only authenticated application encryption. No environment/secret-store IO.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type EncryptedEnvelope = { v: 1; alg: 'A256GCM'; kid: string; iv: string; tag: string; ciphertext: string }
export type EnvelopeVault = {
  seal(value: object, context: readonly string[]): EncryptedEnvelope
  open<T>(value: unknown, context: readonly string[]): T
  destroy(): void
}
const MAX_BYTES = 131_072
const keyId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
const unavailable = () => new Error('Encrypted repository material unavailable')
function aad(context: readonly string[], kid: string): Buffer {
  if (!Array.isArray(context) || context.length < 2 || context.length > 32
    || [...context].some(x => typeof x !== 'string' || !x.length || x.length > 2048 || /[\x00-\x1f\x7f]/.test(x))) throw unavailable()
  return Buffer.from(JSON.stringify(['tll-envelope-v1', 1, 'A256GCM', kid, ...context]), 'utf8')
}
function decode(value: unknown, exactBytes?: number): Buffer {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 200_000) throw unavailable()
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.toString('base64url') !== value || (exactBytes !== undefined && bytes.length !== exactBytes)) throw unavailable()
  return bytes
}
/** A held server keyring must be injected. Keys are copied; no generated key or
 * plaintext is persisted. Retired decryption keys must remain until all retained
 * envelopes/backups are retired or reencrypted by a separately reviewed job. */
export function createAesGcmEnvelopeVault(input: { activeKeyId: string; keys: ReadonlyMap<string, Uint8Array> }): EnvelopeVault {
  if (!keyId(input.activeKeyId) || !(input.keys instanceof Map) || input.keys.size < 1 || input.keys.size > 16) throw unavailable()
  const keys = new Map<string, Buffer>()
  for (const [id, key] of input.keys) {
    if (!keyId(id) || !(key instanceof Uint8Array) || key.byteLength !== 32) {
      for (const value of keys.values()) value.fill(0)
      throw unavailable()
    }
    keys.set(id, Buffer.from(key))
  }
  if (!keys.has(input.activeKeyId)) { for (const key of keys.values()) key.fill(0); throw unavailable() }
  const active = input.activeKeyId
  return Object.freeze({
    seal(value: object, context: readonly string[]): EncryptedEnvelope {
      let plain: Buffer | undefined
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable()
        const key = keys.get(active); if (!key) throw unavailable()
        plain = Buffer.from(JSON.stringify(value), 'utf8')
        if (plain.length > MAX_BYTES || plain.length < 2) throw unavailable()
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
        cipher.setAAD(aad(context, active))
        const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()])
        return { v: 1, alg: 'A256GCM', kid: active, iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url'), ciphertext: ciphertext.toString('base64url') }
      } catch { throw unavailable() } finally { plain?.fill(0) }
    },
    open<T>(value: unknown, context: readonly string[]): T {
      let plain: Buffer | undefined
      try {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable()
        const e = value as Record<string, unknown>
        if (Object.keys(e).sort().join(',') !== 'alg,ciphertext,iv,kid,tag,v' || e.v !== 1 || e.alg !== 'A256GCM' || !keyId(e.kid)) throw unavailable()
        const key = keys.get(e.kid); if (!key) throw unavailable()
        const ciphertext = decode(e.ciphertext)
        if (ciphertext.length > MAX_BYTES) throw unavailable()
        const decipher = createDecipheriv('aes-256-gcm', key, decode(e.iv, 12), { authTagLength: 16 })
        decipher.setAAD(aad(context, e.kid)); decipher.setAuthTag(decode(e.tag, 16))
        plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
        const decoded = JSON.parse(plain.toString('utf8'))
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw unavailable()
        return decoded as T
      } catch { throw unavailable() } finally { plain?.fill(0) }
    },
    destroy() { for (const key of keys.values()) key.fill(0); keys.clear() },
  })
}
