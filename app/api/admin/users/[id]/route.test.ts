import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { UnauthorizedError, ForbiddenError } from '@/lib/errors'
import { PATCH } from './route'

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

const TARGET_ID = 'user-target'

function happySetup(overrides?: {
  adminRole?: string
  targetRole?: string
  targetTokenVersion?: number
  ipLimited?: boolean
  csrfValid?: boolean
}) {
  resetPrismaMock()
  vi.clearAllMocks()

  const {
    adminRole = 'admin',
    targetRole = 'user',
    targetTokenVersion = 3,
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
  prismaMock.user.findUnique.mockResolvedValue({
    id: TARGET_ID,
    username: 'targetuser',
    role: targetRole,
    tokenVersion: targetTokenVersion,
  })
  prismaMock.user.update.mockResolvedValue({})
  mockWriteAuditLog.mockResolvedValue(undefined)
}

describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  // Test 1: Promote user → 200 + role changed + audit log written
  it('promotes user to admin and writes audit log', async () => {
    happySetup()

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('User promoted to admin')
    expect(body.data.action).toBe('promote')
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { role: 'admin' },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'admin-1',
        actorUsername: 'theadmin',
        action: 'admin.promote',
        targetType: 'user',
        targetId: TARGET_ID,
        targetLabel: 'targetuser',
      }),
    )
  })

  // Test 2: Demote admin → 200 + role changed + audit log written
  it('demotes admin to user and writes audit log', async () => {
    happySetup({ targetRole: 'admin' })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'demote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('User demoted to user')
    expect(body.data.action).toBe('demote')
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { role: 'user' },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.demote',
        targetId: TARGET_ID,
      }),
    )
  })

  // Test 3: Self-demotion rejected → 400
  it('rejects self-demotion with 400', async () => {
    happySetup({ adminRole: 'admin', targetRole: 'admin' })
    // Make the admin user itself the target
    mockGetAdminUser.mockResolvedValue({
      id: TARGET_ID,
      username: 'theadmin',
      role: 'admin',
    })
    prismaMock.user.findUnique.mockResolvedValue({
      id: TARGET_ID,
      username: 'theadmin',
      role: 'admin',
      tokenVersion: 5,
    })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'demote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Cannot demote yourself')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  // Test 4: Force logout → 200 + tokenVersion incremented + audit written
  it('force-logouts user by incrementing tokenVersion and writes audit log', async () => {
    happySetup({ targetTokenVersion: 7 })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'force_logout', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('User force-logged out')
    expect(body.data.action).toBe('force_logout')
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: TARGET_ID },
      data: { tokenVersion: { increment: 1 } },
    })
    expect(mockWriteAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.force_logout',
        targetId: TARGET_ID,
      }),
    )
  })

  // Test 5: Self-force-logout rejected → 400
  it('rejects self-force-logout with 400', async () => {
    happySetup()
    mockGetAdminUser.mockResolvedValue({
      id: TARGET_ID,
      username: 'theadmin',
      role: 'admin',
    })
    prismaMock.user.findUnique.mockResolvedValue({
      id: TARGET_ID,
      username: 'theadmin',
      role: 'user',
      tokenVersion: 3,
    })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'force_logout', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Cannot force-logout yourself')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  // Test 6: User not found → 404
  it('returns 404 when target user does not exist', async () => {
    happySetup()
    prismaMock.user.findUnique.mockResolvedValue(null)

    const req = createNextRequest('http://localhost/api/admin/users/nonexistent', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: 'nonexistent' }))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toBe('User not found')
  })

  // Test 7: Invalid CSRF → 400
  it('rejects invalid CSRF token with 400', async () => {
    happySetup({ csrfValid: false })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'bad-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid CSRF token')
  })

  // Test 8: Non-admin → 403
  it('returns 403 for non-admin user', async () => {
    mockGetAdminUser.mockRejectedValue(new ForbiddenError('Admin access required'))

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Admin access required')
  })

  // Test 9: Unauthenticated → 401
  it('returns 401 for unauthenticated request', async () => {
    mockGetAdminUser.mockRejectedValue(new UnauthorizedError())

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'valid-csrf' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    expect(res.status).toBe(401)
  })

  // Test 10: Rate limited → 429
  it('returns 429 when rate limited', async () => {
    happySetup({ ipLimited: true })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    expect(res.status).toBe(429)
  })

  // Test 11: Already admin on promote → 200 with message
  it('returns 200 with already-admin message when target is already admin', async () => {
    happySetup({ targetRole: 'admin' })

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'promote', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('Already admin')
    expect(body.data.action).toBe('promote')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  // Test 12: Unknown action → 400
  it('rejects unknown action with 400', async () => {
    happySetup()

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { action: 'delete', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Unknown action: delete')
  })

  // Test 13: Missing action → 400
  it('rejects request with missing action field', async () => {
    happySetup()

    const req = createNextRequest('http://localhost/api/admin/users/user-target', {
      method: 'PATCH',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await PATCH(req, createRouteContext({ id: TARGET_ID }))
    expect(res.status).toBe(400)
  })
})
