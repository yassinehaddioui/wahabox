import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import { GET } from './route'

const { mockGetAdminUser, mockCheckIpRate, mockRedisPing } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn<
    (...args: unknown[]) => Promise<{ id: string; username: string; role: string }>
  >(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockRedisPing: vi.fn<() => Promise<unknown>>(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/prisma', () => ({ default: { $queryRaw: vi.fn() } }))
vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({ ping: mockRedisPing }),
  withRedis: async <T>(fn: (r: unknown) => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn({ ping: mockRedisPing })
    } catch {
      return fallback
    }
  },
  closeRedis: async () => {},
}))

import prisma from '@/lib/prisma'

const URL = 'http://localhost/api/admin/health'

describe('GET /api/admin/health', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockRedisPing.mockResolvedValue('PONG')
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ '1': 1 }])
  })

  it('returns 200 with health fields for admin user', async () => {
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })

    const req = createNextRequest(URL)
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.appVersion).toBe('0.1.0')
    expect(body.data.nodeEnv).toBe('test')
    expect(body.data.dbConnected).toBe(true)
    expect(body.data.redisConnected).toBe(true)
    expect(body.data.emailConfigured).toBe(false)
    expect(body.data.turnstileConfigured).toBe(false)
    expect(body.data.adminPromoteConfigured).toBe(false)
  })

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest(URL)
    const res = await GET(req)

    expect(res.status).toBe(403)
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError())

    const req = createNextRequest(URL)
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest(URL)
    const res = await GET(req)

    expect(res.status).toBe(429)
  })

  it('returns 200 with dbConnected=false when DB is down', async () => {
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('connection refused'))

    const req = createNextRequest(URL)
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.dbConnected).toBe(false)
    expect(body.data.redisConnected).toBe(true)
  })

  it('returns 200 with redisConnected=false when Redis is down', async () => {
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })
    mockRedisPing.mockRejectedValue(new Error('connection refused'))

    const req = createNextRequest(URL)
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.dbConnected).toBe(true)
    expect(body.data.redisConnected).toBe(false)
  })
})
