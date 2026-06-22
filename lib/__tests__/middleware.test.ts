import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { middleware, config } from '@/middleware'

describe('middleware', () => {
  it('sets security headers', () => {
    const req = createNextRequest('http://localhost:3000/')
    const res = middleware(req)
    expect(res.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Permissions-Policy')).toBe('camera=(), microphone=(), geolocation=()')
  })

  it('omits CSP in non-production', () => {
    const req = createNextRequest('http://localhost:3000/')
    const res = middleware(req)
    expect(res.headers.get('Content-Security-Policy')).toBeNull()
  })
})

describe('CSP in production', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NODE_ENV = 'production'
  })

  it('includes Content-Security-Policy header', async () => {
    const { middleware: prodMiddleware } = await import('@/middleware')
    const req = createNextRequest('http://localhost:3000/')
    const res = prodMiddleware(req)
    const csp = res.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("form-action 'self'")
  })
})

describe('middleware matcher', () => {
  it('uses path-to-regexp pattern with negative lookahead for _next, __nextjs, favicon.ico', () => {
    expect(config.matcher).toBe('/((?!_next|__nextjs|favicon.ico).*)')
  })
})
