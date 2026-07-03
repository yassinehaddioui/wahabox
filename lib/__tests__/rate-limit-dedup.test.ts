import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted: create a controllable redis.set mock referenced by vi.mock factory.
const { mockSet } = vi.hoisted(() => ({
  mockSet: vi.fn<
    (key: string, value: string, ...args: (string | number)[]) => Promise<string | null>
  >(),
}))

// Mock @/lib/redis so that withRedis calls fn({ set: mockSet }) for checkDedup.
// Other exports (checkIpRate etc.) are never called in this file — only typeof-checked.
vi.mock('@/lib/redis', () => ({
  withRedis: async <T>(
    fn: (redis: { set: typeof mockSet }) => Promise<T>,
    fallback: T,
  ): Promise<T> => {
    try {
      return await fn({ set: mockSet })
    } catch {
      return fallback
    }
  },
  getRedis: vi.fn(),
  closeRedis: vi.fn(),
}))

import * as rl from '@/lib/rate-limit'

// ---------------------------------------------------------------------------
// Baseline — characterization of the existing exported surface.
// These tests run on the SAME imported module that includes checkDedup.
// ---------------------------------------------------------------------------
describe('exports baseline', () => {
  it('exports all required functions', () => {
    const names = [
      'checkIpRate',
      'checkUserRate',
      'checkGlobalRate',
      'getFailureCount',
      'clearFailures',
      'checkAuthRateLimit',
      'recordAuthFailure',
      'checkDropRateLimit',
      'getDropIpCounts',
      'recordDropIp',
      'checkDedup',
    ] as const

    for (const name of names) {
      expect(typeof (rl as Record<string, unknown>)[name]).toBe('function')
    }
  })

  it('does NOT export slidingWindow', () => {
    expect((rl as Record<string, unknown>).slidingWindow).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// checkDedup — signature-dedup primitive.
// ---------------------------------------------------------------------------
describe('checkDedup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true on first call (unique key — redis SET NX returns OK)', async () => {
    mockSet.mockResolvedValueOnce('OK')
    await expect(rl.checkDedup('k', 300)).resolves.toBe(true)
  })

  it('returns false on second call (duplicate key — redis SET NX returns null)', async () => {
    mockSet.mockResolvedValueOnce('OK')
    await rl.checkDedup('k', 300) // first call — key created
    mockSet.mockResolvedValueOnce(null)
    await expect(rl.checkDedup('k', 300)).resolves.toBe(false)
  })

  it('falls back to false when redis is down without throwing', async () => {
    mockSet.mockRejectedValue(new Error('Redis connection lost'))
    await expect(rl.checkDedup('k', 300)).resolves.toBe(false)
  })

  it('prefixes redis key with dedup:', async () => {
    mockSet.mockResolvedValue('OK')
    await rl.checkDedup('test-key', 60)
    expect(mockSet).toHaveBeenCalledWith('dedup:test-key', '', 'EX', 60, 'NX')
  })

  it('forwards TTL seconds as EX and NX flags in correct positional order', async () => {
    mockSet.mockResolvedValue('OK')
    await rl.checkDedup('k', 300)
    expect(mockSet).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'EX',
      300,
      'NX',
    )
  })
})
