import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { GET, POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn() } }))
vi.mock('@/lib/email', () => ({
  sendSecureMessageNotification: vi.fn(),
}))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({
    id: 'user-1',
    username: 'testuser',
    role: 'user',
  })
}

const FIXED_DATE = new Date('2025-01-01T00:00:00.000Z')

// ---------------------------------------------------------------------------
// POST /api/secure-messages
// ---------------------------------------------------------------------------
describe('POST /api/secure-messages', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(
      createNextRequest('http://localhost/api/secure-messages', {
        method: 'POST',
        body: {
          ciphertext: 'dGVzdA==',
          msgNonce: 'bm9uY2U=',
          urlFragment: 'frag',
          autoDestruct: false,
          csrfToken: 'valid',
        },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 when ciphertext is missing', async () => {
    mockAuth()
    const res = await POST(
      createNextRequest('http://localhost/api/secure-messages', {
        method: 'POST',
        body: {
          msgNonce: 'bm9uY2U=',
          urlFragment: 'frag',
          autoDestruct: false,
          csrfToken: 'valid',
        },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when decoded ciphertext exceeds 100KB', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    // ~137 KB base64 decodes to > 100 KB
    const hugeBase64 = Buffer.alloc(105 * 1024, 0x01).toString('base64')
    const res = await POST(
      createNextRequest('http://localhost/api/secure-messages', {
        method: 'POST',
        body: {
          ciphertext: hugeBase64,
          msgNonce: 'bm9uY2U=',
          urlFragment: 'frag',
          autoDestruct: false,
          csrfToken: 'valid',
        },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when CSRF token is missing or invalid', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await POST(
      createNextRequest('http://localhost/api/secure-messages', {
        method: 'POST',
        body: {
          ciphertext: 'dGVzdA==',
          msgNonce: 'bm9uY2U=',
          urlFragment: 'frag',
          autoDestruct: false,
          csrfToken: null,
        },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('creates a message and returns 201 with id and readUrl', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.secureMessage.create.mockResolvedValue({ id: 'msg-1' })

    const res = await POST(
      createNextRequest('http://localhost/api/secure-messages', {
        method: 'POST',
        body: {
          ciphertext: 'dGVzdA==',
          msgNonce: 'bm9uY2U=',
          urlFragment: 'abc123',
          autoDestruct: false,
          csrfToken: 'valid',
        },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.id).toBe('msg-1')
    expect(body.data.readUrl).toBe(`${process.env.APP_URL}/read/msg-1#abc123`)
  })

  it('verifies CSRF with create-secure-message tag', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.secureMessage.create.mockResolvedValue({ id: 'msg-1' })

    await POST(
      createNextRequest('http://localhost/api/secure-messages', {
        method: 'POST',
        body: {
          ciphertext: 'dGVzdA==',
          msgNonce: 'bm9uY2U=',
          urlFragment: 'f',
          autoDestruct: false,
          csrfToken: 'my-token',
        },
      }),
    )

    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith(
      'create-secure-message',
      'my-token',
    )
  })
})

// ---------------------------------------------------------------------------
// GET /api/secure-messages
// ---------------------------------------------------------------------------
describe('GET /api/secure-messages', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/secure-messages'))
    expect(res.status).toBe(401)
  })

  it('returns an empty array for a user with no messages', async () => {
    mockAuth()
    prismaMock.secureMessage.findMany.mockResolvedValue([])
    const res = await GET(createNextRequest('http://localhost/api/secure-messages'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toEqual([])
  })

  it('returns messages with correct shape (no receiver email)', async () => {
    mockAuth()
    prismaMock.secureMessage.findMany.mockResolvedValue([
      {
        id: 'msg-1',
        createdAt: FIXED_DATE,
        readAt: null,
        isDestroyed: false,
        autoDestruct: false,
        passwordHash: null,
        receiverEmail: null,
        emailNonce: null,
        emailKeyVersion: null,
      },
    ])
    const res = await GET(createNextRequest('http://localhost/api/secure-messages'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].id).toBe('msg-1')
    expect(body.data[0].hasPassword).toBe(false)
    expect(body.data[0].isDestroyed).toBe(false)
    expect(body.data[0].createdAt).toBe(FIXED_DATE.toISOString())
    expect(body.data[0].readAt).toBeNull()
  })

  it('exposes hasPassword true when password is set', async () => {
    mockAuth()
    prismaMock.secureMessage.findMany.mockResolvedValue([
      {
        id: 'msg-2',
        createdAt: FIXED_DATE,
        readAt: FIXED_DATE,
        isDestroyed: false,
        autoDestruct: true,
        passwordHash: '$2a$12$hash',
        receiverEmail: null,
        emailNonce: null,
        emailKeyVersion: null,
      },
    ])
    const res = await GET(createNextRequest('http://localhost/api/secure-messages'))
    const body = await res.json()
    expect(body.data[0].hasPassword).toBe(true)
    expect(body.data[0].autoDestruct).toBe(true)
    expect(body.data[0].readAt).toBe(FIXED_DATE.toISOString())
  })
})
