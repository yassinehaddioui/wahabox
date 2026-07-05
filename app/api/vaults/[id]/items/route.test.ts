import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createVault, createVaultItem } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(), hash: vi.fn() } }))
vi.mock('@/lib/rate-limit', () => ({ checkUserRate: vi.fn() }))
vi.mock('@/lib/admin-audit', () => ({ writeAuditLog: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import bcrypt from 'bcryptjs'
import { checkUserRate } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/admin-audit'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
}

describe('GET /api/vaults/[id]/items', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items'),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when vault not found or not owned', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue(null)
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/other/items'),
      createRouteContext({ id: 'other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.vault.findFirst).toHaveBeenCalledWith({
      where: { id: 'other', ownerId: 'user-1' },
      select: { id: true, passwordHash: true },
    })
  })

  it('returns empty list when no items', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    prismaMock.vaultItem.findMany.mockResolvedValue([])
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items'),
      createRouteContext({ id: 'v1' }),
    )
    expect((await res.json()).data).toEqual([])
  })

  it('returns items with base64 ciphertexts, ordered by updatedAt desc', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    const older = createVaultItem({
      id: 'vi-1',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const newer = createVaultItem({
      id: 'vi-2',
      createdAt: new Date('2025-01-02T00:00:00.000Z'),
      updatedAt: new Date('2025-01-02T00:00:00.000Z'),
    })
    prismaMock.vaultItem.findMany.mockResolvedValue([newer, older])
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items'),
      createRouteContext({ id: 'v1' }),
    )
    const body = await res.json()
    expect(body.data[0].id).toBe('vi-2')
    expect(body.data[1].id).toBe('vi-1')
    expect(body.data[0].ciphertextTitle).toBe(Buffer.from(newer.ciphertextTitle).toString('base64'))
    expect(body.data[0].ciphertextBody).toBe(Buffer.from(newer.ciphertextBody).toString('base64'))
  })

  it('returns 200 with items when correct X-Vault-Password header is provided', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue({ id: 'v1', passwordHash: '$2a$12$hash' })
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    const item = createVaultItem({ id: 'vi-1' })
    prismaMock.vaultItem.findMany.mockResolvedValue([item])
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        headers: { 'X-Vault-Password': 'correct' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(bcrypt.compare).toHaveBeenCalledWith('correct', '$2a$12$hash')
  })

  it('returns 401 INVALID_PASSWORD when wrong password is provided', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue({ id: 'v1', passwordHash: '$2a$12$hash' })
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        headers: { 'X-Vault-Password': 'wrong' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('INVALID_PASSWORD')
  })

  it('returns 401 when no password header on protected vault', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue({ id: 'v1', passwordHash: '$2a$12$hash' })
    vi.mocked(checkUserRate).mockResolvedValue(false)
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items'),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('INVALID_PASSWORD')
  })

  it('returns 200 on unprotected vault without password header', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    prismaMock.vaultItem.findMany.mockResolvedValue([])
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items'),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(200)
  })

  it('returns 200 on unprotected vault with extraneous password header', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    prismaMock.vaultItem.findMany.mockResolvedValue([])
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        headers: { 'X-Vault-Password': 'ignored' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(200)
  })

  it('returns 429 when rate limited', async () => {
    mockAuth()
    prismaMock.vault.findFirst.mockResolvedValue({ id: 'v1', passwordHash: '$2a$12$hash' })
    vi.mocked(checkUserRate).mockResolvedValue(true)
    const res = await GET(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        headers: { 'X-Vault-Password': 'correct' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(429)
  })
})

describe('POST /api/vaults/[id]/items', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when vault belongs to different user', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(null)
    const res = await POST(
      createNextRequest('http://localhost/api/vaults/other/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.vault.findFirst).toHaveBeenCalledWith({
      where: { id: 'other', ownerId: 'user-1' },
    })
  })

  it('returns 400 for invalid CSRF token', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    const res = await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'dGVzdA==', csrfToken: 'bad' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty ciphertextTitle', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    const res = await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: '', ciphertextBody: 'dGVzdA==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for empty ciphertextBody', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    const res = await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: '', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(400)
  })

  it('creates item with base64-decoded Buffers and returns 201 with full item', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    prismaMock.vaultItem.create.mockResolvedValue({
      id: 'vi-new',
      ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
      ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    })

    const res = await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'Ym9keQ==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.id).toBe('vi-new')
    expect(body.data.ciphertextTitle).toBe('dGVzdA==')
    expect(body.data.ciphertextBody).toBe('Ym9keQ==')
    expect(body.data.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(body.data.updatedAt).toBe('2025-01-01T00:00:00.000Z')
    expect(prismaMock.vaultItem.create).toHaveBeenCalledWith({
      data: {
        vaultId: 'v1',
        ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
        ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      },
      select: { id: true, ciphertextTitle: true, ciphertextBody: true, createdAt: true, updatedAt: true },
    })
  })

  it('allows POST on protected vault without password header', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue({ ...createVault({ id: 'v1' }), passwordHash: '$2a$12$h' })
    prismaMock.vaultItem.create.mockResolvedValue({
      id: 'vi-new',
      ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
      ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const res = await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'Ym9keQ==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )
    expect(res.status).toBe(201)
  })

  it('creates audit log on successful POST', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.findFirst.mockResolvedValue(createVault({ id: 'v1' }))
    prismaMock.vaultItem.create.mockResolvedValue({
      id: 'vi-new',
      ciphertextTitle: Buffer.from('dGVzdA==', 'base64'),
      ciphertextBody: Buffer.from('Ym9keQ==', 'base64'),
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    })

    await POST(
      createNextRequest('http://localhost/api/vaults/v1/items', {
        method: 'POST',
        body: { ciphertextTitle: 'dGVzdA==', ciphertextBody: 'Ym9keQ==', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'v1' }),
    )

    expect(writeAuditLog).toHaveBeenCalledWith({
      actorId: 'user-1',
      actorUsername: 'testuser',
      action: 'vault_item.create',
      targetType: 'vault_item',
      targetId: 'vi-new',
      targetLabel: 'Test Vault',
      ip: undefined,
    })
  })
})
