import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'
import { PATCH, DELETE } from './route'

const {
  mockGetAdminUser,
  mockCheckIpRate,
  mockVerifyCsrf,
  mockWriteAuditLog,
} = vi.hoisted(() => ({
  mockGetAdminUser: vi.fn<
    (...args: unknown[]) => Promise<{ id: string; username: string; role: string }>
  >(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockVerifyCsrf: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockWriteAuditLog: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('@/lib/auth', () => ({ getAdminUser: mockGetAdminUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/admin-audit', () => ({ writeAuditLog: mockWriteAuditLog }))

const BOX_ID = 'box-abc-123'

type BoxFixture = {
  id: string
  label: string
  isActive: boolean
  owner: { username: string }
  _count?: { messages: number }
}

const ACTIVE_BOX: BoxFixture = {
  id: BOX_ID,
  label: 'Support Inbox',
  isActive: true,
  owner: { username: 'boxowner' },
  _count: { messages: 5 },
}

const INACTIVE_BOX: BoxFixture = {
  id: BOX_ID,
  label: 'Old Archive',
  isActive: false,
  owner: { username: 'boxowner' },
  _count: { messages: 12 },
}

function happySetup(overrides?: {
  adminRole?: string
  boxFixture?: BoxFixture | null
  ipLimited?: boolean
  csrfValid?: boolean
}) {
  resetPrismaMock()
  vi.clearAllMocks()

  const {
    adminRole = 'admin',
    boxFixture = ACTIVE_BOX,
    ipLimited = false,
    csrfValid = true,
  } = overrides ?? {}

  mockGetAdminUser.mockResolvedValue({
    id: 'admin-1',
    username: 'theadmin',
    role: adminRole,
  })
  mockCheckIpRate.mockResolvedValue(ipLimited)
  mockVerifyCsrf.mockResolvedValue(csrfValid)
  prismaMock.poBox.findUnique.mockResolvedValue(boxFixture)
  prismaMock.poBox.update.mockResolvedValue({})
  prismaMock.poBox.delete.mockResolvedValue({})
  mockWriteAuditLog.mockResolvedValue(undefined)
}

// ─── PATCH tests ────────────────────────────────────────────────

describe('PATCH /api/admin/boxes/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('deactivates box and writes audit log', async () => {
    happySetup()

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { isActive: false, csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.isActive).toBe(false)
    expect(body.data.id).toBe(BOX_ID)
    expect(prismaMock.poBox.update).toHaveBeenCalledWith({
      where: { id: BOX_ID },
      data: { isActive: false },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actorUsername: 'theadmin',
        action: 'admin.box_deactivate',
        targetType: 'box',
        targetId: BOX_ID,
        targetLabel: 'Support Inbox',
        metadata: { ownerUsername: 'boxowner' },
      }),
    )
  })

  it('activates box and writes audit log', async () => {
    happySetup({ boxFixture: INACTIVE_BOX })

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { isActive: true, csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.isActive).toBe(true)
    expect(prismaMock.poBox.update).toHaveBeenCalledWith({
      where: { id: BOX_ID },
      data: { isActive: true },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.box_activate',
        targetLabel: 'Old Archive',
      }),
    )
  })

  it('returns 404 when box does not exist', async () => {
    happySetup({ boxFixture: null })

    const req = createNextRequest(`http://localhost/api/admin/boxes/nonexistent`, {
      method: 'PATCH',
      body: { isActive: false, csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: 'nonexistent' }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Box not found')
  })

  it('rejects invalid CSRF token with 400', async () => {
    happySetup({ csrfValid: false })

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { isActive: false, csrfToken: 'bad-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid CSRF token')
  })

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { isActive: false, csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  it('returns 429 when rate limited', async () => {
    happySetup({ ipLimited: true })

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { isActive: false, csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(429)
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError())

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { isActive: false, csrfToken: 'valid-csrf' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(401)
  })

  it('rejects request with missing isActive field', async () => {
    happySetup()

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'PATCH',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(400)
  })
})

// ─── DELETE tests ───────────────────────────────────────────────

describe('DELETE /api/admin/boxes/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('deletes box and writes audit log before deletion', async () => {
    happySetup()

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('Box deleted')
    expect(prismaMock.poBox.delete).toHaveBeenCalledWith({
      where: { id: BOX_ID },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actorUsername: 'theadmin',
        action: 'admin.box_delete',
        targetType: 'box',
        targetId: BOX_ID,
        targetLabel: 'Support Inbox',
        metadata: { ownerUsername: 'boxowner', messageCount: 5 },
      }),
    )
  })

  it('returns 404 when box does not exist', async () => {
    happySetup({ boxFixture: null })

    const req = createNextRequest(`http://localhost/api/admin/boxes/nonexistent`, {
      method: 'DELETE',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: 'nonexistent' }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Box not found')
  })

  it('rejects invalid CSRF token with 400', async () => {
    happySetup({ csrfValid: false })

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'bad-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid CSRF token')
  })

  it('rejects CSRF replay with 400', async () => {
    happySetup()
    // First call consumes the token
    mockVerifyCsrf.mockResolvedValue(true)

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'used-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(200)

    // Second call with same token — CSRF already consumed
    mockVerifyCsrf.mockResolvedValue(false)

    const req2 = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'used-csrf' },
      cookies: { session: 'valid' },
    })
    const res2 = await DELETE(req2, createRouteContext({ id: BOX_ID }))
    const body2 = await res2.json()

    expect(res2.status).toBe(400)
    expect(body2.success).toBe(false)
    expect(body2.error).toBe('Invalid CSRF token')
  })

  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  it('returns 429 when rate limited', async () => {
    happySetup({ ipLimited: true })

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(429)
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError())

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: { csrfToken: 'valid-csrf' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(401)
  })

  it('rejects request with missing csrfToken field', async () => {
    happySetup()

    const req = createNextRequest(`http://localhost/api/admin/boxes/${BOX_ID}`, {
      method: 'DELETE',
      body: {},
      cookies: { session: 'valid' },
    })
    const res = await DELETE(req, createRouteContext({ id: BOX_ID }))
    expect(res.status).toBe(400)
  })
})
