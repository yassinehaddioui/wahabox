import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ONE_YEAR = 31_536_000

export function middleware(request: NextRequest) {
  const response = NextResponse.next()

  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' https://challenges.cloudflare.com",
      "img-src 'self' data: https://api.qrserver.com",
      "frame-src 'self' https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  )
  response.headers.set(
    'Strict-Transport-Security',
    `max-age=${ONE_YEAR}; includeSubDomains; preload`,
  )
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Referrer-Policy', 'no-referrer')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  )

  return response
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
}
