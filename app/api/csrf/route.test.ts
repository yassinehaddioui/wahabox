import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { resetRedisMock } from '@/test/helpers/redis-mock'

vi.mock('@/lib/csrf', () => ({ generateCsrfToken: vi.fn(), storeCsrfToken: vi.fn() }))

import { generateCsrfToken, storeCsrfToken } from '@/lib/csrf'

describe('GET /api/csrf', () => {
  beforeEach(() => { resetRedisMock(); vi.clearAllMocks() })

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

  it('returns token for regex-matching tag', async () => {
    vi.mocked(generateCsrfToken).mockReturnValue('token-custom')
    vi.mocked(storeCsrfToken).mockResolvedValue()
    const res = await GET(createNextRequest('http://localhost/api/csrf?tag=custom-box-tag_123'))
    expect((await res.json()).data.csrfToken).toBe('token-custom')
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
