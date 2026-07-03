import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'

// ──────────────────────────────────────────────
// Shared constants
// ──────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Mock request-context so we can probe the ctx passed to runWithRequestContext.
// vi.mock is hoisted — it applies to ALL tests in this file, including baseline.
// The mock's runWithRequestContext just calls fn() and stashes ctx on globalThis.
// Since the middleware currently does NOT import runWithRequestContext, the mock
// is unused by existing code. After the middleware edit, it imports and calls
// runWithRequestContext (the mocked version), which stashes ctx for assertions.
const { runWithRequestContextMock } = vi.hoisted(() => ({
  runWithRequestContextMock: vi.fn(
    (ctx: Record<string, unknown>, fn: () => unknown) => {
      (globalThis as Record<string, unknown>).__probeCtx = ctx
      return fn()
    },
  ),
}))

vi.mock('@/lib/request-context', () => ({
  runWithRequestContext: runWithRequestContextMock,
}))

// Top-level static imports — use the mocked request-context for everything
import { middleware, config } from '@/middleware'

// ──────────────────────────────────────────────
// Cleanup between tests
// ──────────────────────────────────────────────
afterEach(() => {
  delete (globalThis as Record<string, unknown>).__probeCtx
  runWithRequestContextMock.mockClear()
})

// ══════════════════════════════════════════════
// BASELINE TESTS — pin CURRENT behavior
// These must pass BOTH before and after the
// middleware edit (headers logic unchanged).
// ══════════════════════════════════════════════

describe('middleware baseline', () => {
  it('is exported and callable', () => {
    expect(typeof middleware).toBe('function')
  })

  it('sets all security headers on the response', () => {
    const req = createNextRequest('http://localhost:3000/api/test')
    const res = middleware(req)

    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    )
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    )
  })

  it('omits CSP header in non-production', () => {
    const req = createNextRequest('http://localhost:3000/api/test')
    const res = middleware(req)

    expect(res.headers.get('Content-Security-Policy')).toBeNull()
  })
})

describe('CSP in production', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'production')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('includes Content-Security-Policy header with default-src self', async () => {
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
  it('exports the matcher config with negative lookahead', () => {
    expect(config.matcher).toBe('/((?!_next|__nextjs|favicon.ico).*)')
  })

  it('opts into Node.js runtime explicitly via config.runtime', () => {
    expect((config as Record<string, unknown>).runtime).toBe('nodejs')
  })
})

// ══════════════════════════════════════════════
// NEW TESTS — request-context wrapping
// These FAIL before the middleware edit (ctx is
// never populated) and PASS after wrapping.
// ══════════════════════════════════════════════

describe('middleware request-context wrapping', () => {
  it('populates request-context via runWithRequestContext during middleware execution', () => {
    const req = createNextRequest('http://localhost:3000/api/test')
    middleware(req)

    const ctx = (globalThis as Record<string, unknown>).__probeCtx as
      | Record<string, unknown>
      | undefined

    expect(ctx).toBeDefined()
    expect(ctx!.requestId).toMatch(UUID_RE)
    expect(ctx!.route).toBe('/api/test')
    expect(ctx!.ip).toBe('unknown')
  })

  it('extracts IP from x-forwarded-for header (first entry)', () => {
    const req = createNextRequest('http://localhost:3000/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    middleware(req)

    const ctx = (globalThis as Record<string, unknown>).__probeCtx as
      | Record<string, unknown>
      | undefined

    expect(ctx!.ip).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = createNextRequest('http://localhost:3000/api/test', {
      headers: { 'x-real-ip': '10.0.0.1' },
    })
    middleware(req)

    const ctx = (globalThis as Record<string, unknown>).__probeCtx as
      | Record<string, unknown>
      | undefined

    expect(ctx!.ip).toBe('10.0.0.1')
  })

  it('defaults ip to unknown when both x-forwarded-for and x-real-ip are absent', () => {
    const req = createNextRequest('http://localhost:3000/api/test')
    middleware(req)

    const ctx = (globalThis as Record<string, unknown>).__probeCtx as
      | Record<string, unknown>
      | undefined

    expect(ctx!.ip).toBe('unknown')
  })

  it('uses request.nextUrl.pathname for the route', () => {
    const req = createNextRequest('http://localhost:3000/boxes/abc')
    middleware(req)

    const ctx = (globalThis as Record<string, unknown>).__probeCtx as
      | Record<string, unknown>
      | undefined

    expect(ctx!.route).toBe('/boxes/abc')
  })

  it('still returns a response with all security headers after wrapping', () => {
    const req = createNextRequest('http://localhost:3000/api/test')
    const res = middleware(req)

    // Regression guard: prove the wrapper didn't break the security-header contract
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=31536000; includeSubDomains; preload',
    )
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(res.headers.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=()',
    )
  })
})
