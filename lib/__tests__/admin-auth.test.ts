import { describe, it, expect, vi } from 'vitest'
import { getAdminUser } from '@/lib/auth'
import { createNextRequest } from '@/test/helpers/request'
import { ForbiddenError, UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/session', () => ({
  validateSession: vi.fn(),
}))

import { validateSession } from '@/lib/session'

describe('ForbiddenError', () => {
  it('has status 403, code FORBIDDEN, and default message', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
    expect(err.message).toBe('Forbidden')
    expect(err.name).toBe('ForbiddenError')
  })
})

describe('getAdminUser', () => {
  it('returns AuthUser when role is admin', async () => {
    vi.mocked(validateSession).mockResolvedValue({
      userId: 'admin-1',
      username: 'admin',
      tokenVersion: 1,
      createdAt: Date.now(),
      role: 'admin',
    })

    const req = createNextRequest('http://localhost/api/admin/test', {
      cookies: { session: 'admin-token' },
    })

    const user = await getAdminUser(req)
    expect(user).toEqual({ id: 'admin-1', username: 'admin', role: 'admin' })
  })

  it('throws ForbiddenError when role is not admin', async () => {
    vi.mocked(validateSession).mockResolvedValue({
      userId: 'user-1',
      username: 'alice',
      tokenVersion: 1,
      createdAt: Date.now(),
      role: 'user',
    })

    const req = createNextRequest('http://localhost/api/admin/test', {
      cookies: { session: 'user-token' },
    })

    await expect(getAdminUser(req)).rejects.toThrow(ForbiddenError)
    await expect(getAdminUser(req)).rejects.toThrow('Admin access required')
  })

  it('propagates UnauthorizedError when session is invalid', async () => {
    vi.mocked(validateSession).mockResolvedValue(undefined)

    const req = createNextRequest('http://localhost/api/admin/test', {
      cookies: { session: 'bad-token' },
    })

    await expect(getAdminUser(req)).rejects.toThrow(UnauthorizedError)
  })
})
