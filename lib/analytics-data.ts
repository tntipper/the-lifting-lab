// Deliberately no query/fragment/campaign/linker allowlist. Public static routes
// keep their identity; dynamic routes are labelled by template, not user values.
const STATIC_PATHS = new Set(["/", "/account/settings", "/affiliate-disclosure", "/alternatives", "/auth", "/best", "/brand", "/brands-vs", "/calculators", "/calculators/1rm", "/calculators/beta-alanine", "/calculators/bmi", "/calculators/body-fat", "/calculators/caffeine", "/calculators/citrulline", "/calculators/creatine", "/calculators/dots", "/calculators/ffmi", "/calculators/plate", "/calculators/protein", "/calculators/rpe", "/calculators/tdee", "/calculators/timing", "/cheapest", "/combine", "/compare", "/contact", "/dashboard", "/deals", "/dosage", "/faq", "/favourites", "/forms", "/glossary", "/guide", "/ingredients", "/ingredients-vs", "/leaderboard", "/methodology", "/myths", "/peptides", "/privacy", "/products", "/protein-value", "/rewards", "/side-effects", "/sleep", "/stack", "/stacks", "/strongest-pre-workout", "/submit", "/terms", "/testosterone", "/value", "/vs", "/watch-outs", "/wizard"])
const DYNAMIC_SECTIONS = new Set(['products', 'alternatives', 'best', 'brand', 'brands-vs', 'guide', 'ingredients-vs', 'ingredients', 'stacks', 'vs'])

export function analyticsPath(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/'
  if (STATIC_PATHS.has(path)) return path
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 2 && DYNAMIC_SECTIONS.has(segments[0])) return `/${segments[0]}/:item`
  return '/other'
}

export function analyticsLocation(raw: string): string {
  try {
    const url = new URL(raw)
    return url.origin + analyticsPath(url.pathname)
  } catch { return 'https://www.theliftinglab.co.uk/other' }
}

export function analyticsReferrer(raw: string, currentOrigin: string): string {
  try {
    const url = new URL(raw)
    // No arbitrary external referrer host/path/attribution values are collected.
    return url.origin === currentOrigin ? analyticsLocation(raw) : ''
  } catch { return '' }
}

export function analyticsPageFields() {
  return {
    page_location: analyticsLocation(window.location.href),
    page_referrer: analyticsReferrer(document.referrer, window.location.origin),
    page_title: `The Lifting Lab | ${analyticsPath(window.location.pathname)}`,
  }
}

export const NO_CAMPAIGN_ATTRIBUTION = {
  campaign_source: '(direct)', campaign_medium: '(none)', campaign_id: '(not set)',
  campaign_name: '(not set)', campaign_term: '(not set)', campaign_content: '(not set)',
}

export function minimiseEventParams(params: Record<string, string | number | boolean | undefined>) {
  const result: typeof params = {}
  for (const [key, value] of Object.entries(params)) {
    if (key === 'search_term') {
      if (typeof value === 'string') result.search_length = Math.min(value.length, 500)
    } else if (key === 'href') {
      if (typeof value === 'string') {
        try {
          const url = new URL(value, window.location.origin)
          result.link_destination = url.origin === window.location.origin ? analyticsPath(url.pathname) : 'external'
        } catch { /* Invalid URL contributes no parameter. */ }
      }
    } else if (!/^(?:page_|campaign_|utm_|linker|url|referrer|gclid|dclid|gbraid|wbraid|_gl)/.test(key)) {
      result[key] = value
    }
  }
  return result
}
