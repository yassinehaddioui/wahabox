import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createMessage } from '@/test/helpers/fixtures'
import { PATCH, DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { getAuthUser } from '@/lib/auth'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('PATCH /api/messages/[id]', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await PATCH(createNextRequest('http://localhost/api/messages/m1', { method: 'PATCH' }), createRouteContext({ id: 'm1' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when message not found', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await PATCH(createNextRequest('http://localhost/api/messages/m1', { method: 'PATCH' }), createRouteContext({ id: 'm1' }))
    expect(res.status).toBe(404)
  })

  it('enforces ownership via poBox ownerId', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await PATCH(createNextRequest('http://localhost/api/messages/m-other', { method: 'PATCH' }), createRouteContext({ id: 'm-other' }))
    expect(res.status).toBe(404)
    expect(prismaMock.message.findFirst).toHaveBeenCalledWith({ where: { id: 'm-other', poBox: { ownerId: 'user-1' } } })
  })

  it('marks message as read', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(createMessage({ id: 'm1', isRead: false }))
    const res = await PATCH(createNextRequest('http://localhost/api/messages/m1', { method: 'PATCH' }), createRouteContext({ id: 'm1' }))
    expect((await res.json()).data.id).toBe('m1')
    expect(prismaMock.message.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { isRead: true } })
  })
})

describe('DELETE /api/messages/[id]', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 404 when not found', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await DELETE(createNextRequest('http://localhost/api/messages/m1', { method: 'DELETE' }), createRouteContext({ id: 'm1' }))
    expect(res.status).toBe(404)
  })

  it('enforces ownership', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(null)
    const res = await DELETE(createNextRequest('http://localhost/api/messages/m-other', { method: 'DELETE' }), createRouteContext({ id: 'm-other' }))
    expect(res.status).toBe(404)
  })

  it('deletes owned message', async () => {
    mockAuth()
    prismaMock.message.findFirst.mockResolvedValue(createMessage({ id: 'm1' }))
    const res = await DELETE(createNextRequest('http://localhost/api/messages/m1', { method: 'DELETE' }), createRouteContext({ id: 'm1' }))
    expect((await res.json()).data.id).toBe('m1')
    expect(prismaMock.message.delete).toHaveBeenCalledWith({ where: { id: 'm1' } })
  })
})
