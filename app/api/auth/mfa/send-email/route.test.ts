import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { createUser } from '@/test/helpers/fixtures'
import { POST } from './route'

const { mockDecryptEmail, mockSendMfaCodeEmail, mockGenerateMfaCode } = vi.hoisted(() => ({
  mockDecryptEmail: vi.fn(),
  mockSendMfaCodeEmail: vi.fn(),
  mockGenerateMfaCode: vi.fn(),
}))

vi.mock('@/lib/email-crypto', () => ({ decryptEmail: mockDecryptEmail }))
vi.mock('@/lib/email', () => ({ sendMfaCodeEmail: mockSendMfaCodeEmail }))
vi.mock('@/lib/totp', () => ({ generateMfaCode: mockGenerateMfaCode }))

const USER = createUser({
  emailEncrypted: Buffer.alloc(32, 0xaa),
  emailNonce: Buffer.alloc(12, 0xbb),
  emailVerified: true,
})

function makeRequest(mfaToken: string) {
  return createNextRequest('http://localhost/api/auth/mfa/send-email', {
    method: 'POST',
    body: { mfaToken },
  })
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: USER.id,
    methods: ['email'],
    verified: [] as string[],
    emailCodeHash: null as string | null,
    emailSentAt: null as number | null,
    emailAttempts: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetRedisMock()
  vi.clearAllMocks()
  mockDecryptEmail.mockReturnValue('test@example.com')
  mockSendMfaCodeEmail.mockResolvedValue(undefined)
  mockGenerateMfaCode.mockReturnValue('482631')
})

describe('POST /api/auth/mfa/send-email', () => {
  it('generates code, stores hash, and sends email for valid session', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)

    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession()), 'EX', 300)

    const res = await POST(makeRequest('valid-token'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.sent).toBe(true)
    expect(mockGenerateMfaCode).toHaveBeenCalledOnce()
    expect(mockDecryptEmail).toHaveBeenCalled()
    expect(mockSendMfaCodeEmail).toHaveBeenCalledWith('test@example.com', USER.username, '482631')

    const updated = JSON.parse(await redisMock.get('mfa:valid-token')!)
    expect(updated.emailCodeHash).toBeDefined()
    expect(updated.emailCodeHash).not.toBeNull()
    expect(updated.emailSentAt).toBeGreaterThan(0)
  })

  it('returns 401 when MFA session is expired or missing', async () => {
    const res = await POST(makeRequest('expired-token'))
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toContain('expired')
  })

  it('returns 400 when email MFA is not enabled for the session', async () => {
    await redisMock.set(
      'mfa:valid-token',
      JSON.stringify(makeSession({ methods: ['totp'] })),
      'EX',
      300,
    )

    const res = await POST(makeRequest('valid-token'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('not enabled')
  })

  it('returns 400 when 60s cooldown has not elapsed', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)

    await redisMock.set(
      'mfa:valid-token',
      JSON.stringify(makeSession({ emailSentAt: Date.now() })),
      'EX',
      300,
    )

    const res = await POST(makeRequest('valid-token'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('60 seconds')
  })

  it('returns 400 when user has no verified email', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ emailEncrypted: null, emailNonce: null }),
    )

    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession()), 'EX', 300)

    const res = await POST(makeRequest('valid-token'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('verified email')
  })

  it('tolerates email send failure in dev mode', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)
    mockSendMfaCodeEmail.mockRejectedValue(new Error('SES failure'))

    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession()), 'EX', 300)

    const res = await POST(makeRequest('valid-token'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.sent).toBe(true)
  })

  it('never returns passwordHash in response', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)
    await redisMock.set('mfa:valid-token', JSON.stringify(makeSession()), 'EX', 300)

    const res = await POST(makeRequest('valid-token'))
    const json = await res.json()

    expect(json.data.passwordHash).toBeUndefined()
  })
})
