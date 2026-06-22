import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { resetRedisMock } from '@/test/helpers/redis-mock'
import { POST } from './route'

const { mockVerifyCsrf, mockCheckAuthRateLimit, mockRecordAuthFailure, mockClearFailures, mockCheckTurnstile, mockCreateSession, mockSetSessionCookie } = vi.hoisted(() => ({
  mockVerifyCsrf: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckAuthRateLimit: vi.fn<(...args: unknown[]) => Promise<{ isLocked: boolean; ip: boolean; user: boolean; global: boolean; lockoutRemainingMs: number }>>(),
  mockRecordAuthFailure: vi.fn<(...args: unknown[]) => Promise<void>>(),
  mockClearFailures: vi.fn<(...args: unknown[]) => Promise<void>>(),
  mockCheckTurnstile: vi.fn<(...args: unknown[]) => Promise<{ verified: boolean; setProofCookie: string | null }>>(),
  mockCreateSession: vi.fn<(...args: unknown[]) => Promise<string>>(),
  mockSetSessionCookie: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/rate-limit', () => ({
  checkAuthRateLimit: mockCheckAuthRateLimit,
  recordAuthFailure: mockRecordAuthFailure,
  clearFailures: mockClearFailures,
}))
vi.mock('@/lib/turnstile', () => ({ checkTurnstile: mockCheckTurnstile, TURNSTILE_PROOF_COOKIE: 'turnstile_proof' }))
vi.mock('@/lib/session', () => ({ createSession: mockCreateSession, setSessionCookie: mockSetSessionCookie }))

const baseBody = {
  username: 'testuser',
  csrfToken: 'valid-csrf',
  authVerifier: Buffer.alloc(32, 0xaa).toString('base64'),
}

const userWithoutMfa = {
  id: 'user-1',
  username: 'testuser',
  authVerifier: Buffer.alloc(32, 0xaa),
  authSalt: Buffer.alloc(16, 0xbb),
  encPrivPw: Buffer.alloc(48, 0x11),
  pwNonce: Buffer.alloc(24, 0x33),
  publicKey: Buffer.alloc(32, 0xcc),
  mfaEmail: false,
  mfaTotp: false,
  mfaPasskey: false,
  emailEncrypted: null,
  emailNonce: null,
  emailVerified: false,
}

const userWithMfa = {
  ...userWithoutMfa,
  mfaEmail: true,
  emailEncrypted: Buffer.alloc(16, 0x77),
  emailNonce: Buffer.alloc(24, 0x88),
  emailVerified: true,
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    resetRedisMock()
    mockVerifyCsrf.mockResolvedValue(true)
    mockCheckAuthRateLimit.mockResolvedValue({
      isLocked: false,
      ip: false,
      user: false,
      global: false,
      lockoutRemainingMs: 0,
    })
    mockCheckTurnstile.mockResolvedValue({ verified: true, setProofCookie: null })
    mockCreateSession.mockResolvedValue('session-token')
    mockSetSessionCookie.mockResolvedValue(undefined)
  })

  it('returns session and keys on success', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(userWithoutMfa)

    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.encPrivPw).toBe(Buffer.alloc(48, 0x11).toString('base64'))
    expect(body.data.pwNonce).toBe(Buffer.alloc(24, 0x33).toString('base64'))
    expect(body.data.publicKey).toBe(Buffer.alloc(32, 0xcc).toString('base64'))
    expect(body.data).not.toHaveProperty('passwordHash')
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', 'testuser')
    expect(mockSetSessionCookie).toHaveBeenCalledWith('session-token')
    expect(mockClearFailures).toHaveBeenCalledWith('testuser')
  })

  it('returns 401 when auth verifier does not match', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    const wrongVerifierUser = {
      ...userWithoutMfa,
      authVerifier: Buffer.alloc(32, 0xff),
    }
    prismaMock.user.findUnique.mockResolvedValue(wrongVerifierUser)

    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockRecordAuthFailure).toHaveBeenCalledWith('testuser', 'unknown')
  })

  it('returns 401 with dummy timing for unknown user', async () => {
    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockRecordAuthFailure).toHaveBeenCalledWith('testuser', 'unknown')
  })

  it('returns 401 with MfaRequiredError when MFA is configured', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(userWithMfa)

    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.code).toBe('MFA_REQUIRED')
    expect(body.mfaToken).toBeDefined()
    expect(body.methods).toContain('email')
  })

  it('returns 429 when account is locked', async () => {
    mockCheckAuthRateLimit.mockResolvedValue({
      isLocked: true,
      ip: false,
      user: false,
      global: false,
      lockoutRemainingMs: 35000,
    })

    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
  })

  it('returns 400 when Turnstile verification fails', async () => {
    mockCheckTurnstile.mockResolvedValue({ verified: false, setProofCookie: null })

    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCheckTurnstile).toHaveBeenCalled()
  })

  it('sets proof cookie in response when turnstile is verified', async () => {
    mockCheckTurnstile.mockResolvedValue({ verified: true, setProofCookie: 'proof-token-value' })

    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(userWithoutMfa)

    const req = createNextRequest('http://localhost/api/auth/login', {
      method: 'POST',
      body: baseBody,
    })

    const res = await POST(req)

    expect(res.cookies.get('turnstile_proof')?.value).toBe('proof-token-value')
  })
})
