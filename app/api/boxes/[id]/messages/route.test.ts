import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createPoBox, createMessage } from '@/test/helpers/fixtures'
import { GET } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { getAuthUser } from '@/lib/auth'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('GET /api/boxes/[id]/messages', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/boxes/b1/messages'), createRouteContext({ id: 'b1' }))
    expect(res.status).toBe(401)
  })

  it('returns 404 when box not found or not owned', async () => {
    mockAuth()
    prismaMock.poBox.findFirst.mockResolvedValue(null)
    const res = await GET(createNextRequest('http://localhost/api/boxes/other/messages'), createRouteContext({ id: 'other' }))
    expect(res.status).toBe(404)
    expect(prismaMock.poBox.findFirst).toHaveBeenCalledWith({ where: { id: 'other', ownerId: 'user-1' } })
  })

  it('returns empty list when no messages', async () => {
    mockAuth()
    prismaMock.poBox.findFirst.mockResolvedValue(createPoBox({ id: 'b1' }))
    prismaMock.message.findMany.mockResolvedValue([])
    const res = await GET(createNextRequest('http://localhost/api/boxes/b1/messages'), createRouteContext({ id: 'b1' }))
    expect((await res.json()).data).toEqual([])
  })

  it('returns messages with base64 ciphertext, ordered desc', async () => {
    mockAuth()
    prismaMock.poBox.findFirst.mockResolvedValue(createPoBox({ id: 'b1' }))
    const older = createMessage({ id: 'm-1', createdAt: new Date('2025-01-01T00:00:00.000Z'), readAt: null })
    const newer = createMessage({ id: 'm-2', createdAt: new Date('2025-01-02T00:00:00.000Z'), readAt: new Date('2025-01-02T12:00:00.000Z') })
    prismaMock.message.findMany.mockResolvedValue([newer, older])
    const res = await GET(createNextRequest('http://localhost/api/boxes/b1/messages'), createRouteContext({ id: 'b1' }))
    const body = await res.json()
    expect(body.data[0].id).toBe('m-2')
    expect(body.data[1].id).toBe('m-1')
    expect(body.data[0].ciphertext).toBe(Buffer.from(newer.ciphertext).toString('base64'))
  })
})
