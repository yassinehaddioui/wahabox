import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { resetRedisMock } from '@/test/helpers/redis-mock'
import { createUser } from '@/test/helpers/fixtures'
import { POST } from './route'

const { mockVerifyCsrf, mockCheckAuthRateLimit, mockRecordAuthFailure, mockSodium } = vi.hoisted(
  () => ({
    mockVerifyCsrf: vi.fn(),
    mockCheckAuthRateLimit: vi.fn(),
    mockRecordAuthFailure: vi.fn(),
    mockSodium: {
      ready: Promise.resolve(),
      randombytes_buf: vi.fn((size: number) => new Uint8Array(size).fill(0xab)),
      crypto_box_seal: vi.fn((msg: Uint8Array) => {
        const out = new Uint8Array(48)
        out.set(msg, 16)
        return out
      }),
    },
  }),
)

vi.mock('libsodium-wrappers-sumo', () => ({ default: mockSodium }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/rate-limit', () => ({
  checkAuthRateLimit: mockCheckAuthRateLimit,
  recordAuthFailure: mockRecordAuthFailure,
}))

function makeRequest(username: string, csrfToken?: string) {
  return createNextRequest('http://localhost/api/auth/recovery-start', {
    method: 'POST',
    body: { username, csrfToken: csrfToken ?? 'valid-token' },
  })
}

beforeEach(() => {
  resetRedisMock()
  vi.clearAllMocks()
  mockCheckAuthRateLimit.mockResolvedValue({
    ip: false,
    user: false,
    global: false,
    isLocked: false,
    lockoutRemainingMs: 0,
  })
  mockVerifyCsrf.mockResolvedValue(true)
})

describe('POST /api/auth/recovery-start', () => {
  it('returns sealed challenge and recovery material for known user', async () => {
    const user = createUser()
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(user)

    const res = await POST(makeRequest('testuser'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.encPrivRec).toBeDefined()
    expect(json.data.recKdfSalt).toBeDefined()
    expect(json.data.recNonce).toBeDefined()
    expect(json.data.publicKey).toBeDefined()
    expect(json.data.publicKeySign).toBeNull()
    expect(json.data.sealedChallenge).toBeDefined()
    expect(json.data.recoveryToken).toMatch(/^[0-9a-f]+$/)
    expect(json.data.passwordHash).toBeUndefined()
    expect(mockSodium.crypto_box_seal).toHaveBeenCalledTimes(1)
  })

  it('stores challenge in Redis', async () => {
    const user = createUser()
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(user)

    const res = await POST(makeRequest('testuser'))
    const json = await res.json()

    expect(json.success).toBe(true)

    const { redisMock } = await import('@/test/helpers/redis-mock')
    const stored = await redisMock.get(`recovery:challenge:${json.data.recoveryToken}`)
    expect(stored).toBe(Buffer.from(new Uint8Array(32).fill(0xab)).toString('base64'))
  })

  it('returns 404 for unknown user with dummy timing path', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(null)

    const res = await POST(makeRequest('nonexistent'))
    const json = await res.json()

    expect(res.status).toBe(404)
    expect(json.success).toBe(false)
    expect(mockRecordAuthFailure).toHaveBeenCalledWith('nonexistent', 'unknown')
  })

  it('returns 429 when rate limit says locked', async () => {
    mockCheckAuthRateLimit.mockResolvedValue({
      ip: false,
      user: false,
      global: false,
      isLocked: true,
      lockoutRemainingMs: 60_000,
    })

    const res = await POST(makeRequest('testuser'))
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
    expect(json.error).toContain('locked')
  })

  it('returns 429 when rate limit exceeded', async () => {
    mockCheckAuthRateLimit.mockResolvedValue({
      ip: true,
      user: false,
      global: false,
      isLocked: false,
      lockoutRemainingMs: 0,
    })

    const res = await POST(makeRequest('testuser'))
    const json = await res.json()

    expect(res.status).toBe(429)
    expect(json.success).toBe(false)
    expect(json.error).toContain('Too many')
  })

  it('returns 400 when CSRF token is invalid', async () => {
    mockVerifyCsrf.mockResolvedValue(false)

    const res = await POST(makeRequest('testuser', 'bad-token'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('CSRF')
  })

  it('returns 400 when CSRF token is null', async () => {
    mockVerifyCsrf.mockResolvedValue(false)
    const res = await POST(
      createNextRequest('http://localhost/api/auth/recovery-start', {
        method: 'POST',
        body: { username: 'testuser' },
      }),
    )
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('CSRF')
  })

  it('never returns passwordHash in response', async () => {
    const user = createUser()
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(user)

    const res = await POST(makeRequest('testuser'))
    const json = await res.json()

    expect(json.data.passwordHash).toBeUndefined()
    expect(Object.keys(json.data)).not.toContain('passwordHash')
  })

  it('queries only encPrivRec/recKdfSalt/recNonce/publicKey from user', async () => {
    const user = createUser()
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue(user)

    await POST(makeRequest('testuser'))

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { username: 'testuser' },
      select: {
        encPrivRec: true,
        recKdfSalt: true,
        recNonce: true,
        publicKey: true,
      },
    })
  })
})
