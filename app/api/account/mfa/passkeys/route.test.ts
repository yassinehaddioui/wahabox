import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createPasskeyCredential } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/webauthn', () => ({ generateRegOptions: vi.fn(), verifyRegResponse: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { generateRegOptions, verifyRegResponse } from '@/lib/webauthn'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('GET /api/account/mfa/passkeys', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/account/mfa/passkeys'))
    expect(res.status).toBe(401)
  })

  it('returns empty list when no passkeys', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findMany.mockResolvedValue([])
    const res = await GET(createNextRequest('http://localhost/api/account/mfa/passkeys'))
    expect(res.status).toBe(200)
    expect((await res.json()).data).toEqual([])
  })

  it('returns list of passkeys', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findMany.mockResolvedValue([
      createPasskeyCredential({ id: 'cred-1', deviceName: 'My Key' }),
      createPasskeyCredential({ id: 'cred-2', deviceName: 'Backup' }),
    ])
    const res = await GET(createNextRequest('http://localhost/api/account/mfa/passkeys'))
    const body = await res.json()
    expect(body.data).toHaveLength(2)
    expect(body.data[0].deviceName).toBe('My Key')
  })
})

describe('POST /api/account/mfa/passkeys', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(
      createNextRequest('http://localhost/api/account/mfa/passkeys', { method: 'POST' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns registration options for setup', async () => {
    mockAuth()
    prismaMock.passkeyCredential.findMany.mockResolvedValue([])
    vi.mocked(generateRegOptions).mockResolvedValue({
      challenge: 'x',
      rp: { name: 'Wahabox' },
    } as never)
    const res = await POST(
      createNextRequest('http://localhost/api/account/mfa/passkeys', { method: 'POST', body: {} }),
    )
    expect(res.status).toBe(200)
  })

  it('returns 400 when attestation missing for confirm', async () => {
    mockAuth()
    const res = await POST(
      createNextRequest('http://localhost/api/account/mfa/passkeys', {
        method: 'POST',
        body: { action: 'confirm' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('registers a new passkey', async () => {
    mockAuth()
    vi.mocked(verifyRegResponse).mockResolvedValue({
      credentialId: new Uint8Array([1]),
      publicKey: new Uint8Array([2]),
      counter: 0,
      transports: undefined as never,
    })
    const res = await POST(
      createNextRequest('http://localhost/api/account/mfa/passkeys', {
        method: 'POST',
        body: { action: 'confirm', attestation: { id: 'cred' } },
      }),
    )
    const body = await res.json()
    expect(body.data.registered).toBe(true)
    expect(body.data.deviceName).toBe('Unknown device')
    expect(prismaMock.passkeyCredential.create).toHaveBeenCalled()
  })

  it('returns 400 for unknown action', async () => {
    mockAuth()
    const res = await POST(
      createNextRequest('http://localhost/api/account/mfa/passkeys', {
        method: 'POST',
        body: { action: 'invalid' },
      }),
    )
    expect(res.status).toBe(400)
  })
})
