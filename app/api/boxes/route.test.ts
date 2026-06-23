import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createPoBox } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('GET /api/boxes', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/boxes'))
    expect(res.status).toBe(401)
  })

  it('returns empty list when no boxes exist', async () => {
    mockAuth()
    prismaMock.poBox.findMany.mockResolvedValue([])
    const res = await GET(createNextRequest('http://localhost/api/boxes'))
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('never returns passwordHash', async () => {
    mockAuth()
    const box = createPoBox({ passwordHash: '$2a$12$secret' })
    const row = { ...box, _count: { messages: 3 }, messages: [{ id: 'm-1' }] }
    prismaMock.poBox.findMany.mockResolvedValue([row] as never)
    const res = await GET(createNextRequest('http://localhost/api/boxes'))
    const body = await res.json()
    expect(body.data[0].passwordHash).toBeUndefined()
    expect(body.data[0].hasPassword).toBe(true)
  })

  it('returns hasUnread and hasPassword flags', async () => {
    mockAuth()
    const box = createPoBox({ label: 'My Box' })
    const row = { ...box, _count: { messages: 5 }, messages: [{ id: 'm-1' }] }
    prismaMock.poBox.findMany.mockResolvedValue([row] as never)
    const res = await GET(createNextRequest('http://localhost/api/boxes'))
    const body = await res.json()
    expect(body.data[0].hasUnread).toBe(true)
    expect(body.data[0].hasPassword).toBe(false)
  })

  it('returns hasPassword false when no password', async () => {
    mockAuth()
    const box = createPoBox({ passwordHash: null })
    const row = { ...box, _count: { messages: 0 }, messages: [] }
    prismaMock.poBox.findMany.mockResolvedValue([row] as never)
    const res = await GET(createNextRequest('http://localhost/api/boxes'))
    const body = await res.json()
    expect(body.data[0].hasPassword).toBe(false)
  })
})

describe('POST /api/boxes', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(
      createNextRequest('http://localhost/api/boxes', { method: 'POST', body: { label: 'Box' } }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid CSRF', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(false)
    const res = await POST(
      createNextRequest('http://localhost/api/boxes', {
        method: 'POST',
        body: { label: 'Box', csrfToken: 'bad' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('creates a box with slug', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.create.mockResolvedValue({
      id: 'box-1',
      slug: 'generated',
      label: 'My Box',
      greeting: null,
    })
    const res = await POST(
      createNextRequest('http://localhost/api/boxes', {
        method: 'POST',
        body: { label: 'My Box', csrfToken: 'valid' },
      }),
    )
    const body = await res.json()
    expect(res.status).toBe(201)
    expect(body.data.slug).toBe('generated')
  })

  it('creates box with greeting and password', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.create.mockResolvedValue({
      id: 'box-1',
      slug: 'slug',
      label: 'S',
      greeting: 'Hi',
    })
    const res = await POST(
      createNextRequest('http://localhost/api/boxes', {
        method: 'POST',
        body: { label: 'S', greeting: 'Hi', password: 'secret', csrfToken: 'valid' },
      }),
    )
    const body = await res.json()
    expect(body.data.greeting).toBe('Hi')
  })

  it('checks CSRF with create-box tag', async () => {
    mockAuth()
    vi.mocked(verifyAndConsumeCsrfToken).mockResolvedValue(true)
    prismaMock.poBox.create.mockResolvedValue({ id: 'b', slug: 's', label: 'B', greeting: null })
    await POST(
      createNextRequest('http://localhost/api/boxes', {
        method: 'POST',
        body: { label: 'B', csrfToken: 't' },
      }),
    )
    expect(verifyAndConsumeCsrfToken).toHaveBeenCalledWith('create-box', 't')
  })
})
