import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { PATCH, DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { getAuthUser } from '@/lib/auth'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser', role: 'user' })
}

describe('PATCH /api/messages/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await PATCH(
      createNextRequest('http://localhost/api/messages/m1', { method: 'PATCH' }),
      createRouteContext({ id: 'm1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 404 when message not found', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await PATCH(
      createNextRequest('http://localhost/api/messages/m1', { method: 'PATCH' }),
      createRouteContext({ id: 'm1' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('enforces ownership via poBox ownerId', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await PATCH(
      createNextRequest('http://localhost/api/messages/m-other', { method: 'PATCH' }),
      createRouteContext({ id: 'm-other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.message.findFirst).toHaveBeenCalledWith({
      where: { id: 'm-other', poBox: { ownerId: 'user-1' } },
      select: { id: true, poBox: { select: { label: true } } },
    })
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('marks message as read and audits message.read', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue({ id: 'm1', poBox: { label: 'My Box' } })
    const res = await PATCH(
      createNextRequest('http://localhost/api/messages/m1', { method: 'PATCH' }),
      createRouteContext({ id: 'm1' }),
    )
    expect((await res.json()).data.id).toBe('m1')
    expect(prismaMock.message.update).toHaveBeenCalledWith({
      where: { id: 'm1', readAt: null },
      data: { readAt: expect.any(Date) },
    })
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'message.read',
        actorId: 'user-1',
        actorUsername: 'testuser',
        targetType: 'message',
        targetId: 'm1',
        targetLabel: 'My Box',
      }),
    })
  })
})

describe('DELETE /api/messages/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 404 when not found', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/messages/m1', { method: 'DELETE' }),
      createRouteContext({ id: 'm1' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('enforces ownership', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/messages/m-other', { method: 'DELETE' }),
      createRouteContext({ id: 'm-other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled()
  })

  it('deletes owned message and audits message.delete', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue({ id: 'm1', poBox: { label: 'My Box' } })
    const res = await DELETE(
      createNextRequest('http://localhost/api/messages/m1', { method: 'DELETE' }),
      createRouteContext({ id: 'm1' }),
    )
    expect((await res.json()).data.id).toBe('m1')
    expect(prismaMock.message.delete).toHaveBeenCalledWith({ where: { id: 'm1' } })
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'message.delete',
        actorId: 'user-1',
        actorUsername: 'testuser',
        targetType: 'message',
        targetId: 'm1',
        targetLabel: 'My Box',
      }),
    })
  })
})
