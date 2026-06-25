import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createPasskeyCredential } from '@/test/helpers/fixtures'
import { DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { getAuthUser } from '@/lib/auth'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
}

describe('DELETE /api/account/mfa/passkeys/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await DELETE(
      createNextRequest('http://localhost/api/account/mfa/passkeys/cred-1', { method: 'DELETE' }),
      createRouteContext({ id: 'cred-1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when passkey not found', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/account/mfa/passkeys/cred-1', { method: 'DELETE' }),
      createRouteContext({ id: 'cred-1' }),
    )
    expect(res.status).toBe(404)
  })

  it('prevents cross-user deletion', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/account/mfa/passkeys/cred-other', {
        method: 'DELETE',
      }),
      createRouteContext({ id: 'cred-other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.passkeyCredential.findFirst).toHaveBeenCalledWith({
      where: { id: 'cred-other', userId: 'user-1' },
    })
  })

  it('deletes and disables flag when last passkey', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findFirst.mockResolvedValue(
      createPasskeyCredential({ id: 'cred-1' }),
    )
    prismaMock.passkeyCredential.count.mockResolvedValue(0)
    const res = await DELETE(
      createNextRequest('http://localhost/api/account/mfa/passkeys/cred-1', { method: 'DELETE' }),
      createRouteContext({ id: 'cred-1' }),
    )
    expect((await res.json()).data.deleted).toBe(true)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { mfaPasskey: false },
    })
  })

  it('deletes without disabling flag when others remain', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findFirst.mockResolvedValue(
      createPasskeyCredential({ id: 'cred-1' }),
    )
    prismaMock.passkeyCredential.count.mockResolvedValue(2)
    const res = await DELETE(
      createNextRequest('http://localhost/api/account/mfa/passkeys/cred-1', { method: 'DELETE' }),
      createRouteContext({ id: 'cred-1' }),
    )
    expect(res.status).toBe(200)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
