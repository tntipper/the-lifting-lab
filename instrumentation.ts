import { sentryOptions } from './lib/sentry-config'

const options = () => sentryOptions(process.env.TLL_SENTRY_ENABLED, process.env.SENTRY_DSN, process.env.VERCEL_ENV)

export async function register() {
  const opts = options()
  if (!opts) return
  const Sentry = await import('@sentry/nextjs')
  Sentry.init(opts)
}

export async function onRequestError(...args: unknown[]) {
  if (!options()) return
  const Sentry = await import('@sentry/nextjs')
  // @ts-expect-error forwarded verbatim to Sentry's Next.js request-error hook
  Sentry.captureRequestError(...args)
}
