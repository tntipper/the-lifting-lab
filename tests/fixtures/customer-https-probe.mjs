// Offline Node https boundary probe. Never opens a socket or imports real https.
import { EventEmitter } from 'node:events'
export const probe = { calls: [], scenario: null }
export class Agent { constructor(options) { this.options = options } }
export function request(url, options, onResponse) {
  const req = new EventEmitter(), call = { url, options, body: null, responseDestroyed: false }
  probe.calls.push(call)
  options.signal.addEventListener('abort', () => req.emit('error', Error('synthetic native abort')), { once: true })
  req.end = body => {
    call.body = body
    setImmediate(() => {
      const s = probe.scenario, res = new EventEmitter()
      if (s.error) { req.emit('error', Error('private-error-body')); return }
      res.statusCode = s.status ?? 200; res.headers = s.headers ?? {}; res.rawHeaders = s.rawHeaders ?? ['content-type', 'application/json']
      res.complete = s.complete !== false
      res.destroy = () => { call.responseDestroyed = true }
      onResponse(res)
      if (s.stall || call.responseDestroyed) return
      for (const chunk of s.chunks ?? []) res.emit('data', chunk)
      if (s.aborted) res.emit('aborted')
      else res.emit('end')
    })
  }
  return req
}
