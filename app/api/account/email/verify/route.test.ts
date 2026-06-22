import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import crypto from 'crypto'

describe('POST /api/account/email/verify', () => {
  beforeEach(() => {
    resetPrismaMock()
    resetRedisMock()
  })

  it('returns 400 for missing token', async () => {
    const res = await POST(
      createNextRequest('http://localhost/api/account/email/verify', { method: 'POST', body: {} }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for non-string token', async () => {
    const res = await POST(
      createNextRequest('http://localhost/api/account/email/verify', {
        method: 'POST',
        body: { token: 123 },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 for expired or invalid token', async () => {
    const res = await POST(
      createNextRequest('http://localhost/api/account/email/verify', {
        method: 'POST',
        body: { token: 'nonexistent' },
      }),
    )
    expect(res.status).toBe(400)
  })

  it('verifies email with a valid token', async () => {
    const token = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    await redisMock.set(`verify:${hash}`, 'user-1', 'EX', 3600)

    const res = await POST(
      createNextRequest('http://localhost/api/account/email/verify', {
        method: 'POST',
        body: { token },
      }),
    )
    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { emailVerified: true },
    })
  })

  it('consumes token on first use (replay protection)', async () => {
    const token = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(token).digest('hex')
    await redisMock.set(`verify:${hash}`, 'user-1', 'EX', 3600)

    const res1 = await POST(
      createNextRequest('http://localhost/api/account/email/verify', {
        method: 'POST',
        body: { token },
      }),
    )
    expect(res1.status).toBe(200)

    const res2 = await POST(
      createNextRequest('http://localhost/api/account/email/verify', {
        method: 'POST',
        body: { token },
      }),
    )
    expect(res2.status).toBe(400)
  })
})
