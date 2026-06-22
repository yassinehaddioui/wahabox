import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createPoBox } from '@/test/helpers/fixtures'
import { PATCH, DELETE } from './route'
import { createNextRequest, createRouteContext } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('PATCH /api/boxes/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await PATCH(
      createNextRequest('http://localhost/api/boxes/b1', { method: 'PATCH', body: {} }),
      createRouteContext({ id: 'b1' }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await PATCH(
      createNextRequest('http://localhost/api/boxes/b1', {
        method: 'PATCH',
        body: { csrfToken: 'bad' },
      }),
      createRouteContext({ id: 'b1' }),
    )
    expect(res.status).toBe(400)
  })

  it('enforces ownership returns 404 for another user box', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.findFirst.mockResolvedValue(null)
    const res = await PATCH(
      createNextRequest('http://localhost/api/boxes/other', {
        method: 'PATCH',
        body: { label: 'H', csrfToken: 'v' },
      }),
      createRouteContext({ id: 'other' }),
    )
    expect(res.status).toBe(404)
    expect(prismaMock.poBox.findFirst).toHaveBeenCalledWith({
      where: { id: 'other', ownerId: 'user-1' },
    })
  })

  it('updates box fields', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.findFirst.mockResolvedValue(createPoBox({ id: 'b1' }))
    prismaMock.poBox.update.mockResolvedValue(
      createPoBox({ id: 'b1', label: 'Updated', greeting: 'Hi', slug: 'new-slug' }) as any,
    )
    const res = await PATCH(
      createNextRequest('http://localhost/api/boxes/b1', {
        method: 'PATCH',
        body: { label: 'Updated', greeting: 'Hi', rotateSlug: true, csrfToken: 'v' },
      }),
      createRouteContext({ id: 'b1' }),
    )
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.data.hasPassword).toBe(false)
    expect(body.data.passwordHash).toBeUndefined()
  })

  it('rotates slug', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    const box = createPoBox({ id: 'b1', slug: 'old-slug' })
    prismaMock.poBox.findFirst.mockResolvedValue(box)
    prismaMock.poBox.update.mockResolvedValue({ ...box, slug: 'new-slug' })
    const res = await PATCH(
      createNextRequest('http://localhost/api/boxes/b1', {
        method: 'PATCH',
        body: { rotateSlug: true, csrfToken: 'v' },
      }),
      createRouteContext({ id: 'b1' }),
    )
    const body = await res.json()
    expect(body.data.slug).not.toBe('old-slug')
  })

  it('removes password when null', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.findFirst.mockResolvedValue(
      createPoBox({ id: 'b1', passwordHash: '$2a$12$hash' }),
    )
    prismaMock.poBox.update.mockResolvedValue(createPoBox({ id: 'b1', passwordHash: null }) as any)
    const res = await PATCH(
      createNextRequest('http://localhost/api/boxes/b1', {
        method: 'PATCH',
        body: { password: null, csrfToken: 'v' },
      }),
      createRouteContext({ id: 'b1' }),
    )
    expect((await res.json()).data.hasPassword).toBe(false)
  })
})

describe('DELETE /api/boxes/[id]', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('enforces ownership', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.findFirst.mockResolvedValue(null)
    const res = await DELETE(
      createNextRequest('http://localhost/api/boxes/other', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'other' }),
    )
    expect(res.status).toBe(404)
  })

  it('deletes owned box', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.findFirst.mockResolvedValue(createPoBox({ id: 'b1' }))
    prismaMock.poBox.delete.mockResolvedValue({} as any)
    const res = await DELETE(
      createNextRequest('http://localhost/api/boxes/b1', {
        method: 'DELETE',
        body: { csrfToken: 'v' },
      }),
      createRouteContext({ id: 'b1' }),
    )
    expect((await res.json()).data.id).toBe('b1')
    expect(prismaMock.poBox.delete).toHaveBeenCalledWith({ where: { id: 'b1' } })
  })
})
