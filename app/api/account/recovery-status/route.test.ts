import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createUser } from '@/test/helpers/fixtures'
import { GET } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { getAuthUser } from '@/lib/auth'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('GET /api/account/recovery-status', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/account/recovery-status'))
    expect(res.status).toBe(401)
  })

  it('returns recovery key status when user has a recovery key', async () => {
    mockAuth()
    const recoveryDate = new Date('2025-06-01T00:00:00.000Z')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ recoveryCodeCreatedAt: recoveryDate }),
    )
    const res = await GET(createNextRequest('http://localhost/api/account/recovery-status'))
    const body = await res.json()
    expect(body.data).toEqual({
      hasRecoveryKey: true,
      createdAt: recoveryDate.toISOString(),
    })
  })

  it('returns no recovery key when recovery fields are null', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({
        encPrivRec: null as any,
        recKdfSalt: null as any,
        recNonce: null as any,
        recoveryCodeCreatedAt: null,
      }),
    )
    const res = await GET(createNextRequest('http://localhost/api/account/recovery-status'))
    const body = await res.json()
    expect(body.data).toEqual({
      hasRecoveryKey: false,
      createdAt: null,
    })
  })

  it('returns false and null when recovery material is partially missing', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ encPrivRec: null as any, recoveryCodeCreatedAt: null }),
    )
    const res = await GET(createNextRequest('http://localhost/api/account/recovery-status'))
    const body = await res.json()
    expect(body.data).toEqual({
      hasRecoveryKey: false,
      createdAt: null,
    })
  })
})
