import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const MANAGED_KEYS = ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const

let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = {}
  for (const key of MANAGED_KEYS) {
    saved[key] = process.env[key]
  }
  vi.resetModules()
  resetMockFetch()
})

afterEach(() => {
  resetMockFetch()
  for (const key of MANAGED_KEYS) {
    if (saved[key] === undefined) delete process.env[key]
    else process.env[key] = saved[key]
  }
})

describe('verifyTurnstile', () => {
  it('returns true in dev when keys are not configured (dev bypass)', async () => {
    for (const key of MANAGED_KEYS) delete process.env[key]
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(true)
  })

  it('returns true when keys are configured and CF returns success', async () => {
    process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    mockFetch({ json: () => ({ success: true }) })
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(true)
  })

  it('returns false when CF returns success: false', async () => {
    process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    mockFetch({ json: () => ({ success: false }) })
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(false)
  })

  it('returns false when token is null despite keys being configured', async () => {
    process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile(null, '127.0.0.1')).resolves.toBe(false)
  })

  it('returns false when fetch throws an error (network failure)', async () => {
    process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    mockFetch({
      json: () => { throw new Error('Network failure') },
    })
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(false)
  })
})
