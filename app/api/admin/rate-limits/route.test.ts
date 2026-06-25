import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError, ForbiddenError, RateLimitError } from '@/lib/errors'
import { GET } from './route'

const { mockGetAdminUser, mockCheckIpRate, mockGetRedis } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn(),
  mockCheckIpRate: vi.fn(),
  mockGetRedis: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/redis', () => ({ getRedis: mockGetRedis }))

/** Build a fake Redis client whose keys() returns pre-configured counts per pattern. */
function createRedisMock(counts: Record<string, number>) {
  return {
    keys: vi.fn((pattern: string) => Promise.resolve(Array(counts[pattern] ?? 0).fill('key'))),
  }
}

/** Pre-built Redis mock returning distinct non-zero counts for each pattern. */
function connectedRedisMock() {
  return createRedisMock({
    'rl:ip:*': 12,
    'rl:user:*': 5,
    'rl:global': 1,
    'fail:*': 3,
    'drop:count:*': 7,
  })
}

const adminUser = { id: '1', username: 'admin', role: 'admin' as const }

describe('GET /api/admin/rate-limits', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockGetAdminUser.mockResolvedValue(adminUser)
    mockGetRedis.mockResolvedValue(connectedRedisMock())
  })

  it('returns 200 with rate-limit key counts for admin user', async () => {
    const req = createNextRequest('http://localhost/api/admin/rate-limits')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.redisConnected).toBe(true)
    expect(body.data.ipRateLimitKeys).toBe(12)
    expect(body.data.userRateLimitKeys).toBe(5)
    expect(body.data.globalRateLimitKey).toBe(1)
    expect(body.data.authFailureKeys).toBe(3)
    expect(body.data.dropCountKeys).toBe(7)
  })

  it('returns 403 when user is not an admin', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest('http://localhost/api/admin/rate-limits')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.code).toBe('FORBIDDEN')
  })

  it('returns 401 when user is unauthenticated', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError('No session token'))

    const req = createNextRequest('http://localhost/api/admin/rate-limits')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('returns 200 with redisConnected=false and zero counts when Redis is down', async () => {
    mockGetRedis.mockRejectedValue(new Error('Connection refused'))

    const req = createNextRequest('http://localhost/api/admin/rate-limits')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.redisConnected).toBe(false)
    expect(body.data.ipRateLimitKeys).toBe(0)
    expect(body.data.userRateLimitKeys).toBe(0)
    expect(body.data.globalRateLimitKey).toBe(0)
    expect(body.data.authFailureKeys).toBe(0)
    expect(body.data.dropCountKeys).toBe(0)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/rate-limits')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.code).toBe('RATE_LIMITED')
  })

  it('returns correct counts even when Redis has zero keys', async () => {
    mockGetRedis.mockResolvedValue(createRedisMock({}))

    const req = createNextRequest('http://localhost/api/admin/rate-limits')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.redisConnected).toBe(true)
    expect(body.data.ipRateLimitKeys).toBe(0)
    expect(body.data.userRateLimitKeys).toBe(0)
    expect(body.data.globalRateLimitKey).toBe(0)
    expect(body.data.authFailureKeys).toBe(0)
    expect(body.data.dropCountKeys).toBe(0)
  })
})
