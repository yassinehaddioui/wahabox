/**
 * Golden sanitization test vectors.
 *
 * Todo 13 of the error-handling-reporting plan.
 *
 * PROVES that forbidden payloads never leak through the real reporter stack:
 *   - buildEnvelope (lib/reporter/envelope.ts) calls sanitizeString on message
 *     and stackFirstFrame;
 *   - reportError (lib/reporter/index.ts) dispatches the envelope to registered
 *     notifiers;
 *   - Each vector injects a specific forbidden pattern and asserts the emitted
 *     envelope string does NOT contain it.
 *
 * This is NOT a unit test of sanitizeString — those live in reporter.test.ts.
 * This is an end-to-end sanitization proof through the real reporter modules.
 */

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'

// ── hoisted mocks ──────────────────────────────────────────────────────────
const { mockCheckDedup, mockCheckIpRate } = vi.hoisted(() => ({
  mockCheckDedup: vi.fn<
    (key: string, ttlSeconds: number) => Promise<boolean>
  >(),
  mockCheckIpRate: vi.fn<
    (
      key: string,
      cfg: { windowMs: number; max: number },
    ) => Promise<boolean>
  >(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkDedup: mockCheckDedup,
  checkIpRate: mockCheckIpRate,
}))

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

vi.mock('@/lib/request-context', () => ({
  getRequestContext: vi.fn().mockReturnValue(undefined),
}))

// ── imports (after mocks are hoisted) ──────────────────────────────────────
import { reportError, registerNotifier, buildEnvelope } from '@/lib/reporter'
import type { ErrorEnvelope, ErrorNotifier } from '@/lib/notifiers/types'
import { BadRequestError, NotFoundError } from '@/lib/errors'

// ── helpers ────────────────────────────────────────────────────────────────

class Capture implements ErrorNotifier {
  received: ErrorEnvelope[] = []
  async notify(p: ErrorEnvelope): Promise<void> {
    this.received.push(p)
  }
}

// ── forbidden regexes (mirrors lib/reporter/sanitize.ts) ────────────────────
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/
const JWT_RE =
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/
const HEX16_RE = /[0-9a-f]{16,}/i
const B64_RE = /[A-Za-z0-9+/]{32,}={0,2}/

// ── tests ──────────────────────────────────────────────────────────────────

describe('golden sanitization vectors', () => {
  let capture: Capture

  beforeAll(() => {
    capture = new Capture()
    registerNotifier(capture)
  })

  beforeEach(() => {
    // Reset capture between tests so each sees only its own invocation.
    capture.received = []

    // Dedup returns true (first occurrence) so shouldReport calls notify.
    mockCheckDedup.mockResolvedValue(true)
    // Burst cap not hit — report proceeds.
    mockCheckIpRate.mockResolvedValue(false)
  })

  it('strips email from message (BadRequestError)', () => {
    // BadRequestError is 4xx → reportError skips it (guard before
    // buildEnvelope).  We test sanitization at the envelope level
    // directly via buildEnvelope.
    const err = new BadRequestError('user alice@example.com has invalid input')
    const env = buildEnvelope(err, { source: 'server' })

    // Assert the email pattern is gone from the message field.
    expect(env.message).not.toMatch(EMAIL_RE)
    expect(env.message).not.toContain('alice@example.com')
    expect(env.message).toContain('[redacted]')
  })

  it('strips JWT shape from message', async () => {
    // Three segments each ≥10 base64url chars.
    const err = new Error(
      'token eyJabcdefghij.abcdefghij.abcdefghij expired',
    )
    await reportError(err, { source: 'server' })

    expect(capture.received).toHaveLength(1)
    const env = capture.received[0]!
    expect(env.message).not.toMatch(JWT_RE)
  })

  it('strips 32-hex token from message', async () => {
    const err = new Error(
      'session abcdef0123456789abcdef0123456789',
    )
    await reportError(err, { source: 'server' })

    expect(capture.received).toHaveLength(1)
    const env = capture.received[0]!
    // Check the message field (the envelope's signature is itself 16 hex
    // chars and would falsely trigger a full-JSON hex regex).
    expect(env.message).not.toMatch(HEX16_RE)
  })

  it('strips long base64 from message', async () => {
    const err = new Error(
      'payload YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnh5emFiY2RlZmdoaWprbG0=',
    )
    await reportError(err, { source: 'server' })

    expect(capture.received).toHaveLength(1)
    const env = capture.received[0]!
    expect(env.message).not.toMatch(B64_RE)
  })

  it('retains box label (not PII) in NotFoundError', () => {
    // NotFoundError is 4xx → reportError skips it.
    const err = new NotFoundError('box "my secret box" not found')
    const env = buildEnvelope(err, { source: 'server' })

    // Box labels are NOT forbidden — they are useful devops context.
    expect(JSON.stringify(env)).toContain('my secret box')
  })

  it('retains IP address in message', async () => {
    const err = new Error('from ip 198.51.100.7')
    await reportError(err, { source: 'server' })

    expect(capture.received).toHaveLength(1)
    const env = capture.received[0]!
    // IP addresses are NOT forbidden — they are useful for rate-limit
    // diagnostics and geo-lookup.
    expect(JSON.stringify(env)).toContain('198.51.100.7')
  })

  it('strips email from stackFirstFrame', async () => {
    // Construct an error whose stack first frame contains an email.
    const err = new Error()
    err.message = 'x alice@example.com y'
    err.stack =
      'Error: x alice@example.com y\n    at alice@example.com (/app/lib/x.ts:1:1)'

    await reportError(err, { source: 'server' })

    expect(capture.received).toHaveLength(1)
    const env = capture.received[0]!
    // Both message and stackFirstFrame must have the email stripped.
    expect(env.message).not.toMatch(EMAIL_RE)
    expect(env.stackFirstFrame).not.toMatch(EMAIL_RE)
  })

  it('no vector leaks any forbidden pattern (union regression guard)', async () => {
    // Run every vector and assert none of the 4 forbidden regexes match
    // either `message` or `stackFirstFrame` in the emitted envelope.
    // (Full JSON is not checked because the envelope's `signature` field
    // is itself 16 hex chars, which would be a false positive on HEX16_RE.)

    function assertNoForbidden(msg: string, frame: string): void {
      const fields = [msg, frame]
      for (const f of fields) {
        if (f.length === 0) continue
        expect(f).not.toMatch(EMAIL_RE)
        expect(f).not.toMatch(JWT_RE)
        expect(f).not.toMatch(HEX16_RE)
        expect(f).not.toMatch(B64_RE)
      }
    }

    // v1 — email in BadRequestError (via buildEnvelope)
    const env1 = buildEnvelope(
      new BadRequestError('user alice@example.com has invalid input'),
      { source: 'server' },
    )
    assertNoForbidden(env1.message, env1.stackFirstFrame ?? '')

    // v2 — JWT (via reportError)
    capture.received = []
    await reportError(
      new Error('token eyJabcdefghij.abcdefghij.abcdefghij expired'),
      { source: 'server' },
    )
    assertNoForbidden(
      capture.received[0]!.message,
      capture.received[0]!.stackFirstFrame ?? '',
    )

    // v3 — 32-hex (via reportError)
    capture.received = []
    await reportError(
      new Error('session abcdef0123456789abcdef0123456789'),
      { source: 'server' },
    )
    assertNoForbidden(
      capture.received[0]!.message,
      capture.received[0]!.stackFirstFrame ?? '',
    )

    // v4 — base64 (via reportError)
    capture.received = []
    await reportError(
      new Error('payload YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnh5emFiY2RlZmdoaWprbG0='),
      { source: 'server' },
    )
    assertNoForbidden(
      capture.received[0]!.message,
      capture.received[0]!.stackFirstFrame ?? '',
    )

    // v5 — box label retention (via buildEnvelope — 4xx)
    const env5 = buildEnvelope(
      new NotFoundError('box "my secret box" not found'),
      { source: 'server' },
    )
    assertNoForbidden(env5.message, env5.stackFirstFrame ?? '')

    // v6 — IP retention (via reportError)
    capture.received = []
    await reportError(new Error('from ip 198.51.100.7'), {
      source: 'server',
    })
    assertNoForbidden(
      capture.received[0]!.message,
      capture.received[0]!.stackFirstFrame ?? '',
    )

    // v7 — email in stackFirstFrame (via reportError)
    capture.received = []
    const e7 = new Error()
    e7.message = 'x alice@example.com y'
    e7.stack =
      'Error: x alice@example.com y\n    at alice@example.com (/app/lib/x.ts:1:1)'
    await reportError(e7, { source: 'server' })
    assertNoForbidden(
      capture.received[0]!.message,
      capture.received[0]!.stackFirstFrame ?? '',
    )
  })
})

// ── manual QA: evidence capture ────────────────────────────────────────────

describe('manual qa: captured envelope', () => {
  let capture: Capture

  beforeAll(() => {
    capture = new Capture()
    registerNotifier(capture)
  })

  beforeEach(() => {
    capture.received = []
    mockCheckDedup.mockResolvedValue(true)
    mockCheckIpRate.mockResolvedValue(false)
  })

  it('captures a real envelope with email redacted to disk', async () => {
    const err = new Error('test error with email alice@example.com')
    err.stack =
      'Error: test error with email alice@example.com\n    at qa (/app/qa.ts:99:1)'

    await reportError(err, { source: 'server', route: '/qa/sanitize' })

    expect(capture.received).toHaveLength(1)
    const env = capture.received[0]!

    const fs = await import('fs/promises')
    await fs.mkdir('.omo/evidence', { recursive: true })
    await fs.writeFile(
      '.omo/evidence/task-13-error-handling-reporting.txt',
      `CAPTURED_ENVELOPE_JSON:\n${JSON.stringify(env, null, 2)}\n`,
      'utf-8',
    )
  })
})
