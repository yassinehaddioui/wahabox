import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createNextRequest } from '@/test/helpers/request'
import { resetRedisMock } from '@/test/helpers/redis-mock'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'

vi.mock('@/lib/csrf', () => ({
  generateCsrfToken: vi.fn(),
  storeCsrfToken: vi.fn(),
  isCsrfIssuanceRateLimited: vi.fn(),
}))

import { generateCsrfToken, isCsrfIssuanceRateLimited, storeCsrfToken } from '@/lib/csrf'
import { GET } from './route'

describe('GET /api/csrf', () => {
  beforeEach(() => {
    resetRedisMock()
    resetPrismaMock()
    vi.clearAllMocks()
    vi.mocked(isCsrfIssuanceRateLimited).mockResolvedValue(false)
  })

  it('returns null csrfToken when no tag', async () => {
    const res = await GET(createNextRequest('http://localhost/api/csrf'))
    expect((await res.json()).data.csrfToken).toBeNull()
  })

  it('returns token for allow-listed tag', async () => {
    vi.mocked(generateCsrfToken).mockReturnValue('token-signup')
    vi.mocked(storeCsrfToken).mockResolvedValue()
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag=signup'))
    expect((await res.json()).data.csrfToken).toBe('token-signup')
    expect(generateCsrfToken).toHaveBeenCalledWith('signup')
  })

  it('returns token for an existing public box slug', async () => {
    vi.mocked(generateCsrfToken).mockReturnValue('token-custom')
    vi.mocked(storeCsrfToken).mockResolvedValue()
    prismaMock.poBox.findUnique.mockResolvedValue({ id: 'box-1' })
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag=custom-box-tag_123'))
    expect((await res.json()).data.csrfToken).toBe('token-custom')
  })

  it('does not store a token for an unknown but well-formed tag', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(null)
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag=attacker-tag'))

    expect((await res.json()).data.csrfToken).toBeNull()
    expect(generateCsrfToken).not.toHaveBeenCalled()
    expect(storeCsrfToken).not.toHaveBeenCalled()
  })

  it('returns 429 without storing a token when issuance is rate-limited', async () => {
    vi.mocked(isCsrfIssuanceRateLimited).mockResolvedValue(true)
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag=signup', {
      headers: { 'x-forwarded-for': '203.0.113.10' },
    }))

    expect(res.status).toBe(429)
    expect(storeCsrfToken).not.toHaveBeenCalled()
    expect(isCsrfIssuanceRateLimited).toHaveBeenCalledWith('203.0.113.10')
  })

  it('returns null for invalid tag (spaces)', async () => {
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag=tag with spaces'))
    expect((await res.json()).data.csrfToken).toBeNull()
  })

  it('returns null for empty tag', async () => {
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag='))
    expect((await res.json()).data.csrfToken).toBeNull()
  })

  it('returns null for tag longer than 64 chars', async () => {
    const res = await GET(createNextRequest(`http://localhost/api/csrf?tag=${'a'.repeat(65)}`))
    expect((await res.json()).data.csrfToken).toBeNull()
  })
})
