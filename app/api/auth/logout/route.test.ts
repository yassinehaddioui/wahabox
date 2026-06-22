import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { POST } from './route'

const { mockGetAuthUser, mockClearSessionCookie } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn<(...args: unknown[]) => Promise<{ id: string; username: string }>>(),
  mockClearSessionCookie: vi.fn<(...args: unknown[]) => Promise<void>>(),
}))

vi.mock('@/lib/auth', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@/lib/session', () => ({ clearSessionCookie: mockClearSessionCookie }))

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    mockClearSessionCookie.mockResolvedValue(undefined)
  })

  it('increments tokenVersion for authed user and clears session', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    mockGetAuthUser.mockResolvedValue({ id: 'user-1', username: 'alice' })

    const req = createNextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { tokenVersion: { increment: 1 } },
    })
    expect(mockClearSessionCookie).toHaveBeenCalled()
  })

  it('still clears session and returns success even when unauthed', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.update.mockClear()
    mockGetAuthUser.mockRejectedValue(new Error('No session'))

    const req = createNextRequest('http://localhost/api/auth/logout', {
      method: 'POST',
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(mockClearSessionCookie).toHaveBeenCalled()
  })
})
