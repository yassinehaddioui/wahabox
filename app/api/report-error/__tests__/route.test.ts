import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createNextRequest } from '@/test/helpers/request'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// ── hoisted mocks ────────────────────────────────────────────────────────────
const { mockCheckIpRate, mockReportError } = vi.hoisted(() => ({
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockReportError: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/reporter', () => ({
  reportError: mockReportError,
  buildEnvelope: vi.fn(),
  sanitizeString: vi.fn(),
  registerNotifier: vi.fn(),
}))

// ── import the handler AFTER mocks are registered ────────────────────────────
import { POST } from '../route'

const BASE = 'https://wahabox.local/api/report-error'

function buildRequest(overrides: {
  body?: unknown
  headers?: Record<string, string>
} = {}): NextRequest {
  const { body, headers = {} } = overrides
  return new NextRequest(new URL(BASE), {
    method: 'POST',
    headers: new Headers({
      'content-type': 'application/json',
      ...headers,
    }),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

describe('POST /api/report-error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockReportError.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── happy path ──────────────────────────────────────────────────────────────

  it('returns 202 for valid { message } payload and calls reportError with source:client', async () => {
    const req = buildRequest({ body: { message: 'render boom' } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(body.data.ok).toBe(true)

    expect(mockReportError).toHaveBeenCalledTimes(1)
    const callArgs = mockReportError.mock.calls[0]
    // first arg is the synthetic Error
    const synthErr = callArgs[0] as Error
    expect(synthErr).toBeInstanceOf(Error)
    expect(synthErr.message).toBe('render boom')
    expect(synthErr.name).toBe('ClientError')
    // second arg is the context
    expect(callArgs[1]).toMatchObject({ source: 'client' })
  })

  it('forwards route field to reportError context', async () => {
    const req = buildRequest({ body: { message: 'x', route: '/some/page', code: 'RenderError' } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(mockReportError).toHaveBeenCalledTimes(1)

    const callArgs = mockReportError.mock.calls[0]
    const synthErr = callArgs[0] as Error
    expect(synthErr.name).toBe('RenderError')
    expect(callArgs[1]).toMatchObject({ source: 'client', route: '/some/page' })
  })

  // ── abuse prevention → missing message ─────────────────────────────────────

  it('returns 400 when message field is missing and does NOT call reportError', async () => {
    const req = buildRequest({ body: {} })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  // ── abuse prevention → extra field (strict schema) ─────────────────────────

  it('returns 400 when extra disallowed field is present and does NOT call reportError', async () => {
    const req = buildRequest({ body: { message: 'x', unexpected: 1 } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  // ── abuse prevention → wrong content-type ──────────────────────────────────

  it('returns 415 when content-type is not application/json and does NOT call reportError', async () => {
    const req = new NextRequest(new URL(BASE), {
      method: 'POST',
      headers: new Headers({ 'content-type': 'text/plain' }),
      body: 'not json',
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(415)
    expect(body.success).toBe(false)
    expect(body.code).toBe('UNSUPPORTED_MEDIA_TYPE')
    expect(mockReportError).not.toHaveBeenCalled()
  })

  // ── abuse prevention → oversized payload ───────────────────────────────────

  it('returns 413 when content-length exceeds 4096 and does NOT call reportError', async () => {
    const req = new NextRequest(new URL(BASE), {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': '5000',
      }),
      body: JSON.stringify({ message: 'small body but big header' }),
    })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(413)
    expect(body.success).toBe(false)
    expect(body.code).toBe('PAYLOAD_TOO_LARGE')
    expect(mockReportError).not.toHaveBeenCalled()
  })

  // ── abuse prevention → rate-limited ────────────────────────────────────────

  it('returns 429 when rate-limited and does NOT call reportError', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = buildRequest({ body: { message: 'rate limit test' } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.code).toBe('RATE_LIMITED')
    expect(mockReportError).not.toHaveBeenCalled()
  })

  // ── IP extraction ──────────────────────────────────────────────────────────

  it('honours x-forwarded-for first entry as IP', async () => {
    const req = new NextRequest(new URL(BASE), {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'x-forwarded-for': '9.9.9.9, 8.8.8.8',
      }),
      body: JSON.stringify({ message: 'ip test' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(202)
    expect(mockReportError).toHaveBeenCalledTimes(1)
    const ctx = mockReportError.mock.calls[0][1]
    expect(ctx).toMatchObject({ ip: '9.9.9.9' })
  })

  it('falls back to x-real-ip when x-forwarded-for absent', async () => {
    const req = new NextRequest(new URL(BASE), {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/json',
        'x-real-ip': '10.0.0.1',
      }),
      body: JSON.stringify({ message: 'ip test' }),
    })
    const res = await POST(req)

    expect(res.status).toBe(202)
    expect(mockReportError).toHaveBeenCalledTimes(1)
    const ctx = mockReportError.mock.calls[0][1]
    expect(ctx).toMatchObject({ ip: '10.0.0.1' })
  })

  it('defaults IP to unknown when no headers present', async () => {
    const req = buildRequest({ body: { message: 'ip test' } })
    const res = await POST(req)

    expect(res.status).toBe(202)
    expect(mockReportError).toHaveBeenCalledTimes(1)
    const ctx = mockReportError.mock.calls[0][1]
    expect(ctx).toMatchObject({ ip: 'unknown' })
  })

  // ── fire-and-forget proof ──────────────────────────────────────────────────

  it('returns 202 even when reportError never resolves (fire-and-forget)', async () => {
    mockReportError.mockReturnValue(new Promise<never>(() => {})) // never resolves

    const req = buildRequest({ body: { message: 'fire and forget' } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(body.data.ok).toBe(true)
    expect(mockReportError).toHaveBeenCalledTimes(1)
  })

  // ── max length enforcement ─────────────────────────────────────────────────

  it('rejects message longer than 2048 chars', async () => {
    const req = buildRequest({ body: { message: 'a'.repeat(2049) } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  it('rejects code longer than 64 chars', async () => {
    const req = buildRequest({ body: { message: 'x', code: 'b'.repeat(65) } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  it('rejects stackFirstFrame longer than 512 chars', async () => {
    const req = buildRequest({ body: { message: 'x', stackFirstFrame: 'c'.repeat(513) } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  it('rejects route longer than 256 chars', async () => {
    const req = buildRequest({ body: { message: 'x', route: '/d'.repeat(257) } })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockReportError).not.toHaveBeenCalled()
  })

  // ── accepts max-length boundary values ─────────────────────────────────────

  it('accepts valid payload with all fields at max length', async () => {
    const payload = {
      message: 'a'.repeat(2048),
      code: 'b'.repeat(64),
      stackFirstFrame: 'c'.repeat(512),
      route: 'x'.repeat(256),
    }
    const req = buildRequest({ body: payload })
    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(202)
    expect(body.success).toBe(true)
    expect(mockReportError).toHaveBeenCalledTimes(1)
  })
})

// ── structural routability ─────────────────────────────────────────────────────
// Next.js 16 App Router: folders prefixed with `_` are private (excluded from routing).
// Route group segments like (auth) are allowed; underscore-prefix is the disallowed case.
// This proves the route folder has no underscore-prefixed segment, so it IS routable.
describe('structural routability', () => {
  it('folder is routable: no underscore-prefixed segment (Next private-folder convention)', () => {
    // Resolve this test file's directory, then go up one level (= the route folder)
    const dir = path.dirname(fileURLToPath(new URL('..', import.meta.url)))
    // Split into segments, exclude route-groups (end with ')'), and assert none start with _
    const segments = dir.split('/').filter(s => s && !s.endsWith(')'))
    const underscorePrefixed = segments.filter(seg => seg.startsWith('_'))
    expect(underscorePrefixed).toEqual([])
  })
})
