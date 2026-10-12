import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { DeliveryAddress } from './types'

/** Server-only authenticated encryption. Key is injected, never read from an env file or persisted. */
export function sealDelivery(address: DeliveryAddress, key: Uint8Array, context: string): string {
  if (key.byteLength !== 32) throw new Error('DELIVERY_KEY_INVALID')
  const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(Buffer.from(context))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(address), 'utf8'), cipher.final()])
  return JSON.stringify({ v: 1, nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') })
}
/** Future private persistence reader; order/shop context prevents swapping encrypted addresses. */
export function openDelivery(envelope: string, key: Uint8Array, context: string): DeliveryAddress {
  if (key.byteLength !== 32) throw new Error('DELIVERY_KEY_INVALID')
  const value = JSON.parse(envelope)
  if (value.v !== 1) throw new Error('DELIVERY_ENVELOPE_INVALID')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(value.nonce, 'base64'))
  decipher.setAAD(Buffer.from(context)); decipher.setAuthTag(Buffer.from(value.tag, 'base64'))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8'))
}
