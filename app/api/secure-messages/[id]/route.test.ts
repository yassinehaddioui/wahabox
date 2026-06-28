import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { GET } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'

// ---------------------------------------------------------------------------
// GET /api/secure-messages/[id]  (public — no auth)
// ---------------------------------------------------------------------------
describe('GET /api/secure-messages/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  const ID = 'msg-abc-123'

  function mockMessage(overrides: Record<string, unknown> = {}) {
    prismaMock.secureMessage.findUnique.mockResolvedValue({
      msgNonce: Buffer.from('bm9uY2U=', 'base64'),
      passwordHash: null,
      passwordSalt: null,
      startDate: null,
      endDate: null,
      isDestroyed: false,
      autoDestruct: false,
      readAt: null,
      ...overrides,
    })
  }

  it('returns 200 with metadata for a valid message', async () => {
    mockMessage()
    const res = await GET(
      createNextRequest(`http://localhost/api/secure-messages/${ID}`),
      createRouteContext({ id: ID }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      hasPassword: false,
      passwordSalt: null,
      msgNonce: 'bm9uY2U=',
      startDate: null,
      endDate: null,
      isDestroyed: false,
      autoDestruct: false,
      readAt: null,
    })
  })

  it('returns 200 with hasPassword = true when password is set', async () => {
    const SALT = Buffer.from('c2FsdA==', 'base64')
    mockMessage({
      passwordHash: '$2a$12$hash',
      passwordSalt: SALT,
    })
    const res = await GET(
      createNextRequest(`http://localhost/api/secure-messages/${ID}`),
      createRouteContext({ id: ID }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.hasPassword).toBe(true)
    expect(body.data.passwordSalt).toBe('c2FsdA==')
  })

  it('returns 404 for a non-existent message', async () => {
    prismaMock.secureMessage.findUnique.mockResolvedValue(null)
    const res = await GET(
      createNextRequest(`http://localhost/api/secure-messages/nope`),
      createRouteContext({ id: 'nope' }),
    )
    expect(res.status).toBe(404)
  })

  it('returns 404 when the message has been destroyed', async () => {
    mockMessage({ isDestroyed: true })
    const res = await GET(
      createNextRequest(`http://localhost/api/secure-messages/${ID}`),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(404)
  })

  it('passes the correct id to prisma', async () => {
    mockMessage()
    await GET(
      createNextRequest(`http://localhost/api/secure-messages/${ID}`),
      createRouteContext({ id: ID }),
    )
    expect(prismaMock.secureMessage.findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: expect.objectContaining({
        msgNonce: true,
        passwordHash: true,
        passwordSalt: true,
        startDate: true,
        endDate: true,
        isDestroyed: true,
        autoDestruct: true,
        readAt: true,
      }),
    })
  })
})
