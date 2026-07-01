import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createVault } from '@/test/helpers/fixtures'
import { PATCH, DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
}

describe('PATCH /api/vaults/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', { method: 'PATCH', body: {} }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { csrfToken: 'bad' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('enforces ownership returns 404 for another user vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(null)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/other', {
        method: 'PATCH',
        body: { label: 'Hijacked', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.vault.findFirst).toHaveBeenCalledWith({
      where: { id: 'other', ownerId: 'user-1' },
    })
  })

  it('updates vault label', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1', label: 'Old' }))
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'Updated',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { label: 'Updated', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.label).toBe('Updated')
  })

  it('checks CSRF with edit-vault tag', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'L',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { label: 'L', csrfToken: 't' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith('edit-vault', 't')
  })
})

describe('DELETE /api/vaults/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1', { method: 'DELETE', body: {} }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'DELETE',
        body: { csrfToken: 'bad' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('enforces ownership returns 404 for another user vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/other', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'other' }),
    )
    expect(res.status).toBe(404)
  })

  it('deletes owned vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(
      createVault({ id: 'v1', label: 'My Vault' }),
    )
    prismaMock.vault.delete.mockResolvedValue({})
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect((await res.json()).data.id).toBe('v1')
    expect(prismaMock.vault.delete).toHaveBeenCalledWith({ where: { id: 'v1' } })
  })

  it('checks CSRF with delete-vault tag', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(
      createVault({ id: 'v1', label: 'My Vault' }),
    )
    prismaMock.vault.delete.mockResolvedValue({})
    await DELETE(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'DELETE',
        body: { csrfToken: 't' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith('delete-vault', 't')
  })

  it('creates an audit log entry on delete', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(
      createVault({ id: 'v1', label: 'My Vault' }),
    )
    prismaMock.vault.delete.mockResolvedValue({})
    // Don't await — fire-and-forget
    DELETE(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    await vi.waitFor(() => {
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          actorUsername: 'testuser',
          action: 'vault.delete',
          targetType: 'vault',
          targetId: 'v1',
          targetLabel: 'My Vault',
          metadata: expect.any(Object) as unknown,
          ip: null,
        },
      })
    })
  })
})
