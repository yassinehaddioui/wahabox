import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { POST } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'

vi.mock('@/lib/rate-limit', () => ({ checkIpRate: vi.fn() }))
vi.mock('@/lib/secure-message-crypto', () => ({
  verifyMessagePassword: vi.fn(),
}))

import { checkIpRate } from '@/lib/rate-limit'
import { verifyMessagePassword } from '@/lib/secure-message-crypto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ID = 'msg-abc-123'
const CIPHERTEXT_BUF = Buffer.alloc(64, 0x77)
const CIPHERTEXT_B64 = CIPHERTEXT_BUF.toString('base64')

const PAST_DATE = new Date('2020-01-01T00:00:00.000Z')
const FUTURE_DATE = new Date('2099-01-01T00:00:00.000Z')

type MessageRow = {
  ciphertext: Buffer | null
  passwordHash: string | null
  startDate: Date | null
  endDate: Date | null
  isDestroyed: boolean
  autoDestruct: boolean
}

function mockMessage(overrides: Partial<MessageRow> = {}): void {
  prismaMock.secureMessage.findUnique.mockResolvedValue({
    ciphertext: CIPHERTEXT_BUF,
    passwordHash: null,
    startDate: null,
    endDate: null,
    isDestroyed: false,
    autoDestruct: false,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// POST /api/secure-messages/[id]/reveal
// ---------------------------------------------------------------------------
describe('POST /api/secure-messages/[id]/reveal', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
    // Defaults: not rate-limited, password valid
    vi.mocked(checkIpRate).mockResolvedValue(false)
    vi.mocked(verifyMessagePassword).mockResolvedValue(true)
  })

  // --- Happy path ----------------------------------------------------------

  it('returns 200 with ciphertext and sets readAt', async () => {
    mockMessage()

    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.ciphertext).toBe(CIPHERTEXT_B64)
    expect(prismaMock.secureMessage.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { readAt: expect.any(Date) },
    })
  })

  it('passes correct id to findUnique', async () => {
    mockMessage()
    await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(prismaMock.secureMessage.findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: expect.objectContaining({
        ciphertext: true,
        passwordHash: true,
        startDate: true,
        endDate: true,
        isDestroyed: true,
        autoDestruct: true,
      }),
    })
  })

  // --- Not found / destroyed -----------------------------------------------

  it('returns 404 when message does not exist', async () => {
    prismaMock.secureMessage.findUnique.mockResolvedValue(null)
    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/missing/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: 'missing' }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when message has been destroyed', async () => {
    mockMessage({ isDestroyed: true })
    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(404)
  })

  // --- Date window ---------------------------------------------------------

  it('returns 403 when accessed before startDate', async () => {
    mockMessage({ startDate: FUTURE_DATE })
    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(403)
  })

  it('returns 403 when accessed after endDate', async () => {
    mockMessage({ endDate: PAST_DATE })
    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(403)
  })

  // --- Password ------------------------------------------------------------

  it('returns 401 with INVALID_PASSWORD when password is wrong and does NOT set readAt', async () => {
    mockMessage({ passwordHash: '$2a$12$hash' })
    vi.mocked(verifyMessagePassword).mockResolvedValue(false)

    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: { password: 'wrong' },
      }),
      createRouteContext({ id: ID }),
    )
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.code).toBe('INVALID_PASSWORD')
    // readAt must NOT be set
    expect(prismaMock.secureMessage.update).not.toHaveBeenCalled()
  })

  it('returns 200 when correct password is provided', async () => {
    mockMessage({ passwordHash: '$2a$12$hash' })
    vi.mocked(verifyMessagePassword).mockResolvedValue(true)

    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: { password: 'correct' },
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(200)
    expect(verifyMessagePassword).toHaveBeenCalledWith('correct', '$2a$12$hash')
    expect(prismaMock.secureMessage.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { readAt: expect.any(Date) },
    })
  })

  it('returns 401 when password is required but not provided', async () => {
    mockMessage({ passwordHash: '$2a$12$hash' })

    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(401)
  })

  // --- Auto-destruct -------------------------------------------------------

  it('auto-destruct: first reveal returns ciphertext and destroys, second returns 404', async () => {
    // First call — message alive with autoDestruct
    mockMessage({ autoDestruct: true })
    prismaMock.secureMessage.update.mockResolvedValue({})

    const res1 = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    const body1 = await res1.json()

    expect(res1.status).toBe(200)
    expect(body1.data.ciphertext).toBe(CIPHERTEXT_B64)
    expect(prismaMock.secureMessage.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { readAt: expect.any(Date), isDestroyed: true, ciphertext: null },
    })

    // Second call — now destroyed
    mockMessage({ isDestroyed: true })

    const res2 = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(res2.status).toBe(404)
  })

  // --- Rate limit ----------------------------------------------------------

  it('returns 429 when rate limit is exceeded', async () => {
    vi.mocked(checkIpRate).mockResolvedValue(true)

    const res = await POST(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/reveal`, {
        method: 'POST',
        body: {},
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(429)
    // findUnique must NOT be called when rate-limited
    expect(prismaMock.secureMessage.findUnique).not.toHaveBeenCalled()
  })
})
