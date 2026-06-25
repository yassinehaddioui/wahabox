import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { resetRedisMock } from '@/test/helpers/redis-mock'
import { UnauthorizedError } from '@/lib/errors'
import { POST } from './route'

// Hoisted mocks — must be before vi.mock calls
const { mockGetAuthUser, mockVerifyCsrf, mockCheckIpRate, mockCheckUserRate, mockCheckGlobalRate } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn<(...args: unknown[]) => Promise<{ id: string; username: string; role: string }>>(),
  mockVerifyCsrf: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckUserRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckGlobalRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}))

vi.mock('@/lib/auth', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/rate-limit', () => ({
  checkIpRate: mockCheckIpRate,
  checkUserRate: mockCheckUserRate,
  checkGlobalRate: mockCheckGlobalRate,
}))

const ORIGINAL_TOKEN = process.env.ADMIN_PROMOTE_TOKEN

describe('POST /api/admin/promote', () => {
  beforeEach(() => {
    resetPrismaMock()
    resetRedisMock()
    process.env.ADMIN_PROMOTE_TOKEN = 'test-token'
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
    mockVerifyCsrf.mockResolvedValue(true)
    mockCheckIpRate.mockResolvedValue(false)
    mockCheckUserRate.mockResolvedValue(false)
    mockCheckGlobalRate.mockResolvedValue(false)
    prismaMock.user.findUnique.mockResolvedValue({ role: 'user' })
    prismaMock.user.update.mockResolvedValue({ id: 'user-1', role: 'admin' })
  })

  afterAll(() => {
    process.env.ADMIN_PROMOTE_TOKEN = ORIGINAL_TOKEN
  })

  // Test 1: Successful promotion
  it('promotes user to admin with valid token', async () => {
    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.message).toBe('You are now an admin')
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: 'admin' },
    })
  })

  // Test 2: Already admin
  it('returns alreadyAdmin when user is already admin', async () => {
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', username: 'admin', role: 'admin' })
    prismaMock.user.findUnique.mockResolvedValue({ role: 'admin' })

    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.alreadyAdmin).toBe(true)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  // Test 3: Wrong token
  it('rejects wrong token', async () => {
    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'wrong-token', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid token')
  })

  // Test 4: No session
  it('returns 401 for unauthenticated request', async () => {
    mockGetAuthUser.mockRejectedValue(new UnauthorizedError())

    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'valid-csrf' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  // Test 5: Env token unset
  it('returns 501 when ADMIN_PROMOTE_TOKEN is not configured', async () => {
    delete process.env.ADMIN_PROMOTE_TOKEN

    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(501)
    expect(body.error).toBe('Admin promotion is not configured')
  })

  // Test 6: Rate limited
  it('returns 429 when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  // Test 7: Invalid CSRF
  it('rejects invalid CSRF token', async () => {
    mockVerifyCsrf.mockResolvedValue(false)

    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'invalid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Invalid CSRF token')
  })

  // Test 8: Missing token in body
  it('rejects missing token', async () => {
    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  // Test 9: Missing csrfToken in body
  it('rejects missing CSRF token', async () => {
    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  // Test 10: Self-promotion only — verifies where clause uses caller's id
  it('promotes only the authenticated user', async () => {
    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'test-token', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    await POST(req)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { role: 'admin' },
    })
  })

  // Test 11: Timing-safe comparison — token with different length
  it('rejects token with different length', async () => {
    const req = createNextRequest('http://localhost/api/admin/promote', {
      method: 'POST',
      body: { token: 'short', csrfToken: 'valid-csrf' },
      cookies: { session: 'valid' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Invalid token')
  })
})
