// Error tracking is OFF unless explicitly enabled. Both a flag and a DSN are required.
// Server: TLL_SENTRY_ENABLED=1 + SENTRY_DSN. Browser: NEXT_PUBLIC_TLL_SENTRY_ENABLED=1 + NEXT_PUBLIC_SENTRY_DSN.
// No PII: sendDefaultPii stays false and no replay/session recording is configured.
export function sentryOptions(flag: string | undefined, dsn: string | undefined, environment: string | undefined) {
  if (flag !== '1' || !dsn) return null
  return { dsn, environment: environment ?? 'production', sendDefaultPii: false, tracesSampleRate: 0 }
}
