import { describe, it, expect, beforeEach } from 'vitest'
import { redisMock, resetRedisMock } from './redis-mock'
import { checkIpRate } from '@/lib/rate-limit'

describe('redis-mock', () => {
  beforeEach(() => {
    process.env.APP_MODE = 'production'
    resetRedisMock()
  })

  it('rate limits after threshold via rate-limit.ts', async () => {
    const cfg = { windowMs: 30_000, max: 5 }

    for (let i = 0; i < 5; i++) {
      const limited = await checkIpRate('1.2.3.4', cfg)
      expect(limited).toBe(false)
    }

    const limited = await checkIpRate('1.2.3.4', cfg)
    expect(limited).toBe(true)
  })

  it('multi.exec returns [null, result] tuples', async () => {
    const multi = redisMock.multi()
    multi.zadd('test-zset', 1, 'a')
    multi.zadd('test-zset', 2, 'b')
    multi.zcard('test-zset')
    multi.pttl('test-zset')
    const results = await multi.exec()

    expect(results).toHaveLength(4)
    expect(results[0]).toEqual([null, 1])
    expect(results[1]).toEqual([null, 1])
    expect(results[2]).toEqual([null, 2])
    expect(results[3][0]).toBeNull()
    expect(typeof results[3][1]).toBe('number')
  })

  it('withRedis returns fallback on error', async () => {
    const { withRedis } = await import('@/lib/redis')
    const result = await withRedis(
      async () => {
        throw new Error('boom')
      },
      'fallback',
    )
    expect(result).toBe('fallback')
  })

  it('resetRedisMock clears all state', async () => {
    await redisMock.set('key1', 'value1')
    await redisMock.incr('counter')
    expect(await redisMock.exists('key1')).toBe(1)
    expect(await redisMock.exists('counter')).toBe(1)

    resetRedisMock()

    expect(await redisMock.exists('key1')).toBe(0)
    expect(await redisMock.exists('counter')).toBe(0)
  })
})
