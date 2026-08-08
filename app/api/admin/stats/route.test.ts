import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import { GET } from './route'

const { mockGetAdminUser, mockCheckIpRate, mockPrismaUserCount, mockPrismaPoBoxCount, mockPrismaMessageCount, mockPrismaSecureMessageCount, mockSecureMessageFindMany, mockSecureMessageGroupBy, mockMessageFindMany, mockMessageGroupBy, mockUserFindMany, mockPoBoxFindMany } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockPrismaUserCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockPrismaPoBoxCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockPrismaMessageCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockPrismaSecureMessageCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockSecureMessageFindMany: vi.fn(),
  mockSecureMessageGroupBy: vi.fn(),
  mockMessageFindMany: vi.fn(),
  mockMessageGroupBy: vi.fn(),
  mockUserFindMany: vi.fn(),
  mockPoBoxFindMany: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/prisma', () => ({
  default: {
    user: { count: mockPrismaUserCount, findMany: mockUserFindMany },
    poBox: { count: mockPrismaPoBoxCount, findMany: mockPoBoxFindMany },
    message: { count: mockPrismaMessageCount, findMany: mockMessageFindMany, groupBy: mockMessageGroupBy },
    secureMessage: { count: mockPrismaSecureMessageCount, findMany: mockSecureMessageFindMany, groupBy: mockSecureMessageGroupBy },
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
    mockPrismaSecureMessageCount.mockResolvedValue(0)
    mockSecureMessageFindMany.mockResolvedValue([])
    mockSecureMessageGroupBy.mockResolvedValue([])
    mockMessageFindMany.mockResolvedValue([])
    mockMessageGroupBy.mockResolvedValue([])
    mockUserFindMany.mockResolvedValue([])
    mockPoBoxFindMany.mockResolvedValue([])
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

    // SecureMessage count called 8 times: totalSecureMessages, readSecureMessages,
    // destroyedSecureMessages, autoDestructSecureMessages, passwordProtectedSecureMessages,
    // pendingSecureMessages, newSecureMessages7d, newSecureMessages30d
    mockPrismaSecureMessageCount
      .mockResolvedValueOnce(60)    // totalSecureMessages
      .mockResolvedValueOnce(25)    // readSecureMessages
      .mockResolvedValueOnce(10)    // destroyedSecureMessages
      .mockResolvedValueOnce(8)     // autoDestructSecureMessages
      .mockResolvedValueOnce(12)    // passwordProtectedSecureMessages
      .mockResolvedValueOnce(27)    // pendingSecureMessages (direct count: read+destroyed are independent, do not subtract)
      .mockResolvedValueOnce(5)     // newSecureMessages7d
      .mockResolvedValueOnce(18)    // newSecureMessages30d

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
      totalSecureMessages: 60,
      readSecureMessages: 25,
      destroyedSecureMessages: 10,
      autoDestructSecureMessages: 8,
      passwordProtectedSecureMessages: 12,
      pendingSecureMessages: 27,
      newSecureMessages7d: 5,
      newSecureMessages30d: 18,
      secureReadRate: 42,
      secureSent24h: 0,
      messageSent24h: 0,
      avgSecureReadHours: 0,
      avgDropReadHours: 0,
      topSecureSenders: [],
      topDropBoxes: [],
    })
  })

  it('returns pendingSecureMessages as a direct count so overlap between read and destroyed never yields a negative', async () => {
    // Reproduces the "-3 pending" bug: auto-destruct messages are counted in BOTH
    // readSecureMessages (readAt set) AND destroyedSecureMessages (isDestroyed set)
    // when revealed. Arithmetic `total - read - destroyed` double-counts them.
    // Here: total=10, read=8, destroyed=5 (3 shared) -> arithmetic = -3, real pending = 1.
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })
    mockPrismaUserCount.mockResolvedValue(0)
    mockPrismaPoBoxCount.mockResolvedValue(0)
    mockPrismaMessageCount.mockResolvedValue(0)
    mockPrismaSecureMessageCount
      .mockResolvedValueOnce(10) // totalSecureMessages
      .mockResolvedValueOnce(8)  // readSecureMessages (includes 3 auto-destruct)
      .mockResolvedValueOnce(5)  // destroyedSecureMessages (includes same 3 auto-destruct)
      .mockResolvedValueOnce(3)  // autoDestructSecureMessages
      .mockResolvedValueOnce(0)  // passwordProtectedSecureMessages
      .mockResolvedValueOnce(1)  // pendingSecureMessages
      .mockResolvedValueOnce(0)  // newSecureMessages7d
      .mockResolvedValueOnce(0)  // newSecureMessages30d

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.totalSecureMessages).toBe(10)
    expect(body.data.readSecureMessages).toBe(8)
    expect(body.data.destroyedSecureMessages).toBe(5)
    expect(body.data.pendingSecureMessages).toBe(1)
    expect(body.data.totalSecureMessages - body.data.readSecureMessages - body.data.destroyedSecureMessages).toBe(-3)
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

  it('returns message metrics with secureReadRate, avg times, and top lists', async () => {
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })

    // Existing count sequences (same call order as the happy test)
    mockPrismaUserCount
      .mockResolvedValueOnce(100)   // totalUsers
      .mockResolvedValueOnce(3)     // adminCount
      .mockResolvedValueOnce(12)    // newUsers7d
      .mockResolvedValueOnce(45)    // newUsers30d
    mockPrismaPoBoxCount
      .mockResolvedValueOnce(50)    // totalBoxes
      .mockResolvedValueOnce(5)     // newBoxes7d
      .mockResolvedValueOnce(20)    // newBoxes30d
      .mockResolvedValueOnce(30)    // activeBoxes
      .mockResolvedValueOnce(20)    // inactiveBoxes
    mockPrismaMessageCount
      .mockResolvedValueOnce(200)   // totalMessages
      .mockResolvedValueOnce(30)    // newMessages7d
      .mockResolvedValueOnce(120)   // newMessages30d
      .mockResolvedValueOnce(15)    // messageSent24h (new 4th call in third batch)
    mockPrismaSecureMessageCount
      .mockResolvedValueOnce(60)    // totalSecureMessages
      .mockResolvedValueOnce(25)    // readSecureMessages
      .mockResolvedValueOnce(10)    // destroyedSecureMessages
      .mockResolvedValueOnce(8)     // autoDestructSecureMessages
      .mockResolvedValueOnce(12)    // passwordProtectedSecureMessages
      .mockResolvedValueOnce(27)    // pendingSecureMessages
      .mockResolvedValueOnce(5)     // newSecureMessages7d
      .mockResolvedValueOnce(18)    // newSecureMessages30d
      .mockResolvedValueOnce(7)     // secureSent24h (new 9th call in third batch)

    const now = new Date()
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)

    // New mock fns: use mockResolvedValue (permanent) so they don't interact with Once sequences
    mockSecureMessageFindMany.mockResolvedValue([
      { createdAt: twoHoursAgo, readAt: now },
      { createdAt: fourHoursAgo, readAt: now },
    ])
    mockMessageFindMany.mockResolvedValue([])
    mockSecureMessageGroupBy.mockResolvedValue([
      { senderId: 'user1', _count: { _all: 5 } },
      { senderId: 'user2', _count: { _all: 3 } },
    ])
    mockMessageGroupBy.mockResolvedValue([
      { poBoxId: 'boxA', _count: { _all: 7 } },
    ])
    mockUserFindMany.mockResolvedValue([
      { id: 'user1', username: 'alice' },
      { id: 'user2', username: 'bob' },
    ])
    mockPoBoxFindMany.mockResolvedValue([
      { id: 'boxA', label: 'Alpha' },
    ])

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)

    // Existing fields still present
    expect(body.data.totalUsers).toBe(100)
    expect(body.data.totalBoxes).toBe(50)
    expect(body.data.totalMessages).toBe(200)

    // New metric fields
    expect(body.data.secureReadRate).toBe(42) // Math.round(25/60 * 100)
    expect(body.data.secureSent24h).toBe(7)
    expect(body.data.messageSent24h).toBe(15)
    expect(body.data.avgSecureReadHours).toBe(3) // avg of 2h and 4h
    expect(body.data.avgDropReadHours).toBe(0)
    expect(body.data.topSecureSenders).toEqual([
      { userId: 'user1', username: 'alice', count: 5 },
      { userId: 'user2', username: 'bob', count: 3 },
    ])
    expect(body.data.topDropBoxes).toEqual([
      { boxId: 'boxA', label: 'Alpha', count: 7 },
    ])
  })

  it('handles zero data without NaN or Infinity in message metrics', async () => {
    mockGetAdminUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })

    // All count mocks default to 0 via mockAllCounts in beforeEach
    // Explicitly set secureMessage.count to 0 (not covered by mockAllCounts)
    mockPrismaSecureMessageCount.mockResolvedValue(0)
    mockPrismaMessageCount.mockResolvedValue(0)

    // Empty findMany and groupBy results
    mockSecureMessageFindMany.mockResolvedValue([])
    mockMessageFindMany.mockResolvedValue([])
    mockSecureMessageGroupBy.mockResolvedValue([])
    mockMessageGroupBy.mockResolvedValue([])
    mockUserFindMany.mockResolvedValue([])
    mockPoBoxFindMany.mockResolvedValue([])

    const req = createNextRequest('http://localhost/api/admin/stats')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.secureReadRate).toBe(0) // totalSecureMessages === 0 → 0
    expect(body.data.avgSecureReadHours).toBe(0) // empty findMany → 0
    expect(body.data.avgDropReadHours).toBe(0) // empty findMany → 0
    expect(body.data.topSecureSenders).toEqual([])
    expect(body.data.topDropBoxes).toEqual([])
  })
})
