import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { createUser } from '@/test/helpers/fixtures'
import { PUT } from './route'

const { mockGetAuthUser, mockVerifyCsrf } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockVerifyCsrf: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/notifications')

const USER = createUser()

function makeRequest(overrides: Record<string, unknown> = {}) {
  return createNextRequest('http://localhost/api/auth/regen-recovery', {
    method: 'PUT',
    body: {
      encPrivRec: Buffer.alloc(48, 0x77).toString('base64'),
      recKdfSalt: Buffer.alloc(16, 0x88).toString('base64'),
      recNonce: Buffer.alloc(24, 0x99).toString('base64'),
      csrfToken: 'valid-token',
      ...overrides,
    },
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockGetAuthUser.mockResolvedValue({ id: USER.id, username: USER.username })
  mockVerifyCsrf.mockResolvedValue(true)
  const { notifyRecoveryRegenerated } = await import('@/lib/notifications')
  vi.mocked(notifyRecoveryRegenerated).mockResolvedValue(undefined)
})

describe('PUT /api/auth/regen-recovery', () => {
  it('updates recovery fields when authorized and CSRF valid', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')

    const res = await PUT(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.message).toBe('Recovery code updated')
    expect(json.data.passwordHash).toBeUndefined()
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: USER.id },
      data: {
        encPrivRec: expect.any(Buffer),
        recKdfSalt: expect.any(Buffer),
        recNonce: expect.any(Buffer),
        recoveryCodeCreatedAt: expect.any(Date),
      },
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockRejectedValue(
      new (await import('@/lib/errors')).UnauthorizedError('No session token'),
    )

    const res = await PUT(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(401)
    expect(json.success).toBe(false)
    expect(json.error).toContain('No session token')
  })

  it('returns 400 when CSRF token is invalid', async () => {
    mockVerifyCsrf.mockResolvedValue(false)

    const res = await PUT(makeRequest({ csrfToken: 'bad-token' }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('CSRF')
  })

  it('returns 400 when CSRF token is missing', async () => {
    mockVerifyCsrf.mockResolvedValue(false)
    const res = await PUT(makeRequest({ csrfToken: undefined }))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.success).toBe(false)
    expect(json.error).toContain('CSRF')
  })

  it('never returns passwordHash in response', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')

    const res = await PUT(makeRequest())
    const json = await res.json()

    expect(json.data?.passwordHash).toBeUndefined()
  })

  it('sends notification after successful update', async () => {
    const { notifyRecoveryRegenerated } = await import('@/lib/notifications')

    const res = await PUT(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(notifyRecoveryRegenerated).toHaveBeenCalledTimes(1)
    expect(notifyRecoveryRegenerated).toHaveBeenCalledWith(USER.id)
  })

  it('notification failure does not affect response', async () => {
    const { notifyRecoveryRegenerated } = await import('@/lib/notifications')
    vi.mocked(notifyRecoveryRegenerated).mockRejectedValue(new Error('Email service down'))

    const res = await PUT(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.data.message).toBe('Recovery code updated')
  })
})
