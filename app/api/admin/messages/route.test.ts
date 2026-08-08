import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'
import { GET } from './route'

const {
  mockGetAdminUser,
  mockCheckIpRate,
  mockSecureFindMany,
  mockSecureCount,
  mockBoxFindMany,
  mockBoxCount,
} = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn<(...args: unknown[]) => Promise<{ id: string; username: string; role: string }>>(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockSecureFindMany: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  mockSecureCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
  mockBoxFindMany: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  mockBoxCount: vi.fn<(...args: unknown[]) => Promise<number>>(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/prisma', () => ({
  default: {
    secureMessage: {
      findMany: mockSecureFindMany,
      count: mockSecureCount,
    },
    message: {
      findMany: mockBoxFindMany,
      count: mockBoxCount,
    },
  },
}))

const adminUser = { id: 'admin-1', username: 'admin', role: 'admin' as const }

const sampleSecure = [
  {
    id: 'sec-1',
    senderId: 'user-1',
    sender: { username: 'alice' },
    createdAt: new Date('2026-06-20T10:00:00Z'),
    readAt: null,
    isDestroyed: false,
    autoDestruct: false,
    passwordHash: null,
    startDate: null,
    endDate: null,
  },
  {
    id: 'sec-2',
    senderId: 'user-2',
    sender: { username: 'bob' },
    createdAt: new Date('2026-06-19T15:30:00Z'),
    readAt: new Date('2026-06-19T16:00:00Z'),
    isDestroyed: false,
    autoDestruct: true,
    passwordHash: 'hash',
    startDate: new Date('2026-06-15T00:00:00Z'),
    endDate: new Date('2026-06-25T00:00:00Z'),
  },
  {
    id: 'sec-3',
    senderId: 'user-3',
    sender: { username: 'carol' },
    createdAt: new Date('2026-06-17T12:00:00Z'),
    readAt: null,
    isDestroyed: true,
    autoDestruct: false,
    passwordHash: null,
    startDate: null,
    endDate: null,
  },
]

const sampleBox = [
  {
    id: 'box-1',
    poBoxId: 'po-1',
    poBox: { label: 'Support Box', slug: 'support-box' },
    createdAt: new Date('2026-06-18T08:00:00Z'),
    readAt: null,
  },
  {
    id: 'box-2',
    poBoxId: 'po-2',
    poBox: { label: 'Feedback', slug: 'feedback' },
    createdAt: new Date('2026-06-16T09:00:00Z'),
    readAt: new Date('2026-06-16T10:00:00Z'),
  },
]

describe('GET /api/admin/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
    mockGetAdminUser.mockResolvedValue(adminUser)
  })

  // ── Happy path: mixed secure + box ──────────────────────────────────

  it('returns merged entries sorted by createdAt desc with correct pagination', async () => {
    mockSecureFindMany.mockResolvedValue([sampleSecure[0], sampleSecure[1], sampleSecure[2]])
    mockSecureCount.mockResolvedValue(3)
    mockBoxFindMany.mockResolvedValue([sampleBox[0], sampleBox[1]])
    mockBoxCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/messages')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)

    // Pagination metadata
    expect(body.data.total).toBe(5)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(50)
    expect(body.data.totalPages).toBe(1)

    // Sorted by createdAt desc: sec-1 (20th) → sec-2 (19th) → box-1 (18th) → sec-3 (17th) → box-2 (16th)
    const entries = body.data.entries
    expect(entries).toHaveLength(5)
    expect(entries[0].id).toBe('sec-1')
    expect(entries[1].id).toBe('sec-2')
    expect(entries[2].id).toBe('box-1')
    expect(entries[3].id).toBe('sec-3')
    expect(entries[4].id).toBe('box-2')

    // Normalized shape — secure entry
    const sec = entries[0]
    expect(sec.type).toBe('secure')
    expect(sec.senderUsername).toBe('alice')
    expect(sec.targetLabel).toBeNull()
    expect(sec.status).toBe('pending')
    expect(sec.createdAt).toBe('2026-06-20T10:00:00.000Z')
    expect(sec.readAt).toBeNull()

    // Normalized shape — read secure
    const secRead = entries[1]
    expect(secRead.type).toBe('secure')
    expect(secRead.status).toBe('read')
    expect(secRead.readAt).toBe('2026-06-19T16:00:00.000Z')

    // Normalized shape — box entry
    const box = entries[2]
    expect(box.type).toBe('box')
    expect(box.senderUsername).toBeNull()
    expect(box.targetLabel).toBe('Support Box')
    expect(box.status).toBe('pending')
    expect(box.createdAt).toBe('2026-06-18T08:00:00.000Z')
    expect(box.readAt).toBeNull()

    // Normalized shape — destroyed secure
    const secDestroyed = entries[3]
    expect(secDestroyed.type).toBe('secure')
    expect(secDestroyed.status).toBe('destroyed')

    // No ciphertext or sensitive fields exposed
    expect(entries[0]).not.toHaveProperty('ciphertext')
    expect(entries[0]).not.toHaveProperty('urlFragment')
    expect(entries[2]).not.toHaveProperty('ciphertext')
  })

  // ── Filter: type=secure&status=read ─────────────────────────────────

  it('filters by type=secure and status=read', async () => {
    mockSecureFindMany.mockResolvedValue([sampleSecure[1]])
    mockSecureCount.mockResolvedValue(1)
    mockBoxFindMany.mockResolvedValue([])
    mockBoxCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/messages?type=secure&status=read')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(1)
    expect(body.data.entries[0].id).toBe('sec-2')
    expect(body.data.entries[0].status).toBe('read')
    expect(body.data.total).toBe(1)

    // Secure query has the read filter
    expect(mockSecureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { readAt: { not: null } } }),
    )
    expect(mockSecureCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { readAt: { not: null } } }),
    )

    // Box query suppressed
    expect(mockBoxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '00000000-0000-0000-0000-000000000000' } }),
    )
    expect(mockBoxCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '00000000-0000-0000-0000-000000000000' } }),
    )
  })

  // ── Filter: status=destroyed for box yields zero box entries ────────

  it('returns zero box entries when status=destroyed (box has no destroyed state)', async () => {
    mockSecureFindMany.mockResolvedValue([sampleSecure[2]])
    mockSecureCount.mockResolvedValue(1)
    mockBoxFindMany.mockResolvedValue([])
    mockBoxCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/messages?status=destroyed')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(1)
    expect(body.data.entries[0].type).toBe('secure')
    expect(body.data.entries[0].status).toBe('destroyed')
    expect(body.data.total).toBe(1)

    // Box query uses impossible where
    expect(mockBoxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '00000000-0000-0000-0000-000000000000' } }),
    )
    expect(mockBoxCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: '00000000-0000-0000-0000-000000000000' } }),
    )

    // Secure uses destroyed filter
    expect(mockSecureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isDestroyed: true } }),
    )
  })

  // ── Clamp: page=0&limit=999 ─────────────────────────────────────────

  it('clamps page=0 to 1 and limit=999 to 100', async () => {
    mockSecureFindMany.mockResolvedValue([])
    mockSecureCount.mockResolvedValue(0)
    mockBoxFindMany.mockResolvedValue([])
    mockBoxCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/messages?page=0&limit=999')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.page).toBe(1)
    expect(body.data.limit).toBe(100)
    expect(body.data.totalPages).toBe(1)

    // take = page * limit = 1 * 100 = 100
    expect(mockSecureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
    expect(mockBoxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    )
  })

  // ── Guard: 403 non-admin ────────────────────────────────────────────

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest('http://localhost/api/admin/messages')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  // ── Guard: 401 unauthenticated ──────────────────────────────────────

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError('No session token'))

    const req = createNextRequest('http://localhost/api/admin/messages')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.error).toBe('No session token')
  })

  // ── Guard: 429 rate limited ─────────────────────────────────────────

  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/messages')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Too many requests')
  })

  // ── Empty results ───────────────────────────────────────────────────

  it('returns empty list with totalPages=1 when no entries match', async () => {
    mockSecureFindMany.mockResolvedValue([])
    mockSecureCount.mockResolvedValue(0)
    mockBoxFindMany.mockResolvedValue([])
    mockBoxCount.mockResolvedValue(0)

    const req = createNextRequest('http://localhost/api/admin/messages?type=secure&status=read')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(0)
    expect(body.data.total).toBe(0)
    expect(body.data.totalPages).toBe(1) // 1 when total 0
  })

  // ── Invalid type/status treated as '' ───────────────────────────────

  it('treats invalid type and status as empty (returns all)', async () => {
    mockSecureFindMany.mockResolvedValue([sampleSecure[0]])
    mockSecureCount.mockResolvedValue(1)
    mockBoxFindMany.mockResolvedValue([sampleBox[0]])
    mockBoxCount.mockResolvedValue(1)

    const req = createNextRequest('http://localhost/api/admin/messages?type=xss&status=garbage')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.entries).toHaveLength(2)
    expect(body.data.total).toBe(2)

    // Both queries get empty where (no status filter)
    expect(mockSecureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
    expect(mockBoxFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    )
  })

  // ── Pagination: second page ─────────────────────────────────────────

  it('paginates to second page correctly', async () => {
    // Page 2 requires limit*2 from each table to ensure enough entries after merge
    mockSecureFindMany.mockResolvedValue([sampleSecure[0], sampleSecure[1], sampleSecure[2]])
    mockSecureCount.mockResolvedValue(3)
    mockBoxFindMany.mockResolvedValue([sampleBox[0], sampleBox[1]])
    mockBoxCount.mockResolvedValue(2)

    const req = createNextRequest('http://localhost/api/admin/messages?page=2&limit=2')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.page).toBe(2)
    expect(body.data.limit).toBe(2)
    expect(body.data.total).toBe(5)
    expect(body.data.totalPages).toBe(3)

    // take = page * limit = 2 * 2 = 4
    expect(mockSecureFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 4 }),
    )

    // Entries: sec-1, sec-2, box-1, sec-3, box-2 → page 2 (skip 2) = box-1, sec-3
    const entries = body.data.entries
    expect(entries).toHaveLength(2)
    expect(entries[0].id).toBe('box-1')
    expect(entries[1].id).toBe('sec-3')
  })
})
