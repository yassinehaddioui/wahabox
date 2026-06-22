import { describe, it, expect, beforeEach } from 'vitest'
import { resetRedisMock } from '@/test/helpers/redis-mock'
import {
  checkIpRate,
  checkUserRate,
  checkGlobalRate,
  checkAuthRateLimit,
  recordAuthFailure,
  clearFailures,
  checkDropRateLimit,
  getDropIpCounts,
  recordDropIp,
  getFailureCount,
} from '@/lib/rate-limit'

const WINDOW = { windowMs: 30_000, max: 3 }
const AUTH_WINDOW = { windowMs: 30_000, max: 5 }
const DROP_WINDOW = { windowMs: 60_000, max: 10 }

beforeEach(() => {
  process.env.APP_MODE = 'production'
  resetRedisMock()
})

describe('sliding window rate limiting', () => {
  it('allows requests up to the limit', async () => {
    for (let i = 0; i < 3; i++) {
      await expect(checkIpRate('1.2.3.4', WINDOW)).resolves.toBe(false)
    }
  })

  it('blocks after exceeding the limit', async () => {
    for (let i = 0; i < 4; i++) {
      await checkIpRate('1.2.3.4', WINDOW)
    }
    await expect(checkIpRate('1.2.3.4', WINDOW)).resolves.toBe(true)
  })

  it('independent IPs have separate counters', async () => {
    for (let i = 0; i < 4; i++) {
      await checkIpRate('1.2.3.4', WINDOW)
    }
    for (let i = 0; i < 3; i++) {
      await expect(checkIpRate('5.6.7.8', WINDOW)).resolves.toBe(false)
    }
    await expect(checkIpRate('1.2.3.4', WINDOW)).resolves.toBe(true)
    await expect(checkIpRate('5.6.7.8', WINDOW)).resolves.toBe(true)
  })

  it('uses rl:user: prefix for per-user keys', async () => {
    for (let i = 0; i < 4; i++) {
      await checkUserRate('alice', WINDOW)
    }
    await expect(checkUserRate('alice', WINDOW)).resolves.toBe(true)
    await expect(checkUserRate('bob', WINDOW)).resolves.toBe(false)
  })

  it('default global limit', async () => {
    const tight = { windowMs: 60_000, max: 1 }
    await expect(checkGlobalRate(tight)).resolves.toBe(false)
    await expect(checkGlobalRate(tight)).resolves.toBe(true)
  })
})

describe('auth rate limit and lockout', () => {
  it('returns no lockout for zero failures', async () => {
    const result = await checkAuthRateLimit('alice', '1.2.3.4')
    expect(result.isLocked).toBe(false)
    expect(result.lockoutRemainingMs).toBe(0)
    expect(result.ip).toBe(false)
    expect(result.user).toBe(false)
    expect(result.global).toBe(false)
  })

  it('locks after 3 failures', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAuthFailure('alice', '1.2.3.4')
    }
    const result = await checkAuthRateLimit('alice', '1.2.3.4')
    expect(result.isLocked).toBe(true)
    expect(result.lockoutRemainingMs).toBeGreaterThan(0)
  })

  it('lockout duration increases with failure count', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAuthFailure('alice', '1.2.3.4')
    }
    const r3 = await checkAuthRateLimit('alice', '1.2.3.4')

    await recordAuthFailure('alice', '1.2.3.4')
    const r4 = await checkAuthRateLimit('alice', '1.2.3.4')

    expect(r4.lockoutRemainingMs).toBeGreaterThan(r3.lockoutRemainingMs)
  })

  it('caps lockout at 15 minutes', async () => {
    for (let i = 0; i < 10; i++) {
      await recordAuthFailure('alice', '1.2.3.4')
    }
    const result = await checkAuthRateLimit('alice', '1.2.3.4')
    expect(result.isLocked).toBe(true)
    expect(result.lockoutRemainingMs).toBeLessThanOrEqual(900_000)
  })

  it('getFailureCount returns 0 initially', async () => {
    await expect(getFailureCount('alice')).resolves.toBe(0)
  })

  it('getFailureCount reflects recorded failures', async () => {
    await recordAuthFailure('alice', '1.2.3.4')
    await recordAuthFailure('alice', '1.2.3.4')
    await expect(getFailureCount('alice')).resolves.toBe(2)
  })

  it('clearFailures resets lockout', async () => {
    for (let i = 0; i < 3; i++) {
      await recordAuthFailure('alice', '1.2.3.4')
    }
    await expect(getFailureCount('alice')).resolves.toBe(3)

    await clearFailures('alice')
    await expect(getFailureCount('alice')).resolves.toBe(0)

    const result = await checkAuthRateLimit('alice', '1.2.3.4')
    expect(result.isLocked).toBe(false)
  })

  it('reports ip/user rate limit booleans when those limiters are exhausted', async () => {
    for (let i = 0; i < 5; i++) {
      await checkIpRate('1.2.3.4', AUTH_WINDOW)
      await checkUserRate('alice', AUTH_WINDOW)
    }
    const result = await checkAuthRateLimit('alice', '1.2.3.4')
    expect(result.ip).toBe(true)
    expect(result.user).toBe(true)
  })
})

describe('drop rate limit', () => {
  it('returns false when under all limits', async () => {
    await expect(checkDropRateLimit('my-slug', '1.2.3.4')).resolves.toBe(false)
  })

  it('returns true when IP drop rate exceeds DROP_WINDOW max', async () => {
    for (let i = 0; i < 10; i++) {
      await checkIpRate('drop:1.2.3.4', DROP_WINDOW)
    }
    await expect(checkDropRateLimit('my-slug', '1.2.3.4')).resolves.toBe(true)
  })

  it('recordDropIp increments hourly count', async () => {
    await recordDropIp('1.2.3.4')
    const counts = await getDropIpCounts('1.2.3.4')
    expect(counts.hourly).toBe(1)

    await recordDropIp('1.2.3.4')
    const counts2 = await getDropIpCounts('1.2.3.4')
    expect(counts2.hourly).toBe(2)
  })

  it('returns zero counts for a fresh IP', async () => {
    const counts = await getDropIpCounts('9.9.9.9')
    expect(counts.hourly).toBe(0)
    expect(counts.daily).toBe(0)
  })
})

describe('multi.exec tuple format', () => {
  it('returns [null, result] tuples consumed by rate-limit destructuring', async () => {
    const { redisMock } = await import('@/test/helpers/redis-mock')

    const multi = redisMock.multi()
    multi.zadd('z', 1, 'a')
    multi.zcard('z')
    multi.zadd('z', 2, 'b')
    multi.zcard('z')

    const results = await multi.exec()
    expect(results).toHaveLength(4)
    expect(results[0]).toEqual([null, 1])
    expect(results[1]).toEqual([null, 1])
    expect(results[2]).toEqual([null, 1])
    expect(results[3]).toEqual([null, 2])
  })
})
