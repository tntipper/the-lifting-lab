const DEFAULT_RETURN_PATH = '/dashboard'

// Only account destinations currently supported by the sign-in flow. Add a
// destination here deliberately when a new authenticated return journey ships.
const AUTH_RETURN_PATHS = new Set([
  '/dashboard',
  '/stack',
  '/favourites',
  '/account/settings',
])

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  callback_failed: 'This sign-in link could not be verified. It may have expired or already been used. Please request a new link or try Google again.',
  signout_failed: 'Sign out could not be completed. Your session may still be active. Please return to your account and try again.',
}

export function authErrorMessage(code: string | null): string {
  return code && Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? AUTH_ERROR_MESSAGES[code] : ''
}

/** Validate every decoding layer, but preserve the original query encoding. */
export function safeAuthReturnPath(value: string | null): string {
  if (!value || value.length > 2048) return DEFAULT_RETURN_PATH

  let decoded = value
  for (let layer = 0; layer < 6; layer++) {
    // Browsers normalise backslashes and discard some controls before resolving
    // URLs. Reject them before the URL parser can turn them into a new origin.
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\u0000-\u001f\u007f-\u009f]/.test(decoded)) {
      return DEFAULT_RETURN_PATH
    }

    const pathname = decoded.split(/[?#]/, 1)[0]
    if (!AUTH_RETURN_PATHS.has(pathname)) return DEFAULT_RETURN_PATH

    try {
      const nextLayer = decodeURIComponent(decoded)
      if (nextLayer === decoded) return value
      decoded = nextLayer
    } catch {
      return DEFAULT_RETURN_PATH
    }
  }

  // Excessive nesting is ambiguous input, not another decoding opportunity.
  return DEFAULT_RETURN_PATH
}

type ExchangeCode = (code: string) => Promise<{
  data: { session: unknown | null }
  error: unknown | null
}>

function authRedirect(path: string, requestUrl: URL): Response {
  return new Response(null, {
    // 303 makes a POST sign-out follow up with GET rather than replaying POST.
    status: 303,
    headers: {
      Location: new URL(path, requestUrl.origin).toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

export async function completeAuthCallback(requestUrl: URL, exchangeCode: ExchangeCode): Promise<Response> {
  const parameters = requestUrl.searchParams
  const codes = parameters.getAll('code')
  const failure = () => authRedirect('/auth?error=callback_failed', requestUrl)

  if (codes.length !== 1 || !codes[0].trim() || ['error', 'error_code', 'error_description'].some(key => parameters.has(key))) {
    return failure()
  }

  try {
    const { data, error } = await exchangeCode(codes[0])
    if (error || !data.session) return failure()
  } catch {
    // Do not leak provider messages, codes, or token details into the redirect.
    return failure()
  }

  const destinations = parameters.getAll('next')
  return authRedirect(safeAuthReturnPath(destinations.length === 1 ? destinations[0] : null), requestUrl)
}

export async function completeSignOut(requestUrl: URL, signOut: () => Promise<{ error: unknown | null }>): Promise<Response> {
  try {
    const { error } = await signOut()
    if (error) return authRedirect('/auth?error=signout_failed', requestUrl)
  } catch {
    return authRedirect('/auth?error=signout_failed', requestUrl)
  }

  return authRedirect('/auth', requestUrl)
}
