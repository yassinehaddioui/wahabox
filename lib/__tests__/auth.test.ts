import { describe, it, expect, vi } from 'vitest'
import { getAuthUser } from '@/lib/auth'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/session', () => ({
  validateSession: vi.fn(),
}))

import { validateSession } from '@/lib/session'

describe('getAuthUser', () => {
  it('returns the user when a valid session cookie is present', async () => {
    vi.mocked(validateSession).mockResolvedValue({
      userId: 'user-1',
      username: 'alice',
      tokenVersion: 1,
      createdAt: Date.now(),
      role: 'user',
    })

    const req = createNextRequest('http://localhost/api/test', {
      cookies: { session: 'valid-token' },
    })

    const user = await getAuthUser(req)
    expect(user).toEqual({ id: 'user-1', username: 'alice', role: 'user' })
  })

  it('throws UnauthorizedError when no session cookie exists', async () => {
    const req = createNextRequest('http://localhost/api/test')
    await expect(getAuthUser(req)).rejects.toThrow(UnauthorizedError)
  })

  it('throws UnauthorizedError when validateSession returns undefined', async () => {
    vi.mocked(validateSession).mockResolvedValue(undefined)

    const req = createNextRequest('http://localhost/api/test', {
      cookies: { session: 'invalid-token' },
    })

    await expect(getAuthUser(req)).rejects.toThrow(UnauthorizedError)
  })
})
