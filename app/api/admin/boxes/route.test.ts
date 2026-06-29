import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import { GET } from './route'

const { mockGetAdminUser, mockCheckIpRate, mockFindMany, mockCount } = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn<(...args: unknown[]) => Promise<{ id: string; username: string; role: string }>>(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockFindMany: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  mockCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/prisma', () => ({
  default: {
    poBox: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}))

const adminUser = { id: 'admin-1', username: 'admin', role: 'admin' as const }

const sampleBoxes = [
  {
    id: 'box-1',
    label: 'Support Inbox',
    slug: 'support-inbox',
    isActive: true,
    expiresAt: new Date('2026-12-31'),
    maxMessages: 100,
    passwordHash: 'hashed-secret',
    createdAt: new Date('2025-06-01'),
    owner: { id: 'user-1', username: 'alice' },
    _count: { messages: 5 },
  },
  {
    id: 'box-2',
    label: 'Feedback Box',
    slug: 'feedback-box',
    isActive: false,
    expiresAt: null,
    maxMessages: null,
    passwordHash: null,
    createdAt: new Date('2025-01-15'),
    owner: { id: 'user-2', username: 'bob' },
    _count: { messages: 0 },
  },
]

describe('GET /api/admin/boxes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockGetAdminUser.mockResolvedValue(adminUser)
  })

  it('returns paginated box list for admin with owner info and computed fields', async () => {
    mockFindMany.mockResolvedValue(sampleBoxes)
    mockCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/boxes')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.boxes).toHaveLength(2)
    expect(body.data.total).toBe(2)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(20)
    expect(body.data.totalPages).toBe(1)

    // First box — active, with password
    const support = body.data.boxes[0]
    expect(support.id).toBe('box-1')
    expect(support.label).toBe('Support Inbox')
    expect(support.ownerId).toBe('user-1')
    expect(support.ownerUsername).toBe('alice')
    expect(support.isActive).toBe(true)
    expect(support.hasPassword).toBe(true)
    expect(support.messageCount).toBe(5)
    expect(support).not.toHaveProperty('passwordHash')
    expect(support).not.toHaveProperty('_count')
    expect(support).not.toHaveProperty('owner')

    // Second box — inactive, no password
    const feedback = body.data.boxes[1]
    expect(feedback.id).toBe('box-2')
    expect(feedback.ownerUsername).toBe('bob')
    expect(feedback.isActive).toBe(false)
    expect(feedback.hasPassword).toBe(false)
    expect(feedback.messageCount).toBe(0)
  })

  it('searches by label with case-insensitive contains', async () => {
    mockFindMany.mockResolvedValue([sampleBoxes[0]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/boxes?q=support')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.boxes).toHaveLength(1)
    expect(body.data.boxes[0].label).toBe('Support Inbox')

    // Verify where clause includes OR with label contains
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { label: { contains: 'support', mode: 'insensitive' } },
            { owner: { username: { contains: 'support', mode: 'insensitive' } } },
          ],
        },
      }),
    )
  })

  it('filters by isActive=true', async () => {
    mockFindMany.mockResolvedValue([sampleBoxes[0]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/boxes?isActive=true')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.boxes).toHaveLength(1)
    expect(body.data.boxes[0].isActive).toBe(true)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true } }),
    )
  })

  it('filters by isActive=false', async () => {
    mockFindMany.mockResolvedValue([sampleBoxes[1]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/boxes?isActive=false')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.boxes).toHaveLength(1)
    expect(body.data.boxes[0].isActive).toBe(false)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: false } }),
    )
  })

  it('filters by ownerId', async () => {
    mockFindMany.mockResolvedValue([sampleBoxes[1]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/boxes?ownerId=user-2')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.boxes).toHaveLength(1)
    expect(body.data.boxes[0].ownerId).toBe('user-2')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'user-2' } }),
    )
  })

  it('paginates with custom page and limit', async () => {
    mockFindMany.mockResolvedValue([sampleBoxes[0]])
    mockCount.mockResolvedValue(7)

    const req = createNextRequest('http://localhost/api/admin/boxes?page=3&limit=3')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.page).toBe(3)
    expect(body.data.limit).toBe(3)
    expect(body.data.total).toBe(7)
    expect(body.data.totalPages).toBe(3)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 6, take: 3 }),
    )
  })

  it('clamps page to minimum 1', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/boxes?page=-5')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.page).toBe(1)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    )
  })

  it('enforces max limit of 100', async () => {
    mockFindMany.mockResolvedValue(sampleBoxes)
    mockCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/boxes?limit=500')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.limit).toBe(100)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest('http://localhost/api/admin/boxes')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError('No session token'))

    const req = createNextRequest('http://localhost/api/admin/boxes')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toBe('No session token')
  })

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/boxes')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Too many requests')
  })

  it('returns empty list when no boxes match', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/boxes?q=nonexistent')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.boxes).toHaveLength(0)
    expect(body.data.total).toBe(0)
    expect(body.data.totalPages).toBe(0)
  })
})
