import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createVault } from '@/test/helpers/fixtures'
import { PATCH, DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(), hash: vi.fn() } }))
vi.mock('@/lib/admin-audit', () => ({ writeAuditLog: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import bcrypt from 'bcryptjs'
import { writeAuditLog } from '@/lib/admin-audit'

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

  it('creates an audit log entry on update', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1', label: 'Old' }))
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'Updated',
      passwordHash: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { label: 'Updated', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      actorUsername: 'testuser',
      action: 'vault.update',
      targetType: 'vault',
      targetId: 'v1',
      targetLabel: 'Updated',
      metadata: { changedFields: ['label'], hasPassword: false },
      ip: undefined,
    })
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

  it('updates vault password with valid currentPassword', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1', label: 'Secure' }), passwordHash: '$2a$12$existing_hash' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$new_hash_value' as never)
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'Secure',
      passwordHash: '$2a$12$new_hash_value',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: 'newpass', currentPassword: 'oldpass', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.hasPassword).toBe(true)
    expect(bcrypt.compare).toHaveBeenCalledWith('oldpass', '$2a$12$existing_hash')
    expect(bcrypt.hash).toHaveBeenCalledWith('newpass', 12)
  })

  it('rejects password change with wrong currentPassword', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1' }), passwordHash: '$2a$12$existing_hash' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: 'newpass', currentPassword: 'wrong', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('INVALID_PASSWORD')
  })

  it('rejects password change without currentPassword on protected vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1' }), passwordHash: '$2a$12$existing_hash' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: 'newpass', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('sets first password on unprotected vault', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    vi.mocked(bcrypt.hash).mockResolvedValue('$2a$12$first_hash' as never)
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'Test Vault',
      passwordHash: '$2a$12$first_hash',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: 'newpassword', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.hasPassword).toBe(true)
  })

  it('clears password with valid currentPassword', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1', label: 'Secure' }), passwordHash: '$2a$12$h' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'Secure',
      passwordHash: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: null, currentPassword: 'correct-old-password', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.hasPassword).toBe(false)
    expect(bcrypt.compare).toHaveBeenCalledWith('correct-old-password', '$2a$12$h')
  })

  it('rejects clear password without currentPassword', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1' }), passwordHash: '$2a$12$h' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: null, csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects clear password with wrong currentPassword', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1' }), passwordHash: '$2a$12$h' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    const res = await PATCH(
      createNextRequest('http://localhost/api/vaults/v1', {
        method: 'PATCH',
        body: { password: null, currentPassword: 'wrong', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('INVALID_PASSWORD')
  })

  it('updates label without touching password', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const existingVault = { ...createVault({ id: 'v1', label: 'Old' }), passwordHash: '$2a$12$stays' }
    prismaMock.vault.findFirst.mockResolvedValue(existingVault)
    prismaMock.vault.update.mockResolvedValue({
      id: 'v1',
      label: 'Updated',
      passwordHash: '$2a$12$stays',
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
    expect(body.data.hasPassword).toBe(true)
    expect(prismaMock.vault.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { label: 'Updated' },
      select: { id: true, label: true, passwordHash: true, createdAt: true },
    })
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
      expect(writeAuditLog).toHaveBeenCalledWith({
        actorId: 'user-1',
        actorUsername: 'testuser',
        action: 'vault.delete',
        targetType: 'vault',
        targetId: 'v1',
        targetLabel: 'My Vault',
        ip: undefined,
      })
    })
  })
})
