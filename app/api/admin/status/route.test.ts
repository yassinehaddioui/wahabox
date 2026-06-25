import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'
import { GET } from './route'

const { mockGetAuthUser, mockCheckIpRate } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn<
    (...args: unknown[]) => Promise<{ id: string; username: string; role: string }>
  >(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}))

vi.mock('@/lib/auth', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate }))

describe('GET /api/admin/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckIpRate.mockResolvedValue(false)
  })

  it('returns isAdmin=true for admin user', async () => {
    mockGetAuthUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })

    const req = createNextRequest('http://localhost/api/admin/status')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.isAdmin).toBe(true)
  })

  it('returns isAdmin=false for non-admin user', async () => {
    mockGetAuthUser.mockResolvedValue({ id: '2', username: 'user', role: 'user' })

    const req = createNextRequest('http://localhost/api/admin/status')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.isAdmin).toBe(false)
  })

  it('returns 401 for unauthenticated request', async () => {
    mockGetAuthUser.mockRejectedValue(new UnauthorizedError())

    const req = createNextRequest('http://localhost/api/admin/status')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('gracefully returns isAdmin=false when rate limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)
    // Even an admin user gets isAdmin=false when rate limited
    mockGetAuthUser.mockResolvedValue({ id: '1', username: 'admin', role: 'admin' })

    const req = createNextRequest('http://localhost/api/admin/status')
    const res = await GET(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.isAdmin).toBe(false)
  })
})
