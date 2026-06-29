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
    user: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}))

const adminUser = { id: 'admin-1', username: 'admin', role: 'admin' as const }

const sampleUsers = [
  {
    id: '1',
    username: 'alice',
    role: 'user',
    emailEncrypted: Buffer.from('encrypted'),
    emailVerified: true,
    notificationsEnabled: true,
    mfaEmail: false,
    mfaTotp: true,
    mfaPasskey: false,
    createdAt: new Date('2025-01-01'),
    _count: { poBoxes: 2 },
  },
  {
    id: '2',
    username: 'bob_admin',
    role: 'admin',
    emailEncrypted: null,
    emailVerified: false,
    notificationsEnabled: false,
    mfaEmail: true,
    mfaTotp: false,
    mfaPasskey: true,
    createdAt: new Date('2025-06-01'),
    _count: { poBoxes: 0 },
  },
]

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockGetAdminUser.mockResolvedValue(adminUser)
  })

  it('returns paginated user list for admin', async () => {
    mockFindMany.mockResolvedValue(sampleUsers)
    mockCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/users')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.users).toHaveLength(2)
    expect(body.data.total).toBe(2)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(20)
    expect(body.data.totalPages).toBe(1)

    // Mapped fields
    const alice = body.data.users[0]
    expect(alice).not.toHaveProperty('emailEncrypted')
    expect(alice).not.toHaveProperty('_count')
    expect(alice.hasEmail).toBe(true)
    expect(alice.boxCount).toBe(2)

    const bob = body.data.users[1]
    expect(bob.hasEmail).toBe(false)
    expect(bob.boxCount).toBe(0)
  })

  it('searches by username with case-insensitive contains', async () => {
    mockFindMany.mockResolvedValue([sampleUsers[1]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/users?q=admin')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.users).toHaveLength(1)
    expect(body.data.users[0].username).toBe('bob_admin')

    // Verify where clause includes contains
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: { contains: 'admin', mode: 'insensitive' } },
      }),
    )
  })

  it('filters by role', async () => {
    mockFindMany.mockResolvedValue([sampleUsers[1]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/users?role=admin')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.users).toHaveLength(1)
    expect(body.data.users[0].role).toBe('admin')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'admin' } }),
    )
  })

  it('filters by role=user', async () => {
    mockFindMany.mockResolvedValue([sampleUsers[0]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/users?role=user')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.users[0].role).toBe('user')
  })

  it('ignores invalid role values', async () => {
    mockFindMany.mockResolvedValue(sampleUsers)
    mockCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/users?role=superadmin')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    // No role filter applied — returns all users
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })

  it('paginates with custom page and limit', async () => {
    mockFindMany.mockResolvedValue([sampleUsers[1]])
    mockCount.mockResolvedValue(7)

    const req = createNextRequest('http://localhost/api/admin/users?page=3&limit=3')
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

    const req = createNextRequest('http://localhost/api/admin/users?page=-5')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.page).toBe(1)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    )
  })

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest('http://localhost/api/admin/users')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError('No session token'))

    const req = createNextRequest('http://localhost/api/admin/users')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toBe('No session token')
  })

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/users')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Too many requests')
  })

  it('returns empty list when no users match', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/users?q=nonexistent')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.users).toHaveLength(0)
    expect(body.data.total).toBe(0)
    expect(body.data.totalPages).toBe(0)
  })

  it('enforces max limit of 100', async () => {
    mockFindMany.mockResolvedValue(sampleUsers)
    mockCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/users?limit=500')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.limit).toBe(100)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })
})
