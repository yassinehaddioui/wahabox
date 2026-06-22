import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import '@/test/helpers/prisma-mock'
import { POST } from './route'

const { mockCheckIpRate, mockCheckGlobalRate } = vi.hoisted(() => ({
  mockCheckIpRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
  mockCheckGlobalRate: vi.fn<(...args: unknown[]) => Promise<boolean>>(),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkIpRate: mockCheckIpRate,
  checkGlobalRate: mockCheckGlobalRate,
}))

describe('POST /api/auth/salts', () => {
  beforeEach(() => {
    mockCheckIpRate.mockResolvedValue(false)
    mockCheckGlobalRate.mockResolvedValue(false)
  })

  it('returns salts for a known user', async () => {
    const { prismaMock } = await import('@/test/helpers/prisma-mock')
    prismaMock.user.findUnique.mockResolvedValue({
      pwKdfSalt: Buffer.alloc(16, 0x22),
      authSalt: Buffer.alloc(16, 0xbb),
    } as any)

    const req = createNextRequest('http://localhost/api/auth/salts', {
      method: 'POST',
      body: { username: 'testuser' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.pwKdfSalt).toBe(Buffer.alloc(16, 0x22).toString('base64'))
    expect(body.data.authSalt).toBe(Buffer.alloc(16, 0xbb).toString('base64'))
  })

  it('returns dummy salts for an unknown user', async () => {
    const req = createNextRequest('http://localhost/api/auth/salts', {
      method: 'POST',
      body: { username: 'unknown' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(typeof body.data.pwKdfSalt).toBe('string')
    expect(typeof body.data.authSalt).toBe('string')
  })

  it('returns 429 when rate-limited', async () => {
    mockCheckIpRate.mockResolvedValue(true)

    const req = createNextRequest('http://localhost/api/auth/salts', {
      method: 'POST',
      body: { username: 'testuser' },
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.success).toBe(false)
  })
})
