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
    auditLog: {
      findMany: mockFindMany,
      count: mockCount,
    },
  },
}))

const adminUser = { id: 'admin-1', username: 'admin', role: 'admin' as const }

const sampleEntries = [
  {
    id: 'log-1',
    actorId: 'admin-1',
    actorUsername: 'admin',
    action: 'admin.promote',
    targetType: 'user',
    targetId: 'user-1',
    targetLabel: 'alice',
    metadata: null,
    ip: '10.0.0.1',
    createdAt: new Date('2026-06-20T10:00:00Z'),
  },
  {
    id: 'log-2',
    actorId: 'admin-1',
    actorUsername: 'admin',
    action: 'admin.box_delete',
    targetType: 'box',
    targetId: 'box-5',
    targetLabel: 'Old Box',
    metadata: { reason: 'spam' },
    ip: '10.0.0.1',
    createdAt: new Date('2026-06-19T15:30:00Z'),
  },
  {
    id: 'log-3',
    actorId: 'admin-2',
    actorUsername: 'superadmin',
    action: 'admin.demote',
    targetType: 'user',
    targetId: 'user-3',
    targetLabel: 'bob',
    metadata: null,
    ip: '10.0.0.2',
    createdAt: new Date('2026-06-18T08:00:00Z'),
  },
]

describe('GET /api/admin/audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockGetAdminUser.mockResolvedValue(adminUser)
  })

  it('returns paginated audit log entries for admin', async () => {
    mockFindMany.mockResolvedValue(sampleEntries)
    mockCount.mockResolvedValue(3)

    const req = createNextRequest('http://localhost/api/admin/audit-log')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.entries).toHaveLength(3)
    expect(body.data.total).toBe(3)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(50)
    expect(body.data.totalPages).toBe(1)

    // Verify entry fields
    const first = body.data.entries[0]
    expect(first.id).toBe('log-1')
    expect(first.action).toBe('admin.promote')
    expect(first.actorUsername).toBe('admin')
    expect(first.targetType).toBe('user')
    expect(first.targetLabel).toBe('alice')
  })

  it('filters by action', async () => {
    mockFindMany.mockResolvedValue([sampleEntries[0]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/audit-log?action=admin.promote')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(1)
    expect(body.data.entries[0].action).toBe('admin.promote')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { action: 'admin.promote' } }),
    )
  })

  it('filters by actorId', async () => {
    mockFindMany.mockResolvedValue([sampleEntries[2]])
    mockCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/audit-log?actorId=admin-2')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(1)
    expect(body.data.entries[0].actorId).toBe('admin-2')

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorId: 'admin-2' } }),
    )
  })

  it('paginates with custom page and limit', async () => {
    mockFindMany.mockResolvedValue([sampleEntries[2]])
    mockCount.mockResolvedValue(9)

    const req = createNextRequest('http://localhost/api/admin/audit-log?page=3&limit=3')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.page).toBe(3)
    expect(body.data.limit).toBe(3)
    expect(body.data.total).toBe(9)
    expect(body.data.totalPages).toBe(3)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 6, take: 3 }),
    )
  })

  it('clamps page to minimum 1', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/audit-log?page=-5')
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

    const req = createNextRequest('http://localhost/api/admin/audit-log')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError('No session token'))

    const req = createNextRequest('http://localhost/api/admin/audit-log')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toBe('No session token')
  })

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/audit-log')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Too many requests')
  })

  it('returns empty list when no entries match', async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/audit-log?action=nonexistent')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(0)
    expect(body.data.total).toBe(0)
    expect(body.data.totalPages).toBe(0)
  })

  it('enforces max limit of 100', async () => {
    mockFindMany.mockResolvedValue(sampleEntries)
    mockCount.mockResolvedValue(3)

    const req = createNextRequest('http://localhost/api/admin/audit-log?limit=500')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.limit).toBe(100)
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })
})
