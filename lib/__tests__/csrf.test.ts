import { describe, it, expect, beforeEach } from 'vitest'
import { generateCsrfToken, storeCsrfToken, verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { resetRedisMock } from '@/test/helpers/redis-mock'

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
    resetRedisMock()
  })

  it('resolves without error', async () => {
    const token = generateCsrfToken('form')
    await expect(storeCsrfToken(token)).resolves.toBeUndefined()
  })
})

describe('verifyAndConsumeCsrfToken', () => {
  beforeEach(() => {
    resetRedisMock()
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
