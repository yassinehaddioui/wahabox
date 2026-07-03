import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── hoisted mocks ──────────────────────────────────────────────────────────
const { mockCheckDedup, mockCheckIpRate, mockGetRequestContext, mockLoggerError } =
  vi.hoisted(() => ({
    mockCheckDedup: vi.fn<(key: string, ttlSeconds: number) => Promise<boolean>>(),
    mockCheckIpRate: vi.fn<(key: string, cfg: { windowMs: number; max: number }) => Promise<boolean>>(),
    mockGetRequestContext: vi.fn(),
    mockLoggerError: vi.fn(),
  }))

vi.mock('@/lib/rate-limit', () => ({
  checkDedup: mockCheckDedup,
  checkIpRate: mockCheckIpRate,
}))

vi.mock('@/lib/request-context', () => ({
  getRequestContext: mockGetRequestContext,
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

// ── imports (after mocks are hoisted) ─────────────────────────────────────
import { reportError, registerNotifier, buildEnvelope, sanitizeString } from '@/lib/reporter'
import type { ErrorEnvelope, ErrorNotifier } from '@/lib/notifiers/types'
import { ApiError, BadRequestError } from '@/lib/errors'
import crypto from 'node:crypto'

// ── helpers ───────────────────────────────────────────────────────────────
function makeNotifier(
  impl?: (payload: ErrorEnvelope) => Promise<void>,
): ErrorNotifier & { calls: ErrorEnvelope[] } {
  const notifier: ErrorNotifier & { calls: ErrorEnvelope[] } = {
    calls: [],
    async notify(payload: ErrorEnvelope) {
      this.calls.push(payload)
      if (impl) await impl(payload)
    },
  }
  return notifier
}

function resetGlobals() {
  mockCheckDedup.mockReset()
  mockCheckIpRate.mockReset()
  mockGetRequestContext.mockReset()
  mockLoggerError.mockReset()
  // Reset the singleton state in the reporter module by re-import trick won't
  // work — we instead control state via the reporter's well-defined public API
  // and test isolation. The recursion guard is per-module, so we rely on
  // beforeEach isolating it naturally (guard starts at false).
}

// ── tests ─────────────────────────────────────────────────────────────────
describe('sanitizeString', () => {
  it('redacts email addresses', () => {
    expect(sanitizeString('contact alice@example.com for help')).toBe(
      'contact [redacted] for help',
    )
  })

  it('redacts JWT-shaped tokens', () => {
    const jwt =
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123xyz789qwerty'
    // Regex only redacts the JWT portion, not the "Bearer " prefix
    expect(sanitizeString(`auth: ${jwt}`)).toBe('auth: Bearer [redacted]')
  })

  it('redacts hex tokens ≥ 16 chars', () => {
    expect(sanitizeString('key: deadbeef12345678cafef00d')).toBe('key: [redacted]')
  })

  it('redacts base64 blobs ≥ 32 chars', () => {
    expect(
      sanitizeString('payload: AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA='),
    ).toBe('payload: [redacted]')
  })

  it('does NOT redact IP addresses', () => {
    const input = 'client 192.168.1.1 hit the endpoint'
    expect(sanitizeString(input)).toBe(input)
  })

  it('does NOT redact short usernames', () => {
    const input = 'user admin not found'
    expect(sanitizeString(input)).toBe(input)
  })

  it('returns unchanged string when nothing matches', () => {
    expect(sanitizeString('nothing to see here')).toBe('nothing to see here')
  })

  it('handles empty string', () => {
    expect(sanitizeString('')).toBe('')
  })
})

describe('buildEnvelope', () => {
  beforeEach(() => {
    resetGlobals()
    mockGetRequestContext.mockReturnValue(undefined)
  })

  it('builds envelope from a plain Error', () => {
    const err = new Error('something broke')
    err.stack = 'Error: something broke\n    at Object.<anonymous> (/app/lib/test.ts:10:5)\n    at runNextTicks (node:internal/process/task_queues:60:5)'

    const env = buildEnvelope(err, { source: 'server' })

    expect(env.code).toBe('Error')
    expect(env.level).toBe('error')
    expect(env.source).toBe('server')
    expect(env.message).toBe('something broke')
    expect(env.signature).toMatch(/^[0-9a-f]{16}$/)
    expect(env.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(env.env).toBeDefined()
    expect(env.sha).toBeDefined()
    expect(env.stackFirstFrame).toContain('lib/test.ts:10:5')
    expect(env.route).toBe('unknown')
  })

  it('builds envelope from an ApiError with 500 status', () => {
    const err = new ApiError('db down', 500, 'DB_ERROR')
    err.stack = 'ApiError: db down\n    at handler (/app/lib/handler.ts:42:3)'

    const env = buildEnvelope(err, { source: 'server' })

    expect(env.code).toBe('DB_ERROR')
    expect(env.level).toBe('error')
    expect(env.message).toBe('db down')
  })

  it('assigns level warn for 4xx ApiError', () => {
    const err = new BadRequestError('bad input')
    const env = buildEnvelope(err, { source: 'server' })
    expect(env.level).toBe('warn')
    expect(env.code).toBe('BAD_REQUEST')
  })

  it('builds envelope from a string (non-Error)', () => {
    const env = buildEnvelope('just a string', { source: 'server' })
    expect(env.code).toBe('unknown')
    expect(env.level).toBe('error')
    expect(env.message).toBe('just a string')
  })

  it('sanitizes PII in message', () => {
    const err = new Error('sent to alice@example.com with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123xyz789qwerty')
    const env = buildEnvelope(err, { source: 'server' })
    expect(env.message).not.toContain('alice@example.com')
    expect(env.message).toContain('[redacted]')
    expect(env.message).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/)
  })

  it('reads requestId/route/ip from request-context when ctx omits them', () => {
    mockGetRequestContext.mockReturnValue({
      requestId: 'req-1',
      route: '/api/boxes',
      ip: '10.0.0.1',
    })

    const env = buildEnvelope(new Error('x'), { source: 'server' })

    expect(env.requestId).toBe('req-1')
    expect(env.route).toBe('/api/boxes')
    expect(env.ip).toBe('10.0.0.1')
  })

  it('ctx overrides request-context on collision', () => {
    mockGetRequestContext.mockReturnValue({
      requestId: 'req-auto',
      route: '/auto',
      ip: 'auto-ip',
    })

    const env = buildEnvelope(new Error('x'), {
      source: 'server',
      requestId: 'req-explicit',
      route: '/explicit',
      ip: 'explicit-ip',
    })

    expect(env.requestId).toBe('req-explicit')
    expect(env.route).toBe('/explicit')
    expect(env.ip).toBe('explicit-ip')
  })

  it('omits optional fields when undefined', () => {
    mockGetRequestContext.mockReturnValue(undefined)
    const env = buildEnvelope(new Error('x'), { source: 'server' })
    expect(Object.keys(env)).not.toContain('ip')
    expect(Object.keys(env)).toContain('route') // 'unknown' default
    expect(Object.keys(env)).not.toContain('requestId')
  })

  it('produces deterministic signature for same inputs', () => {
    // Two envelopes from the same error, same route, same stackFrame
    const err1 = new Error('boom')
    err1.stack = 'Error: boom\n    at test (/x.ts:1:1)'
    const err2 = new Error('boom')
    err2.stack = 'Error: boom\n    at test (/x.ts:1:1)'

    const e1 = buildEnvelope(err1, { source: 'server', route: '/api/test' })
    const e2 = buildEnvelope(err2, { source: 'server', route: '/api/test' })

    expect(e1.signature).toBe(e2.signature)
    expect(e1.signature).toMatch(/^[0-9a-f]{16}$/)
  })

  it('produces different signatures for different errors', () => {
    const e1 = buildEnvelope(new Error('boom'), {
      source: 'server',
      route: '/api/a',
    })
    const e2 = buildEnvelope(new Error('bang'), {
      source: 'server',
      route: '/api/b',
    })

    expect(e1.signature).not.toBe(e2.signature)
  })

  it('handles error with no stack', () => {
    const err = new Error('no stack')
    // Force-delete stack (simulate certain environments)
    Object.defineProperty(err, 'stack', { value: '', configurable: true })

    const env = buildEnvelope(err, { source: 'process' })
    expect(env.stackFirstFrame).toBe('')
    expect(env.signature).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('reportError', () => {
  let notifier: ErrorNotifier & { calls: ErrorEnvelope[] }

  beforeEach(() => {
    resetGlobals()
    notifier = makeNotifier()
    registerNotifier(notifier)
    // Default: dedup returns true (first occurrence), ip rate not limited
    mockCheckDedup.mockResolvedValue(true)
    mockCheckIpRate.mockResolvedValue(false)
    mockGetRequestContext.mockReturnValue(undefined)
  })

  it('reports an unknown Error via registered notifier exactly once', async () => {
    const err = new Error('boom')
    err.stack = 'Error: boom\n    at test (/app/test.ts:5:1)'

    await reportError(err, { source: 'server' })

    expect(notifier.calls).toHaveLength(1)
    const env = notifier.calls[0]!
    expect(env.level).toBe('error')
    expect(env.source).toBe('server')
    expect(env.signature).toMatch(/^[0-9a-f]{16}$/)
    expect(env.code).toBe('Error')
    expect(env.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(typeof env.stackFirstFrame).toBe('string')
  })

  it('reports ApiError with 500 status and custom code', async () => {
    const err = new ApiError('db down', 500, 'DB_ERROR')
    await reportError(err, { source: 'server' })

    expect(notifier.calls).toHaveLength(1)
    expect(notifier.calls[0]!.code).toBe('DB_ERROR')
    expect(notifier.calls[0]!.level).toBe('error')
  })

  it('does NOT report 4xx ApiError (guard before buildEnvelope)', async () => {
    await reportError(new BadRequestError('bad request'), { source: 'server' })
    expect(notifier.calls).toHaveLength(0)
  })

  it('reports non-ApiError even when statusCode would be 400 (no guard bypass)', async () => {
    // A plain Error with statusCode property — should still be reported
    const err = Object.assign(new Error('custom 400'), { statusCode: 400 })
    await reportError(err, { source: 'server' })
    expect(notifier.calls).toHaveLength(1)
  })

  it('dedup: second call with same signature not reported', async () => {
    mockCheckDedup
      .mockResolvedValueOnce(true) // first call: new key
      .mockResolvedValueOnce(false) // second call: repeat

    const err = new Error('boom')
    err.stack = 'Error: boom\n    at same (/same.ts:1:1)'

    await reportError(err, { source: 'server' })
    await reportError(err, { source: 'server' })

    expect(notifier.calls).toHaveLength(1)
  })

  it('recursion guard: re-entrant call returns immediately', async () => {
    // Make the notifier synchronously call reportError again
    const recurNotifier = makeNotifier(async (_payload: ErrorEnvelope) => {
      await reportError(new Error('reentrant'), { source: 'server' })
    })
    registerNotifier(recurNotifier)

    await reportError(new Error('original'), { source: 'server' })

    // The re-entrant call should be dropped by the recursion guard.
    // The outer notifier received 1 payload (the original); the re-entrant
    // reportError returned immediately without dispatching.
    expect(recurNotifier.calls).toHaveLength(1)
  })

  it('notifier failure does NOT propagate', async () => {
    const failNotifier = makeNotifier(async () => {
      throw new Error('notifier crashed')
    })
    registerNotifier(failNotifier)

    // Must resolve (not reject)
    await expect(
      reportError(new Error('boom'), { source: 'server' }),
    ).resolves.toBeUndefined()

    // The notifier's error should have been logged
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[notifier] failed',
      expect.objectContaining({ reason: expect.any(Error) }),
    )
  })

  it('dedup failure (throw) → reporter reports anyway (noisy > silent)', async () => {
    // When the dedup layer throws (e.g. Redis connection error uncaught by
    // the withRedis fallback, or a module import failure), shouldReport's
    // catch block returns true — better noisy than silent.
    mockCheckDedup.mockRejectedValue(new Error('Redis connection timeout'))
    mockCheckIpRate.mockResolvedValue(false)

    await reportError(new Error('redis down'), { source: 'server' })

    expect(notifier.calls).toHaveLength(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      '[dedup] failed',
      expect.objectContaining({ reason: expect.any(Error) }),
    )
  })

  it('burst cap: rate-limited → not reported', async () => {
    mockCheckDedup.mockResolvedValue(true) // not deduped
    mockCheckIpRate.mockResolvedValue(true) // burst limited!

    await reportError(new Error('burst'), { source: 'server' })

    expect(notifier.calls).toHaveLength(0)
  })

  it('should never reject (catch-all)', async () => {
    // Total chaos: dedup throws, and checkIpRate throws too
    mockCheckDedup.mockRejectedValue(new Error('chaos 1'))
    mockCheckIpRate.mockRejectedValue(new Error('chaos 2'))

    await expect(
      reportError(new Error('total chaos'), { source: 'server' }),
    ).resolves.toBeUndefined()
  })

  it('reportError returns undefined (void)', async () => {
    const result = await reportError(new Error('x'), { source: 'server' })
    expect(result).toBeUndefined()
  })

  it('prompt injection: PII in error message is sanitized in envelope', async () => {
    const err = new Error(
      'failed for alice@example.com with token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc123xyz789qwerty',
    )

    await reportError(err, { source: 'server' })

    expect(notifier.calls).toHaveLength(1)
    const msg = notifier.calls[0]!.message
    expect(msg).not.toContain('alice@example.com')
    expect(msg).toContain('[redacted]')
    // JWT must not appear in the message
    expect(msg).not.toMatch(
      /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    )
  })

  it('client source: dedup key includes ip', async () => {
    mockCheckDedup.mockResolvedValue(true)

    await reportError(new Error('client err'), {
      source: 'client',
      ip: '1.2.3.4',
    })

    expect(notifier.calls).toHaveLength(1)
    expect(notifier.calls[0]!.source).toBe('client')
    expect(notifier.calls[0]!.ip).toBe('1.2.3.4')

    // Verify the dedup call used the correct key format
    const dedupKey = mockCheckDedup.mock.calls[0]?.[0] as string
    expect(dedupKey).toContain('client:')
    expect(dedupKey).toContain('1.2.3.4')
  })

  it('server source: dedup key does NOT include ip', async () => {
    mockCheckDedup.mockResolvedValue(true)

    await reportError(new Error('server err'), {
      source: 'server',
      ip: '10.0.0.1',
    })

    const dedupKey = mockCheckDedup.mock.calls[0]?.[0] as string
    expect(dedupKey).toContain('server:')
    expect(dedupKey).not.toContain('10.0.0.1')
  })

  it('registerNotifier adds multiple notifiers — all receive payload', async () => {
    const n1 = makeNotifier()
    const n2 = makeNotifier()
    const n3 = makeNotifier()

    registerNotifier(n1)
    registerNotifier(n2)
    registerNotifier(n3)

    await reportError(new Error('fanout'), { source: 'server' })

    expect(n1.calls).toHaveLength(1)
    expect(n2.calls).toHaveLength(1)
    expect(n3.calls).toHaveLength(1)
  })
})

describe('manual qa: captured envelope', () => {
  it('manual qa: captures a real envelope on disk', async () => {
    const notifier = makeNotifier()
    registerNotifier(notifier)

    const err = new Error('integration test error with email alice@example.com')
    err.stack = 'Error: integration test error with email alice@example.com\n    at qa (/app/qa.ts:99:1)'

    await reportError(err, { source: 'server', route: '/qa/test' })

    expect(notifier.calls).toHaveLength(1)
    const env = notifier.calls[0]!

    // Write evidence to disk
    const fs = await import('fs/promises')
    await fs.mkdir('.omo/evidence', { recursive: true })
    await fs.writeFile(
      '.omo/evidence/task-4-error-handling-reporting.txt',
      `CAPTURED_ENVELOPE_JSON:\n${JSON.stringify(env, null, 2)}\n`,
      'utf-8',
    )
  })
})
