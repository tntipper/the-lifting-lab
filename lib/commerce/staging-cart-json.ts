/** Bounded JSON transport: stop reading before an oversized provider body is retained. */
export async function cartJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Cart response unavailable')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > 65536) throw new Error('Cart response unavailable')
      chunks.push(next.value)
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
