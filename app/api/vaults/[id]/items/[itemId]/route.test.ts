import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createVault, createVaultItem } from '@/test/helpers/fixtures'
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

describe('PATCH /api/vaults/[id]/items/[itemId]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { ciphertextTitle: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF token', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { ciphertextTitle: 'dGVzdA==', csrfToken: 'bad' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when item belongs to different user vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(null)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/other-item', {
        method: 'PATCH',
        body: { ciphertextTitle: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'other-item' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.vaultItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-item', vault: { id: 'v1', ownerId: 'user-1' } },
    })
  })

  it('returns 400 when no ciphertext fields provided', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    expect(res.status).toBe(400)
  })

  it('updates ciphertextTitle only', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    const updated = createVaultItem({
      id: 'vi-1',
      ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    })
    prismaMock.vaultItem.update.mockResolvedValue(updated)
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { ciphertextTitle: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.id).toBe('vi-1')
    expect(body.data.ciphertextTitle).toBe('dGVzdA==')
    expect(prismaMock.vaultItem.update).toHaveBeenCalledWith({
      where: { id: 'vi-1' },
      data: { ciphertextTitle: Buffer.from('dGVzdA==', 'base64') },
      select: {
        id: true,
        ciphertextTitle: true,
        ciphertextBody: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  })

  it('updates ciphertextBody only', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    const updated = createVaultItem({
      id: 'vi-1',
      ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    })
    prismaMock.vaultItem.update.mockResolvedValue(updated)
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { ciphertextBody: 'Ym9keQ==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.ciphertextBody).toBe('Ym9keQ==')
  })

  it('updates both ciphertextTitle and ciphertextBody', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    const updated = createVaultItem({
      id: 'vi-1',
      ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
      ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    })
    prismaMock.vaultItem.update.mockResolvedValue(updated)
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'Ym9keQ==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.ciphertextTitle).toBe('dGVzdA==')
    expect(body.data.ciphertextBody).toBe('Ym9keQ==')
    expect(prismaMock.vaultItem.update).toHaveBeenCalledWith({
      where: { id: 'vi-1' },
      data: {
        ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
        ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      },
      select: {
        id: true,
        ciphertextTitle: true,
        ciphertextBody: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  })

  it('creates audit log on successful PATCH', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    prismaMock.vaultItem.update.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    prismaMock.auditLog.create.mockResolvedValue({})

    await PATCH(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'PATCH',
        body: { ciphertextTitle: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        actorUsername: 'testuser',
        action: 'vault_item.update',
        targetType: 'vault_item',
        targetId: 'vi-1',
        metadata: expect.any(Object) as unknown,
        ip: null,
      },
    })
  })
})

describe('DELETE /api/vaults/[id]/items/[itemId]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF token', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'DELETE',
        body: { csrfToken: 'bad' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when item belongs to different user vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1/items/other-item', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'other-item' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.vaultItem.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-item', vault: { id: 'v1', ownerId: 'user-1' } },
    })
  })

  it('deletes item and returns 200', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    prismaMock.vaultItem.delete.mockResolvedValue({})
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await DELETE(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.id).toBe('vi-1')
    expect(prismaMock.vaultItem.delete).toHaveBeenCalledWith({ where: { id: 'vi-1' } })
  })

  it('creates audit log on successful DELETE', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vaultItem.findFirst.mockResolvedValue(createVaultItem({ id: 'vi-1' }))
    prismaMock.vaultItem.delete.mockResolvedValue({})
    prismaMock.auditLog.create.mockResolvedValue({})

    await DELETE(
      createNextRequest('http://localhost/api/vaults/v1/items/vi-1', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1', itemId: 'vi-1' }),
    )

    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        actorUsername: 'testuser',
        action: 'vault_item.delete',
        targetType: 'vault_item',
        targetId: 'vi-1',
        metadata: expect.any(Object) as unknown,
        ip: null,
      },
    })
  })
})
