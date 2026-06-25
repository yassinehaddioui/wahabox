import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createUser } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))
vi.mock('@/lib/session', () => ({ clearSessionCookie: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: vi.fn(), checkGlobalRate: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { clearSessionCookie } from '@/lib/session'
import { checkIpRate, checkGlobalRate } from '@/lib/rate-limit'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
}

describe('GET /api/account/password', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/account/password'))
    expect(res.status).toBe(401)
  })

  it('returns auth salts and wrapped private key for authenticated user', async () => {
    mockAuth()
    const user = createUser()
    prismaMock.user.findUnique.mockResolvedValue(user)
    const res = await GET(createNextRequest('http://localhost/api/account/password'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.authSalt).toBe(user.authSalt.toString('base64'))
    expect(body.data.pwKdfSalt).toBe(user.pwKdfSalt.toString('base64'))
    expect(body.data.encPrivPw).toBe(user.encPrivPw.toString('base64'))
    expect(body.data.pwNonce).toBe(user.pwNonce.toString('base64'))
  })

  it('returns 401 when user not found', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(null)
    const res = await GET(createNextRequest('http://localhost/api/account/password'))
    expect(res.status).toBe(401)
  })
})

describe('POST /api/account/password', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  const validBody = {
    currentAuthVerifier: Buffer.alloc(32, 0xaa).toString('base64'),
    newAuthVerifier: Buffer.alloc(32, 0xbb).toString('base64'),
    newAuthSalt: Buffer.alloc(16, 0xcc).toString('base64'),
    newEncPrivPw: Buffer.alloc(48, 0xdd).toString('base64'),
    newPwKdfSalt: Buffer.alloc(16, 0xee).toString('base64'),
    newPwNonce: Buffer.alloc(24, 0xff).toString('base64'),
    csrfToken: 'valid-csrf',
  }

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(
      createNextRequest('http://localhost/api/account/password', {
        method: 'POST',
        body: validBody,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limited', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(true)
    const res = await POST(
      createNextRequest('http://localhost/api/account/password', {
        method: 'POST',
        body: validBody,
      }),
    )
    expect(res.status).toBe(429)
  })

  it('returns 400 for invalid CSRF token', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await POST(
      createNextRequest('http://localhost/api/account/password', {
        method: 'POST',
        body: validBody,
      }),
    )
    expect(res.status).toBe(400)
    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith('password-change', 'valid-csrf')
  })

  it('returns 400 for missing required fields', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const res = await POST(
      createNextRequest('http://localhost/api/account/password', {
        method: 'POST',
        body: { csrfToken: 't' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 401 when current verifier does not match', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ authVerifier: Buffer.alloc(32, 0xff) }),
    )
    const res = await POST(
      createNextRequest('http://localhost/api/account/password', {
        method: 'POST',
        body: validBody,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('updates password, bumps tokenVersion, clears cookie on success', async () => {
    mockAuth()
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(checkGlobalRate).mockResolvedValue(false)
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.user.findUnique.mockResolvedValue(createUser())
    prismaMock.user.update.mockResolvedValue({})
    const res = await POST(
      createNextRequest('http://localhost/api/account/password', {
        method: 'POST',
        body: validBody,
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        authVerifier: expect.any(Buffer),
        authSalt: expect.any(Buffer),
        encPrivPw: expect.any(Buffer),
        pwKdfSalt: expect.any(Buffer),
        pwNonce: expect.any(Buffer),
        tokenVersion: { increment: 1 },
      },
    })
    expect(clearSessionCookie).toHaveBeenCalled()
  })
})
