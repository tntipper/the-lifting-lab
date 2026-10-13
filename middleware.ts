import { productVariantRedirectUrl } from './lib/product-variant-redirects'
import { NextResponse, type NextRequest } from 'next/server'
import { isSyntheticPreview, isHostedStaging, isPreviewAccountPath, isPreviewFixtureRead, previewUnavailableResponse, stagingConnectionPolicy } from './lib/preview-mode'

export function middleware(request: NextRequest) {
  const productPath = /^\/products\/([^/]+)$/.exec(request.nextUrl.pathname)
  const redirect = productPath && productVariantRedirectUrl(decodeURIComponent(productPath[1]), undefined, request.nextUrl.search)
  if (redirect && ['GET', 'HEAD'].includes(request.method)) {
    return NextResponse.redirect(new URL(redirect, request.url), 308)
  }
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
  const apiPath = path === '/api' || path.startsWith('/api/')
  if ((apiPath && !isPreviewFixtureRead(path, request.method)) || !['GET', 'HEAD'].includes(request.method)) {
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
