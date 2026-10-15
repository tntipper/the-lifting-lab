import { sentryOptions } from './lib/sentry-config'

const opts = sentryOptions(process.env.NEXT_PUBLIC_TLL_SENTRY_ENABLED, process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_VERCEL_ENV)
if (opts) void import('@sentry/nextjs').then(Sentry => Sentry.init(opts))
