import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createUser } from '@/test/helpers/fixtures'
import { POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/totp', () => ({ generateRecoveryCodes: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { generateRecoveryCodes } from '@/lib/totp'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('POST /api/account/mfa/recovery', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(createNextRequest('http://localhost/api/account/mfa/recovery', { method: 'POST' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when TOTP is not enabled', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(createUser({ mfaTotp: false }))
    const res = await POST(createNextRequest('http://localhost/api/account/mfa/recovery', { method: 'POST' }))
    expect(res.status).toBe(400)
  })

  it('returns plain recovery codes when TOTP is enabled', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(createUser({ mfaTotp: true }))
    vi.mocked(generateRecoveryCodes).mockReturnValue({ plain: ['CODE1'], hashed: ['hash1'] })
    const res = await POST(createNextRequest('http://localhost/api/account/mfa/recovery', { method: 'POST' }))
    const body = await res.json()
    expect(body.data.recoveryCodes).toEqual(['CODE1'])
  })
})
