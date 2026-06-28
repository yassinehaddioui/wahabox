import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { createUser } from '@/test/helpers/fixtures'
import { POST } from './route'

const {
  mockVerifyCsrf,
  mockCheckIpRate,
  mockCheckUserRate,
  mockCheckGlobalRate,
  mockClearFailures,
} = vi.hoisted(() => ({
  mockVerifyCsrf: vi.fn(),
  mockCheckIpRate: vi.fn(),
  mockCheckUserRate: vi.fn(),
  mockCheckGlobalRate: vi.fn(),
  mockClearFailures: vi.fn(),
}))

vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/rate-limit', () => ({
  checkIpRate: mockCheckIpRate,
  checkUserRate: mockCheckUserRate,
  checkGlobalRate: mockCheckGlobalRate,
  clearFailures: mockClearFailures,
}))

const USER = createUser()
const CHALLENGE_B64 = Buffer.from(new Uint8Array(32).fill(0xab)).toString('base64')

function makeRequest(overrides: Record<string, unknown> = {}) {
  return createNextRequest('http://localhost/api/auth/recovery-complete', {
    method: 'POST',
    body: {
      username: 'testuser',
      csrfToken: 'valid-token',
      recoveryToken: 'rtoken123',
      decryptedChallenge: CHALLENGE_B64,
      newAuthVerifier: Buffer.alloc(32, 0xaa).toString('base64'),
      newAuthSalt: Buffer.alloc(16, 0xbb).toString('base64'),
      newEncPrivPw: Buffer.alloc(48, 0x11).toString('base64'),
      newPwKdfSalt: Buffer.alloc(16, 0x22).toString('base64'),
      newPwNonce: Buffer.alloc(24, 0x33).toString('base64'),
      newPublicKeySign: Buffer.alloc(32, 0x77).toString('base64'),
      newEncPrivSignPw: Buffer.alloc(48, 0x88).toString('base64'),
      newSignNoncePw: Buffer.alloc(24, 0x99).toString('base64'),
      ...overrides,
    },
  })
}

beforeEach(() => {
  resetRedisMock()
  vi.clearAllMocks()
  mockVerifyCsrf.mockResolvedValue(true)
  mockCheckIpRate.mockResolvedValue(false)
  mockCheckUserRate.mockResolvedValue(false)
  mockCheckGlobalRate.mockResolvedValue(false)
})

describe('POST /api/auth/recovery-complete', () => {
  it('updates password and bumps tokenVersion on challenge match', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    const updatedUser = { ...USER, tokenVersion: USER.tokenVersion + 1 }
    prismaMock.user.findUnique.mockResolvedValue(USER)
    prismaMock.user.update.mockResolvedValue(updatedUser)

    await redisMock.set('recovery:challenge:rtoken123', CHALLENGE_B64, 'EX', 300)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.passwordHash).toBeUndefined()

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: USER.id },
      data: {
        authVerifier: expect.any(Buffer),
        authSalt: expect.any(Buffer),
        encPrivPw: expect.any(Buffer),
        pwKdfSalt: expect.any(Buffer),
        pwNonce: expect.any(Buffer),
        publicKeySign: expect.any(Buffer),
        encPrivSignPw: expect.any(Buffer),
        signNoncePw: expect.any(Buffer),
        tokenVersion: { increment: 1 },
      },
    })
    expect(mockClearFailures).toHaveBeenCalledWith('testuser')
  })

  it('returns 400 when challenge does not match', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)

    await redisMock.set('recovery:challenge:rtoken123', CHALLENGE_B64, 'EX', 300)

    const res = await POST(
      makeRequest({ decryptedChallenge: Buffer.alloc(32, 0xff).toString('base64') }),
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('challenge')
  })

  it('returns 400 when recovery token is expired or missing', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('expired')
  })

  it('consumes (getdel) the challenge token on use', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)

    await redisMock.set('recovery:challenge:rtoken123', CHALLENGE_B64, 'EX', 300)

    await POST(makeRequest())

    const stored = await redisMock.get('recovery:challenge:rtoken123')
    expect(stored).toBeNull()
  })

  it('rejects reused recovery token', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)

    await redisMock.set('recovery:challenge:rtoken123', CHALLENGE_B64, 'EX', 300)
    await POST(makeRequest())

    const res = await POST(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(400)
    expect(json.error).toContain('expired')
  })

  it('returns 404 for unknown username', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
  })

  it('returns 400 when CSRF token is invalid', async () => {
    mockVerifyCsrf.mockResolvedValue(false)

    const res = await POST(makeRequest({ csrfToken: 'bad' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('CSRF')
  })

  it('returns 429 when IP rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
  })

  it('returns 429 when user rate limited', async () => {
    mockCheckUserRate.mockResolvedValue(true)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
  })

  it('returns 429 when global rate limited', async () => {
    mockCheckGlobalRate.mockResolvedValue(true)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
  })

  it('never returns passwordHash in response', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(USER)
    await redisMock.set('recovery:challenge:rtoken123', CHALLENGE_B64, 'EX', 300)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(json.data?.passwordHash).toBeUndefined()
  })
})
