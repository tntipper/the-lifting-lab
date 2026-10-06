// Only this versioned, unexpired explicit choice enables optional analytics.
export const ANALYTICS_CHOICE_KEY = 'tll.analytics-choice.v1'
export const REJECTION_COOKIE = 'tll_analytics_rejected_v1'
export const CHOICE_LIFETIME_MS = 180 * 24 * 60 * 60 * 1000
export type AnalyticsChoice = 'accepted' | 'rejected'

export function readAnalyticsChoice(): AnalyticsChoice | null {
  try {
    if (document.cookie.split(';').some(part => part.trim() === `${REJECTION_COOKIE}=1`)) return 'rejected'
    const record = JSON.parse(localStorage.getItem(ANALYTICS_CHOICE_KEY) || 'null')
    if (record?.version !== 1 || !['accepted', 'rejected'].includes(record.choice) ||
        typeof record.expiresAt !== 'number' || record.expiresAt <= Date.now() ||
        record.expiresAt > Date.now() + CHOICE_LIFETIME_MS) return null
    return record.choice
  } catch { return null }
}

export function analyticsAllowed(): boolean {
  return typeof window !== 'undefined' && readAnalyticsChoice() === 'accepted'
}

export function saveAnalyticsChoice(choice: AnalyticsChoice): boolean {
  try {
    localStorage.setItem(ANALYTICS_CHOICE_KEY, JSON.stringify({
      version: 1, choice, expiresAt: Date.now() + CHOICE_LIFETIME_MS,
    }))
    if (choice === 'accepted') {
      document.cookie = `${REJECTION_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
    }
  } catch {
    if (choice === 'accepted') return false
    // Withdrawal must override a still-readable old acceptance when writes fail.
    // This essential host-only cookie records rejection only, never acceptance.
    if (choice === 'rejected') {
      try { document.cookie = `${REJECTION_COOKIE}=1; Max-Age=${CHOICE_LIFETIME_MS / 1000}; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}` } catch { /* All persistence unavailable: remain OFF in this document. */ }
    }
  }
  return readAnalyticsChoice() === choice
}

// This app owns these GA4 names, at Path /. Remove legacy parent-domain cookies
// as well as host-only cookies. Do not delete other GA properties/auth/cart state.
export function clearAnalyticsCookies(legacyOnly = false): void {
  const hostname = window.location.hostname
  const domains = legacyOnly ? [] : ['', hostname]
  if (hostname === 'theliftinglab.co.uk' || hostname.endsWith('.theliftinglab.co.uk')) {
    domains.push('theliftinglab.co.uk', '.theliftinglab.co.uk')
  }
  for (const name of ['_ga', '_ga_R3YMG6TYXF']) {
    for (const domain of domains) {
      try { document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}` } catch { /* Cookie access may be blocked by the browser. */ }
    }
  }
}
