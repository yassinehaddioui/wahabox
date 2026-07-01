import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createVault } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
}

describe('GET /api/vaults', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/vaults'))
    expect(res.status).toBe(401)
  })

  it('returns empty list when no vaults exist', async () => {
    mockAuth()
    prismaMock.vault.findMany.mockResolvedValue([])
    const res = await GET(createNextRequest('http://localhost/api/vaults'))
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns vaults with itemCount and timestamps', async () => {
    mockAuth()
    const vault = createVault({ id: 'vault-1', label: 'My Vault' })
    const row = {
      ...vault,
      _count: { items: 3 },
      items: [{ updatedAt: new Date('2025-06-15T00:00:00.000Z') }],
    }
    prismaMock.vault.findMany.mockResolvedValue([row])
    const res = await GET(createNextRequest('http://localhost/api/vaults'))
    const body = await res.json()
    expect(body.data[0]).toEqual({
      id: 'vault-1',
      label: 'My Vault',
      itemCount: 3,
      createdAt: vault.createdAt.toISOString(),
      updatedAt: '2025-06-15T00:00:00.000Z',
    })
  })

  it('falls back updatedAt to createdAt when no items', async () => {
    mockAuth()
    const vault = createVault({ id: 'vault-2', createdAt: new Date('2025-03-01T00:00:00.000Z') })
    const row = {
      ...vault,
      _count: { items: 0 },
      items: [],
    }
    prismaMock.vault.findMany.mockResolvedValue([row])
    const res = await GET(createNextRequest('http://localhost/api/vaults'))
    const body = await res.json()
    expect(body.data[0].updatedAt).toBe('2025-03-01T00:00:00.000Z')
  })
})

describe('POST /api/vaults', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(
      createNextRequest('http://localhost/api/vaults', {
        method: 'POST',
        body: { label: 'Vault' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await POST(
      createNextRequest('http://localhost/api/vaults', {
        method: 'POST',
        body: { label: 'Vault', csrfToken: 'bad' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('creates a vault with label', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.create.mockResolvedValue({
      id: 'vault-1',
      label: 'My Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    const res = await POST(
      createNextRequest('http://localhost/api/vaults', {
        method: 'POST',
        body: { label: 'My Vault', csrfToken: 'valid' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.id).toBe('vault-1')
    expect(body.data.label).toBe('My Vault')
    expect(body.data.createdAt).toBe('2025-01-01T00:00:00.000Z')
  })

  it('checks CSRF with create-vault tag', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.create.mockResolvedValue({
      id: 'v',
      label: 'L',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    await POST(
      createNextRequest('http://localhost/api/vaults', {
        method: 'POST',
        body: { label: 'L', csrfToken: 't' },
      }),
    )
    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith('create-vault', 't')
  })

  it('creates an audit log entry on create', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.vault.create.mockResolvedValue({
      id: 'vault-1',
      label: 'My Vault',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
    })
    POST(
      createNextRequest('http://localhost/api/vaults', {
        method: 'POST',
        body: { label: 'My Vault', csrfToken: 'valid' },
      }),
    )
    // Fire-and-forget audit log — wait for microtask flush
    await vi.waitFor(() => {
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'user-1',
          actorUsername: 'testuser',
          action: 'vault.create',
          targetType: 'vault',
          targetId: 'vault-1',
          targetLabel: 'My Vault',
          metadata: expect.any(Object) as unknown,
          ip: null,
        },
      })
    })
  })
})
