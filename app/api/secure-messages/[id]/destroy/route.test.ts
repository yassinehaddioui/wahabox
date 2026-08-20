import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'

vi.mock('@/lib/rate-limit', () => ({ checkIpRate: vi.fn() }))

import { checkIpRate } from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const ID = 'msg-abc-123'

type MessageRow = {
  isDestroyed: boolean
  allowReaderDelete: boolean
}

function mockMessage(overrides: Partial<MessageRow> = {}): void {
  prismaMock.secureMessage.findUnique.mockResolvedValue({
    isDestroyed: false,
    allowReaderDelete: true,
    ...overrides,
  })
}

// ---------------------------------------------------------------------------
// DELETE /api/secure-messages/[id]/destroy  (public — reader destroy)
// ---------------------------------------------------------------------------
describe('DELETE /api/secure-messages/[id]/destroy', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
    // Defaults: not rate-limited
    vi.mocked(checkIpRate).mockResolvedValue(false)
  })

  // --- Happy path ----------------------------------------------------------

  it('destroys the message and writes a secure_message.reader_destroy audit log', async () => {
    mockMessage()
    prismaMock.secureMessage.update.mockResolvedValue({ id: ID })
    prismaMock.auditLog.create.mockResolvedValue({})

    const res = await DELETE(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/destroy`, {
        method: 'DELETE',
      }),
      createRouteContext({ id: ID }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.id).toBe(ID)

    expect(prismaMock.secureMessage.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { isDestroyed: true, ciphertext: null },
    })

    // audit: secure_message.reader_destroy with system actor
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'secure_message.reader_destroy',
          actorId: null,
          actorUsername: 'system',
          targetType: 'secure_message',
          targetId: ID,
        }),
      }),
    )
  })

  it('passes correct id to findUnique', async () => {
    mockMessage()
    prismaMock.secureMessage.update.mockResolvedValue({ id: ID })

    await DELETE(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/destroy`, {
        method: 'DELETE',
      }),
      createRouteContext({ id: ID }),
    )
    expect(prismaMock.secureMessage.findUnique).toHaveBeenCalledWith({
      where: { id: ID },
      select: expect.objectContaining({
        isDestroyed: true,
        allowReaderDelete: true,
      }),
    })
  })

  // --- Not found / not eligible --------------------------------------------

  it('returns 404 when message does not exist and does NOT write audit', async () => {
    prismaMock.secureMessage.findUnique.mockResolvedValue(null)

    const res = await DELETE(
      createNextRequest(`http://localhost/api/secure-messages/missing/destroy`, {
        method: 'DELETE',
      }),
      createRouteContext({ id: 'missing' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.secureMessage.update).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('returns 404 when message has been destroyed', async () => {
    mockMessage({ isDestroyed: true })

    const res = await DELETE(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/destroy`, {
        method: 'DELETE',
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.secureMessage.update).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('returns 404 when reader delete is not allowed', async () => {
    mockMessage({ allowReaderDelete: false })

    const res = await DELETE(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/destroy`, {
        method: 'DELETE',
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.secureMessage.update).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  // --- Rate limit ----------------------------------------------------------

  it('returns 429 when rate limit is exceeded and does NOT call findUnique', async () => {
    vi.mocked(checkIpRate).mockResolvedValue(true)

    const res = await DELETE(
      createNextRequest(`http://localhost/api/secure-messages/${ID}/destroy`, {
        method: 'DELETE',
      }),
      createRouteContext({ id: ID }),
    )
    expect(res.status).toBe(429)
    expect(prismaMock.secureMessage.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.secureMessage.update).not.toHaveBeenCalled()
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })
})