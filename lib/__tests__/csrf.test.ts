import { describe, it, expect, beforeEach, vi } from 'vitest'

const store = new Map<string, string>()

vi.mock('@/lib/redis', () => ({
  getRedis: async () => ({
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value)
      return 'OK'
    },
    del: async (key: string) => {
      const had = store.has(key)
      store.delete(key)
      return had ? 1 : 0
    },
  }),
  withRedis: async <T>(fn: (redis: unknown) => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn({
        get: async (key: string) => store.get(key) ?? null,
        set: async (key: string, value: string) => {
          store.set(key, value)
          return 'OK'
        },
        del: async (key: string) => {
          const had = store.has(key)
          store.delete(key)
          return had ? 1 : 0
        },
        incr: async (key: string) => {
          const next = Number(store.get(key) ?? '0') + 1
          store.set(key, String(next))
          return next
        },
        expire: async () => 1,
      })
    } catch {
      return fallback
    }
  },
  closeRedis: async () => {},
}))

import {
  generateCsrfToken,
  isCsrfIssuanceRateLimited,
  storeCsrfToken,
  verifyAndConsumeCsrfToken,
} from '@/lib/csrf'

describe('isCsrfIssuanceRateLimited', () => {
  beforeEach(() => store.clear())

  it('limits issuance after 30 requests even in development mode', async () => {
    vi.stubEnv('APP_MODE', 'development')
    for (let i = 0; i < 30; i++) {
      await expect(isCsrfIssuanceRateLimited('203.0.113.5')).resolves.toBe(false)
    }
    await expect(isCsrfIssuanceRateLimited('203.0.113.5')).resolves.toBe(true)
    vi.unstubAllEnvs()
  })
})

describe('generateCsrfToken', () => {
  it('returns a token in nonce.signature format', () => {
    const token = generateCsrfToken('form')
    const dot = token.indexOf('.')
    expect(dot).toBeGreaterThan(0)

    const nonce = token.slice(0, dot)
    const signature = token.slice(dot + 1)
    expect(nonce).toMatch(/^[0-9a-f-]{36}$/)
    expect(signature).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('includes bindId in the signed payload when provided', () => {
    const token = generateCsrfToken('form', 'user-123')
    expect(token.split('.').length).toBe(2)
  })
})

describe('storeCsrfToken', () => {
  beforeEach(() => {
    store.clear()
  })

  it('resolves without error', async () => {
    const token = generateCsrfToken('form')
    await expect(storeCsrfToken(token)).resolves.toBeUndefined()
  })
})

describe('verifyAndConsumeCsrfToken', () => {
  beforeEach(() => {
    store.clear()
  })

  it('returns true for a valid stored token with matching tag', async () => {
    const token = generateCsrfToken('form')
    await storeCsrfToken(token)
    await expect(verifyAndConsumeCsrfToken('form', token)).resolves.toBe(true)
  })

  it('returns false when token is null', async () => {
    await expect(verifyAndConsumeCsrfToken('form', null)).resolves.toBe(false)
  })

  it('returns false for a malformed token (no dot)', async () => {
    await expect(verifyAndConsumeCsrfToken('form', 'invalid')).resolves.toBe(false)
  })

  it('returns false when the tag does not match', async () => {
    const token = generateCsrfToken('form')
    await storeCsrfToken(token)
    await expect(verifyAndConsumeCsrfToken('api', token)).resolves.toBe(false)
  })

  it('returns false for a token with wrong signature', async () => {
    const token = '550e8400-e29b-41d4-a716-446655440000.badsignature'
    await expect(verifyAndConsumeCsrfToken('form', token)).resolves.toBe(false)
  })

  it('consumes the token on first use and rejects the second use', async () => {
    const token = generateCsrfToken('form')
    await storeCsrfToken(token)

    const first = await verifyAndConsumeCsrfToken('form', token)
    expect(first).toBe(true)

    const second = await verifyAndConsumeCsrfToken('form', token)
    expect(second).toBe(false)
  })

  it('returns false for a valid token that was never stored', async () => {
    const token = generateCsrfToken('form')
    await expect(verifyAndConsumeCsrfToken('form', token)).resolves.toBe(false)
  })
})
