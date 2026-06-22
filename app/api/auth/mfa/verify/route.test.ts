import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'crypto'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { createUser, createPasskeyCredential } from '@/test/helpers/fixtures'
import { POST, PUT } from './route'

const { mockDecryptEmail, mockVerifyTotp, mockGenerateAuthOptions, mockVerifyAuthResponse, mockCreateSession, mockSetSessionCookie } = vi.hoisted(() => ({
  mockDecryptEmail: vi.fn(),
  mockVerifyTotp: vi.fn(),
  mockGenerateAuthOptions: vi.fn(),
  mockVerifyAuthResponse: vi.fn(),
  mockCreateSession: vi.fn(),
  mockSetSessionCookie: vi.fn(),
}))

vi.mock('@/lib/email-crypto', () => ({ decryptEmail: mockDecryptEmail }))
vi.mock('@/lib/totp', () => ({ verifyTotp: mockVerifyTotp }))
vi.mock('@/lib/webauthn', () => ({
  generateAuthOptions: mockGenerateAuthOptions,
  verifyAuthResponse: mockVerifyAuthResponse,
}))
vi.mock('@/lib/session', () => ({
  createSession: mockCreateSession,
  setSessionCookie: mockSetSessionCookie,
}))

const USER_ID = '00000000-0000-0000-0000-000000000001'
const SESSION_TOKEN = 'test-session-token'
const EMAIL_CODE = '482631'
const EMAIL_CODE_HASH = crypto.createHash('sha256').update(EMAIL_CODE).digest('hex')

function makeSession(methods: string[], overrides: Record<string, unknown> = {}) {
  return {
    userId: USER_ID,
    methods,
    verified: [] as string[],
    emailCodeHash: methods.includes('email') ? EMAIL_CODE_HASH : null,
    emailSentAt: methods.includes('email') ? Date.now() - 120_000 : null,
    emailAttempts: 0,
    totpAttempts: 0,
    verificationAttempts: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetRedisMock()
  vi.clearAllMocks()
  mockCreateSession.mockResolvedValue(SESSION_TOKEN)
  mockSetSessionCookie.mockResolvedValue(undefined)
})

describe('POST /api/auth/mfa/verify', () => {
  describe('email method', () => {
    it('verifies email code and returns mfaComplete when email is the only method', async () => {
      const { prismaMock } = await import('@/test/helpers/prisma-mock')
      prismaMock.user.findUnique.mockResolvedValue(createUser({ id: USER_ID, encPrivPw: Buffer.alloc(48, 0x11), pwNonce: Buffer.alloc(24, 0x33), publicKey: Buffer.alloc(32, 0xcc) }))

      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['email'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: EMAIL_CODE },
      }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.mfaComplete).toBe(true)
      expect(json.data.encPrivPw).toBeDefined()
      expect(json.data.pwNonce).toBeDefined()
      expect(json.data.publicKey).toBeDefined()
      expect(json.data.passwordHash).toBeUndefined()
      expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'testuser')
      expect(mockSetSessionCookie).toHaveBeenCalledWith(SESSION_TOKEN)
    })

    it('returns 401 for wrong email code', async () => {
      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['email'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: '000000' },
      }))
      const json = await res.json()

      expect(res.status).toBe(401)
      expect(json.success).toBe(false)
    })

    it('resets emailCodeHash after 3 wrong email attempts', async () => {
      await redisMock.set(
        'mfa:valid-token',
        JSON.stringify(makeSession(['email'], { emailAttempts: 2, verificationAttempts: 2 })),
        'EX',
        300,
      )

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: '000000' },
      }))
      const json = await res.json()

      expect(res.status).toBe(401)
      expect(json.error).toContain('Invalid code')

      const updated = JSON.parse(await redisMock.get('mfa:valid-token')!)
      expect(updated.emailCodeHash).toBeNull()
      expect(updated.emailSentAt).toBeNull()
      expect(updated.emailAttempts).toBe(3)
    })

    it('returns 400 when no code was sent', async () => {
      await redisMock.set(
        'mfa:valid-token',
        JSON.stringify(makeSession(['email'], { emailCodeHash: null })),
        'EX',
        300,
      )

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: '123456' },
      }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('No email code')
    })

    it('returns verified and pending when multiple methods and only email done', async () => {
      await redisMock.set(
        'mfa:valid-token',
        JSON.stringify(makeSession(['email', 'totp'])),
        'EX',
        300,
      )

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: EMAIL_CODE },
      }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.mfaComplete).toBeUndefined()
      expect(json.data.verified).toEqual(['email'])
      expect(json.data.pending).toEqual(['totp'])
    })
  })

  describe('totp method', () => {
    it('verifies TOTP code and returns mfaComplete when totp is the only method', async () => {
      const { prismaMock } = await import('@/test/helpers/prisma-mock')
      mockVerifyTotp.mockResolvedValue(true)
      prismaMock.user.findUnique
        .mockResolvedValueOnce(createUser({
          id: USER_ID,
          totpSecret: Buffer.from('JBSWY3DPEHPK3PXP'),
          encPrivPw: Buffer.alloc(48, 0x11),
          pwNonce: Buffer.alloc(24, 0x33),
          publicKey: Buffer.alloc(32, 0xcc),
        }))

      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['totp'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'totp', code: '123456' },
      }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.mfaComplete).toBe(true)
      expect(mockVerifyTotp).toHaveBeenCalled()
      expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'testuser')
    })

    it('returns 401 for wrong TOTP code', async () => {
      const { prismaMock } = await import('@/test/helpers/prisma-mock')
      mockVerifyTotp.mockResolvedValue(false)
      prismaMock.user.findUnique.mockResolvedValue(createUser({
        id: USER_ID,
        totpSecret: Buffer.from('JBSWY3DPEHPK3PXP'),
      }))

      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['totp'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'totp', code: '000000' },
      }))
      const json = await res.json()

      expect(res.status).toBe(401)
      expect(json.success).toBe(false)
    })

    it('returns 400 when user has no TOTP secret', async () => {
      const { prismaMock } = await import('@/test/helpers/prisma-mock')
      prismaMock.user.findUnique.mockResolvedValue(createUser({ id: USER_ID, totpSecret: null }))

      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['totp'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'totp', code: '123456' },
      }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('not configured')
    })
  })

  describe('passkey method', () => {
    it('returns passkeyOptions for passkey method', async () => {
      const { prismaMock } = await import('@/test/helpers/prisma-mock')
      mockGenerateAuthOptions.mockResolvedValue({ challenge: 'webauthn-challenge' })
      prismaMock.passkeyCredential.findMany.mockResolvedValue([
        createPasskeyCredential({ credentialId: Buffer.alloc(32, 0xdd) }),
      ])

      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['passkey'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'passkey' },
      }))
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.success).toBe(true)
      expect(json.data.passkeyOptions).toEqual({ challenge: 'webauthn-challenge' })
    })

    it('returns 400 when no passkeys registered', async () => {
      const { prismaMock } = await import('@/test/helpers/prisma-mock')
      prismaMock.passkeyCredential.findMany.mockResolvedValue([])

      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['passkey'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'passkey' },
      }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('No passkeys')
    })
  })

  describe('common checks', () => {
    it('returns 401 when MFA session is expired', async () => {
      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'expired-token', method: 'email', code: '123456' },
      }))
      const json = await res.json()

      expect(res.status).toBe(401)
      expect(json.error).toContain('expired')
    })

    it('returns 400 when method is not in session methods', async () => {
      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['email'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'totp', code: '123456' },
      }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('not enabled')
    })

    it('returns 400 when method is already verified', async () => {
      await redisMock.set(
        'mfa:valid-token',
        JSON.stringify(makeSession(['email'], { verified: ['email'] })),
        'EX',
        300,
      )

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: EMAIL_CODE },
      }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('already verified')
    })

    it('returns 401 after 10 total verification attempts', async () => {
      await redisMock.set(
        'mfa:valid-token',
        JSON.stringify(makeSession(['email'], { verificationAttempts: 10 })),
        'EX',
        300,
      )

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email', code: EMAIL_CODE },
      }))
      const json = await res.json()

      expect(res.status).toBe(401)
      expect(json.error).toContain('Too many')
    })

    it('returns 400 when code is missing for email method', async () => {
      await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['email'])), 'EX', 300)

      const res = await POST(createNextRequest('http://localhost/api/auth/mfa/verify', {
        method: 'POST',
        body: { mfaToken: 'valid-token', method: 'email' },
      }))
      const json = await res.json()

      expect(res.status).toBe(400)
      expect(json.error).toContain('6-digit')
    })
  })
})

describe('PUT /api/auth/mfa/verify', () => {
  const ASSERTION = { id: 'test-assertion' }
  const CRED = createPasskeyCredential()

  beforeEach(() => {
    mockVerifyAuthResponse.mockResolvedValue({ verified: true, newCounter: 5 })
  })

  it('verifies passkey assertion and completes MFA when passkey is the only method', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.passkeyCredential.findMany.mockResolvedValue([CRED])
    prismaMock.passkeyCredential.update.mockResolvedValue({ ...CRED, counter: 5 })
    prismaMock.user.findUnique.mockResolvedValue(createUser({
      id: USER_ID,
      encPrivPw: Buffer.alloc(48, 0x11),
      pwNonce: Buffer.alloc(24, 0x33),
      publicKey: Buffer.alloc(32, 0xcc),
    }))

    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['passkey'])), 'EX', 300)

    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'valid-token', assertion: ASSERTION },
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.mfaComplete).toBe(true)
    expect(json.data.encPrivPw).toBeDefined()
    expect(json.data.passwordHash).toBeUndefined()
    expect(prismaMock.passkeyCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CRED.id },
        data: expect.objectContaining({ counter: 5 }),
      }),
    )
    expect(mockCreateSession).toHaveBeenCalledWith(USER_ID, 'testuser')
  })

  it('returns verified/pending when passkey verified but other methods remain', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.passkeyCredential.findMany.mockResolvedValue([CRED])
    prismaMock.passkeyCredential.update.mockResolvedValue({ ...CRED, counter: 5 })

    await redisMock.set(
      'mfa:valid-token',
      JSON.stringify(makeSession(['passkey', 'email'])),
      'EX',
      300,
    )

    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'valid-token', assertion: ASSERTION },
    }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.mfaComplete).toBeUndefined()
    expect(json.data.verified).toEqual(['passkey'])
    expect(json.data.pending).toEqual(['email'])
  })

  it('returns 400 when passkey is already verified', async () => {
    await redisMock.set(
      'mfa:valid-token',
      JSON.stringify(makeSession(['passkey'], { verified: ['passkey'] })),
      'EX',
      300,
    )

    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'valid-token', assertion: ASSERTION },
    }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('already verified')
  })

  it('returns 401 when MFA session expired', async () => {
    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'expired-token', assertion: ASSERTION },
    }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toContain('expired')
  })

  it('returns 400 when mfaToken or assertion missing', async () => {
    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'token' },
    }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toContain('required')
  })

  it('returns 401 when passkey verification fails for all credentials', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    mockVerifyAuthResponse.mockRejectedValue(new Error('Verification failed'))
    prismaMock.passkeyCredential.findMany.mockResolvedValue([CRED])

    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['passkey'])), 'EX', 300)

    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'valid-token', assertion: ASSERTION },
    }))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.error).toContain('Passkey verification failed')
  })

  it('never returns passwordHash in response', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.passkeyCredential.findMany.mockResolvedValue([CRED])
    prismaMock.passkeyCredential.update.mockResolvedValue({ ...CRED, counter: 5 })
    prismaMock.user.findUnique.mockResolvedValue(createUser({ id: USER_ID }))

    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession(['passkey'])), 'EX', 300)

    const res = await PUT(createNextRequest('http://localhost/api/auth/mfa/verify', {
      method: 'PUT',
      body: { mfaToken: 'valid-token', assertion: ASSERTION },
    }))
    const json = await res.json()

    expect(json.data?.passwordHash).toBeUndefined()
  })
})
