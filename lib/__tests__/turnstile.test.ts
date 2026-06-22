import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const MANAGED_KEYS = ['NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] as const

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
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    mockFetch({ json: () => ({ success: true }) })
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(true)
  })

  it('returns false when CF returns success: false', async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    mockFetch({ json: () => ({ success: false }) })
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(false)
  })

  it('returns false when token is null despite keys being configured', async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile(null, '127.0.0.1')).resolves.toBe(false)
  })

  it('returns false when fetch throws an error (network failure)', async () => {
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = '1x00000000000000000000AA'
    process.env.TURNSTILE_SECRET_KEY = '1x00000000000000000000AA'
    mockFetch({
      json: () => {
        throw new Error('Network failure')
      },
    })
    const { verifyTurnstile } = await import('@/lib/turnstile')
    await expect(verifyTurnstile('some-token', '127.0.0.1')).resolves.toBe(false)
  })
})

describe('createTurnstileProof / verifyTurnstileProof', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key-for-proof'
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'
  })

  it('createTurnstileProof returns a valid signed token', async () => {
    const { createTurnstileProof } = await import('@/lib/turnstile')
    const token = createTurnstileProof()
    expect(token).toContain('.')
    const [encoded] = token.split('.')
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString())
    expect(decoded).toHaveProperty('p', 'turnstile')
    expect(decoded).toHaveProperty('iat')
    expect(decoded).toHaveProperty('exp')
  })

  it('verifyTurnstileProof returns true for a valid token', async () => {
    const { createTurnstileProof, verifyTurnstileProof } = await import('@/lib/turnstile')
    const token = createTurnstileProof()
    expect(verifyTurnstileProof(token)).toBe(true)
  })

  it('verifyTurnstileProof returns false for null/empty', async () => {
    const { verifyTurnstileProof } = await import('@/lib/turnstile')
    expect(verifyTurnstileProof(null)).toBe(false)
    expect(verifyTurnstileProof('')).toBe(false)
  })

  it('verifyTurnstileProof returns false for tampered token', async () => {
    const { createTurnstileProof, verifyTurnstileProof } = await import('@/lib/turnstile')
    const token = createTurnstileProof()
    const dot = token.lastIndexOf('.')
    const encoded = token.slice(0, dot)
    const signature = token.slice(dot + 1)
    const tamperedPayload = Buffer.from(
      JSON.stringify({ p: 'evil', iat: 0, exp: Date.now() + 9999999 }),
    ).toString('base64')
    const tamperedToken = `${tamperedPayload}.${signature}`
    expect(verifyTurnstileProof(tamperedToken)).toBe(false)
  })
})

describe('checkTurnstile', () => {
  beforeEach(() => {
    process.env.TURNSTILE_SECRET_KEY = 'test-secret-key-for-proof'
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'test-site-key'
  })

  it('with valid proof cookie returns verified true and no new proof', async () => {
    const { createTurnstileProof, checkTurnstile } = await import('@/lib/turnstile')
    const proof = createTurnstileProof()
    const result = await checkTurnstile(proof, null, '127.0.0.1')
    expect(result).toEqual({ verified: true, setProofCookie: null })
  })

  it('with no proof cookie and successful verifyTurnstile returns verified and proof token', async () => {
    mockFetch({ json: () => ({ success: true }) })
    const { checkTurnstile } = await import('@/lib/turnstile')
    const result = await checkTurnstile(undefined, 'some-token', '127.0.0.1')
    expect(result.verified).toBe(true)
    expect(result.setProofCookie).toBeTypeOf('string')
    expect(result.setProofCookie).toContain('.')
  })

  it('with no proof cookie and failed verifyTurnstile returns unverified', async () => {
    mockFetch({ json: () => ({ success: false }) })
    const { checkTurnstile } = await import('@/lib/turnstile')
    const result = await checkTurnstile(undefined, 'some-token', '127.0.0.1')
    expect(result).toEqual({ verified: false, setProofCookie: null })
  })
})
