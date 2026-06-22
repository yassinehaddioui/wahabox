import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { createUser } from '@/test/helpers/fixtures'
import { POST } from './route'

const { mockVerifyRecoveryCode, mockCreateSession, mockSetSessionCookie } = vi.hoisted(() => ({
  mockVerifyRecoveryCode: vi.fn(),
  mockCreateSession: vi.fn(),
  mockSetSessionCookie: vi.fn(),
}))

vi.mock('@/lib/totp', () => ({ verifyRecoveryCode: mockVerifyRecoveryCode }))
vi.mock('@/lib/session', () => ({
  createSession: mockCreateSession,
  setSessionCookie: mockSetSessionCookie,
}))

const USER_ID = '00000000-0000-0000-0000-000000000001'
const SESSION_TOKEN = 'test-session-token'

const RECOVERY_CODES_BUF = Buffer.from(
  JSON.stringify(['hash1', 'hash2', 'hash3', 'hash4', 'hash5', 'hash6', 'hash7', 'hash8']),
)

function makeRequest(mfaToken: string, recoveryCode: string) {
  return createNextRequest('http://localhost/api/auth/mfa/recover', {
    method: 'POST',
    body: { mfaToken, recoveryCode },
  })
}

beforeEach(() => {
  resetRedisMock()
  vi.clearAllMocks()
  mockCreateSession.mockResolvedValue(SESSION_TOKEN)
  mockSetSessionCookie.mockResolvedValue(undefined)
  mockVerifyRecoveryCode.mockReturnValue(true)
})

describe('POST /api/auth/mfa/recover', () => {
  it('bypasses MFA with valid recovery code and creates session', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        id: USER_ID,
        mfaRecoveryCodes: RECOVERY_CODES_BUF,
        encPrivPw: Buffer.alloc(48, 0x11),
        pwNonce: Buffer.alloc(24, 0x33),
        publicKey: Buffer.alloc(32, 0xcc),
      }),
    )

    await redisMock.set('mfa:valid-token', JSON.stringify({ userId: USER_ID }), 'EX', 300)

    const res = await POST(makeRequest('valid-token', 'ABCD-1234-EFGH-5678'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.mfaComplete).toBe(true)
    expect(json.data.encPrivPw).toBeDefined()
    expect(json.data.pwNonce).toBeDefined()
    expect(json.data.publicKey).toBeDefined()
    expect(json.data.passwordHash).toBeUndefined()
    expect(mockVerifyRecoveryCode).toHaveBeenCalled()
    expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'testuser')
    expect(mockSetSessionCookie).toHaveBeenCalledWith(SESSION_TOKEN)

    const stored = await redisMock.get('mfa:valid-token')
    expect(stored).toBeNull()
  })

  it('returns 401 when MFA session is expired', async () => {
    const res = await POST(makeRequest('expired-token', 'ABCD-1234-EFGH-5678'))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toContain('expired')
  })

  it('returns 401 for invalid recovery code', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    mockVerifyRecoveryCode.mockReturnValue(false)
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        id: USER_ID,
        mfaRecoveryCodes: RECOVERY_CODES_BUF,
      }),
    )

    await redisMock.set('mfa:valid-token', JSON.stringify({ userId: USER_ID }), 'EX', 300)

    const res = await POST(makeRequest('valid-token', 'INVALID-CODE'))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toContain('Invalid recovery code')
  })

  it('returns 401 and deletes session after 3 failed recovery attempts', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    mockVerifyRecoveryCode.mockReturnValue(false)
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        id: USER_ID,
        mfaRecoveryCodes: RECOVERY_CODES_BUF,
      }),
    )

    await redisMock.set(
      'mfa:valid-token',
      JSON.stringify({ userId: USER_ID, recoveryAttempts: 3 }),
      'EX',
      300,
    )

    const res = await POST(makeRequest('valid-token', 'INVALID-CODE'))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toContain('Too many recovery')

    const stored = await redisMock.get('mfa:valid-token')
    expect(stored).toBeNull()
  })

  it('tracks recovery attempts in session', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    mockVerifyRecoveryCode.mockReturnValue(false)
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        id: USER_ID,
        mfaRecoveryCodes: RECOVERY_CODES_BUF,
      }),
    )

    await redisMock.set('mfa:valid-token', JSON.stringify({ userId: USER_ID }), 'EX', 300)

    const res = await POST(makeRequest('valid-token', 'WRONG'))
    expect(res.status).toBe(401)

    const updated = JSON.parse(await redisMock.get('mfa:valid-token')!)
    expect(updated.recoveryAttempts).toBe(1)
  })

  it('returns 400 when user has no recovery codes configured', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        id: USER_ID,
        mfaRecoveryCodes: null,
      }),
    )

    await redisMock.set('mfa:valid-token', JSON.stringify({ userId: USER_ID }), 'EX', 300)

    const res = await POST(makeRequest('valid-token', 'ABCD-1234-EFGH-5678'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('No recovery codes')
  })

  it('never returns passwordHash in response', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        id: USER_ID,
        mfaRecoveryCodes: RECOVERY_CODES_BUF,
      }),
    )

    await redisMock.set('mfa:valid-token', JSON.stringify({ userId: USER_ID }), 'EX', 300)

    const res = await POST(makeRequest('valid-token', 'ABCD-1234-EFGH-5678'))
    const json = await res.json()

    expect(json.data?.passwordHash).toBeUndefined()
  })
})
