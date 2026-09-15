import { NextResponse, type NextRequest } from 'next/server'
import { isSyntheticPreview, isHostedStaging, isPreviewAccountPath, previewUnavailableResponse, stagingConnectionPolicy } from './lib/preview-mode'

export function middleware(request: NextRequest) {
  if (!isSyntheticPreview()) {
    const response = NextResponse.next()
    if (isHostedStaging()) {
      response.headers.set('X-TLL-Preview', 'staging')
      response.headers.set('X-Robots-Tag', 'noindex, nofollow')
      response.headers.set('Content-Security-Policy', stagingConnectionPolicy())
    }
    return response
  }
  const path = request.nextUrl.pathname
  if (path === '/api' || path.startsWith('/api/') || !['GET', 'HEAD'].includes(request.method)) {
    return previewUnavailableResponse()
  }
  const response = isPreviewAccountPath(path)
    ? NextResponse.rewrite(new URL('/preview', request.url))
    : NextResponse.next()
  response.headers.set('X-TLL-Preview', 'synthetic')
  response.headers.set('X-Robots-Tag', 'noindex, nofollow')
  response.headers.set('Content-Security-Policy', "connect-src 'self'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'")
  return response
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] }
