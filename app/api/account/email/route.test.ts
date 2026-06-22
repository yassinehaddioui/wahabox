import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { createUser } from '@/test/helpers/fixtures'
import { GET, PUT, POST, DELETE, PATCH } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: vi.fn(), checkUserRate: vi.fn(), checkGlobalRate: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendVerificationEmail: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { checkIpRate, checkUserRate, checkGlobalRate } from '@/lib/rate-limit'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('GET /api/account/email', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/account/email'))
    expect(res.status).toBe(401)
  })

  it('returns hasEmail false when no email is set', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(createUser({ emailEncrypted: null, emailNonce: null }))
    const res = await GET(createNextRequest('http://localhost/api/account/email'))
    const body = await res.json()
    expect(body.data.hasEmail).toBe(false)
  })

  it('returns masked email with flags', async () => {
    mockAuth()
    const { encryptEmail } = await import('@/lib/email-crypto')
    const { encrypted, nonce } = encryptEmail('alice@example.com')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ emailEncrypted: Buffer.from(encrypted), emailNonce: Buffer.from(nonce), emailVerified: true }),
    )
    const res = await GET(createNextRequest('http://localhost/api/account/email'))
    const body = await res.json()
    expect(body.data.hasEmail).toBe(true)
    expect(body.data.maskedEmail).toBe('a***e@example.com')
    expect(body.data.maskedEmail).not.toContain('alice')
  })

  it('never returns full email', async () => {
    mockAuth()
    const { encryptEmail } = await import('@/lib/email-crypto')
    const { encrypted, nonce } = encryptEmail('sensitive@domain.com')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ emailEncrypted: Buffer.from(encrypted), emailNonce: Buffer.from(nonce) }),
    )
    const res = await GET(createNextRequest('http://localhost/api/account/email'))
    const body = await res.json()
    expect(body.data.maskedEmail).not.toContain('sensitive')
  })
})

describe('PUT /api/account/email', () => {
  beforeEach(() => { resetPrismaMock(); resetRedisMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await PUT(createNextRequest('http://localhost/api/account/email', { method: 'PUT', body: { email: 'a@b.com', csrfToken: 't' } }))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid email', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    const res = await PUT(createNextRequest('http://localhost/api/account/email', { method: 'PUT', body: { email: 'bad', csrfToken: 't' } }))
    expect(res.status).toBe(400)
  })

  it('returns 429 when IP rate limited', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(true)
    const res = await PUT(createNextRequest('http://localhost/api/account/email', { method: 'PUT', body: { email: 'a@b.com', csrfToken: 't' } }))
    expect(res.status).toBe(429)
  })

  it('returns 400 for invalid CSRF token', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await PUT(createNextRequest('http://localhost/api/account/email', { method: 'PUT', body: { email: 'a@b.com', csrfToken: 'bad' } }))
    expect(res.status).toBe(400)
  })

  it('sends verification and sets cooldown', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.user.update.mockResolvedValue({})
    const res = await PUT(createNextRequest('http://localhost/api/account/email', { method: 'PUT', body: { email: 'alice@example.com', csrfToken: 'valid' } }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prismaMock.user.update).toHaveBeenCalled()
    expect(await redisMock.exists('email-resend-cooldown:user-1')).toBe(1)
  })
})

describe('POST /api/account/email', () => {
  beforeEach(() => { resetPrismaMock(); resetRedisMock(); vi.clearAllMocks() })

  it('returns 400 when no email is set', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.user.findUnique.mockResolvedValue(createUser({ emailEncrypted: null, emailNonce: null }))
    const res = await POST(createNextRequest('http://localhost/api/account/email', { method: 'POST', body: { csrfToken: 't' } }))
    expect(res.status).toBe(400)
  })

  it('resends verification when email exists', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkUserRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const { encryptEmail } = await import('@/lib/email-crypto')
    const { encrypted, nonce } = encryptEmail('alice@example.com')
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ emailEncrypted: Buffer.from(encrypted), emailNonce: Buffer.from(nonce), username: 'testuser' }),
    )
    const res = await POST(createNextRequest('http://localhost/api/account/email', { method: 'POST', body: { csrfToken: 't' } }))
    expect(res.status).toBe(200)
  })
})

describe('DELETE /api/account/email', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await DELETE(createNextRequest('http://localhost/api/account/email', { method: 'DELETE', body: { csrfToken: 'bad' } }))
    expect(res.status).toBe(400)
  })

  it('clears email fields from db', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const res = await DELETE(createNextRequest('http://localhost/api/account/email', { method: 'DELETE', body: { csrfToken: 'valid' } }))
    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailEncrypted: null, emailNonce: null, emailKeyVersion: null, emailVerified: false },
    })
  })
})

describe('PATCH /api/account/email', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await PATCH(createNextRequest('http://localhost/api/account/email', { method: 'PATCH', body: { notificationsEnabled: false, csrfToken: 'bad' } }))
    expect(res.status).toBe(400)
  })

  it('toggles notifications', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const res = await PATCH(createNextRequest('http://localhost/api/account/email', { method: 'PATCH', body: { notificationsEnabled: false, csrfToken: 'valid' } }))
    const body = await res.json()
    expect(body.data.notificationsEnabled).toBe(false)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' }, data: { notificationsEnabled: false },
    })
  })
})
