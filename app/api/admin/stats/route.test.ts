import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { ForbiddenError, UnauthorizedError, RateLimitError } from '@/lib/errors'
import { GET } from './route'

const { mockGetAdminUser, mockCheckIpRate, mockPrismaUserCount, mockPrismaPoBoxCount, mockPrismaMessageCount } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockPrismaUserCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockPrismaPoBoxCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockPrismaMessageCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/prisma', () => ({
  default: {
    user: { count: mockPrismaUserCount },
    poBox: { count: mockPrismaPoBoxCount },
    message: { count: mockPrismaMessageCount },
  },
}))

function mockAllCounts(user: number, box: number, msg: number) {
  mockPrismaUserCount.mockResolvedValue(user)
  mockPrismaPoBoxCount.mockResolvedValue(box)
  mockPrismaMessageCount.mockResolvedValue(msg)
}

describe('GET /api/admin/stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockAllCounts(0, 0, 0)
  })

  it('returns 200 with all stat fields for admin user', async () => {
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })
    // Set specific counts for first batch (totalUsers, totalBoxes, totalMessages, adminCount)
    // and second batch (new7d, new30d, active, inactive)
    // User count called 4 times: totalUsers, adminCount, newUsers7d, newUsers30d
    mockPrismaUserCount
      .mockResolvedValueOnce(100)   // totalUsers
      .mockResolvedValueOnce(3)     // adminCount
      .mockResolvedValueOnce(12)    // newUsers7d
      .mockResolvedValueOnce(45)    // newUsers30d
    // PoBox count called 5 times: totalBoxes, newBoxes7d, newBoxes30d, activeBoxes, inactiveBoxes
    mockPrismaPoBoxCount
      .mockResolvedValueOnce(50)    // totalBoxes
      .mockResolvedValueOnce(5)     // newBoxes7d
      .mockResolvedValueOnce(20)    // newBoxes30d
      .mockResolvedValueOnce(30)    // activeBoxes
      .mockResolvedValueOnce(20)    // inactiveBoxes
    // Message count called 3 times: totalMessages, newMessages7d, newMessages30d
    mockPrismaMessageCount
      .mockResolvedValueOnce(200)   // totalMessages
      .mockResolvedValueOnce(30)    // newMessages7d
      .mockResolvedValueOnce(120)   // newMessages30d

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({
      totalUsers: 100,
      totalBoxes: 50,
      totalMessages: 200,
      adminCount: 3,
      newUsers7d: 12,
      newBoxes7d: 5,
      newMessages7d: 30,
      newUsers30d: 45,
      newBoxes30d: 20,
      newMessages30d: 120,
      activeBoxes: 30,
      inactiveBoxes: 20,
    })
  })

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError('No session token'))

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
  })

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
  })
})
