import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { POST } from './route'

const { mockVerifyCsrf, mockVerifyTurnstile, mockCheckIpRate, mockCheckGlobalRate } = vi.hoisted(() => ({
  mockVerifyCsrf: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockVerifyTurnstile: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckGlobalRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}))

vi.mock('@/lib/csrf', () => ({ verifyAndConsumeCsrfToken: mockVerifyCsrf }))
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: mockVerifyTurnstile }))
vi.mock('@/lib/rate-limit', () => ({ checkIpRate: mockCheckIpRate, checkGlobalRate: mockCheckGlobalRate }))

const validBody = {
  username: 'newuser',
  csrfToken: 'valid-csrf',
  turnstileToken: 'valid-turnstile',
  authVerifier: Buffer.alloc(32, 0xaa).toString('base64'),
  authSalt: Buffer.alloc(16, 0xbb).toString('base64'),
  publicKey: Buffer.alloc(32, 0xcc).toString('base64'),
  encPrivPw: Buffer.alloc(48, 0x11).toString('base64'),
  pwKdfSalt: Buffer.alloc(16, 0x22).toString('base64'),
  pwNonce: Buffer.alloc(24, 0x33).toString('base64'),
  encPrivRec: Buffer.alloc(48, 0x44).toString('base64'),
  recKdfSalt: Buffer.alloc(16, 0x55).toString('base64'),
  recNonce: Buffer.alloc(24, 0x66).toString('base64'),
}

describe('POST /api/auth/signup', () => {
  beforeEach(() => {
    mockCheckIpRate.mockResolvedValue(false)
    mockCheckGlobalRate.mockResolvedValue(false)
    mockVerifyCsrf.mockResolvedValue(true)
    mockVerifyTurnstile.mockResolvedValue(true)
  })

  it('creates a user and returns 201', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.create.mockResolvedValue({} as any)

    const req = createNextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: validBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.username).toBe('newuser')
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ username: 'newuser' }),
    })
  })

  it('returns 409 on duplicate username (P2002)', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    const prismaError = new Error('Unique constraint') as any
    prismaError.code = 'P2002'
    prismaMock.user.create.mockRejectedValue(prismaError)

    const req = createNextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: validBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.success).toBe(false)
  })

  it('returns 400 when CSRF verification fails', async () => {
    mockVerifyCsrf.mockResolvedValue(false)

    const req = createNextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: validBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('returns 400 when Turnstile verification fails', async () => {
    mockVerifyTurnstile.mockResolvedValue(false)

    const req = createNextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: validBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('returns 429 when IP rate-limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/auth/signup', {
      method: 'POST',
      body: validBody,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
  })
})
