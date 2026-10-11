/** Injected transport: three fixed GETs at most, never a provider mutation. */
const unavailable = () => { throw new Error('Protected Preview readiness unavailable') }

export function createPinnedReadinessReader({ fetcher, target }) {
  if (typeof fetcher !== 'function' || !target || typeof target.deploymentId !== 'string') unavailable()
  const allowed = new Set([target.aliasUrl, target.immutableUrl])
  let calls = 0
  return async (baseUrl, bypass) => {
    if (!allowed.has(baseUrl) || !Buffer.isBuffer(bypass) || ++calls > 3) unavailable()
    const address = `${baseUrl}/api/staging/readiness`
    const controller = new AbortController()
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Protected Preview readiness unavailable')) }, 10_000)
    })
    try {
      const response = await Promise.race([fetcher(address, { method: 'GET', redirect: 'error', cache: 'no-store',
        signal: controller.signal, headers: { 'x-tll-deployment-id': target.deploymentId,
          'x-vercel-protection-bypass': bypass.toString('utf8') } }), timeout])
      if (response.url !== address || response.status !== 200
        || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) unavailable()
      const length = Number(response.headers.get('content-length'))
      if (Number.isFinite(length) && length > 4_096) unavailable()
      const reader = response.body?.getReader?.()
      if (!reader) unavailable()
      const chunks = []
      let size = 0
      while (true) {
        const part = await Promise.race([reader.read(), timeout])
        if (part.done) break
        size += part.value.byteLength
        if (size > 4_096) unavailable()
        chunks.push(part.value)
      }
      return JSON.parse(Buffer.concat(chunks, size).toString('utf8'))
    } finally { clearTimeout(timer); controller.abort() }
  }
}
