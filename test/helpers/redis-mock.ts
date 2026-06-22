import { vi } from 'vitest'

interface RedisMulti {
  zremrangebyscore(key: string, min: number | string, max: number | string): RedisMulti
  zadd(key: string, score: number, member: string): RedisMulti
  zcard(key: string): RedisMulti
  zcount(key: string, min: number | string, max: number | string): RedisMulti
  expire(key: string, seconds: number): RedisMulti
  pttl(key: string): RedisMulti
  incr(key: string): RedisMulti
  set(key: string, value: string, ...rest: unknown[]): RedisMulti
  get(key: string): RedisMulti
  del(...keys: string[]): RedisMulti
  getdel(key: string): RedisMulti
  exists(key: string): RedisMulti
  ttl(key: string): RedisMulti
  exec(): Promise<Array<[Error | null, unknown]>>
}

const { redisMock, resetRedisMock } = vi.hoisted(() => {
  const store = new Map<string, string>()
  const sortedSets = new Map<string, Map<string, number>>()
  const ttls = new Map<string, number>()

  function isExpired(key: string): boolean {
    const expire = ttls.get(key)
    if (expire === undefined) return false
    if (Date.now() >= expire) {
      store.delete(key)
      sortedSets.delete(key)
      ttls.delete(key)
      return true
    }
    return false
  }

  function parseScoreBound(value: number | string): number {
    if (value === '+inf') return Infinity
    if (value === '-inf') return -Infinity
    return Number(value)
  }

  function clearKey(key: string): void {
    store.delete(key)
    sortedSets.delete(key)
    ttls.delete(key)
  }

  async function get(key: string): Promise<string | null> {
    if (isExpired(key)) return null
    return store.get(key) ?? null
  }

  async function set(key: string, value: string, ...rest: unknown[]): Promise<'OK'> {
    let ttlMs: number | undefined
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === 'EX' && typeof rest[i + 1] === 'number') {
        ttlMs = (rest[i + 1] as number) * 1000
      } else if (rest[i] === 'PX' && typeof rest[i + 1] === 'number') {
        ttlMs = rest[i + 1] as number
      }
    }
    store.set(key, value)
    if (ttlMs !== undefined) ttls.set(key, Date.now() + ttlMs)
    else ttls.delete(key)
    return 'OK'
  }

  async function del(...keys: string[]): Promise<number> {
    let count = 0
    for (const key of keys) {
      if (isExpired(key)) continue
      if (store.has(key) || sortedSets.has(key)) {
        clearKey(key)
        count++
      }
    }
    return count
  }

  async function getdel(key: string): Promise<string | null> {
    if (isExpired(key)) return null
    const value = store.get(key) ?? null
    clearKey(key)
    return value
  }

  async function exists(key: string): Promise<number> {
    if (isExpired(key)) return 0
    return store.has(key) || sortedSets.has(key) ? 1 : 0
  }

  async function ttl(key: string): Promise<number> {
    if (isExpired(key)) return -2
    if (!store.has(key) && !sortedSets.has(key)) return -2
    const expire = ttls.get(key)
    if (expire === undefined) return -1
    return Math.ceil((expire - Date.now()) / 1000)
  }

  async function pttl(key: string): Promise<number> {
    if (isExpired(key)) return -2
    if (!store.has(key) && !sortedSets.has(key)) return -2
    const expire = ttls.get(key)
    if (expire === undefined) return -1
    return expire - Date.now()
  }

  async function expire(key: string, seconds: number): Promise<number> {
    if (isExpired(key)) return 0
    if (!store.has(key) && !sortedSets.has(key)) return 0
    ttls.set(key, Date.now() + seconds * 1000)
    return 1
  }

  async function incr(key: string): Promise<number> {
    if (isExpired(key)) {
      store.set(key, '1')
      return 1
    }
    const current = parseInt(store.get(key) ?? '0', 10)
    const next = current + 1
    store.set(key, String(next))
    return next
  }

  async function zadd(key: string, score: number, member: string): Promise<number> {
    isExpired(key)
    let zset = sortedSets.get(key)
    if (!zset) {
      zset = new Map()
      sortedSets.set(key, zset)
    }
    const existed = zset.has(member)
    zset.set(member, score)
    return existed ? 0 : 1
  }

  async function zcard(key: string): Promise<number> {
    if (isExpired(key)) return 0
    return sortedSets.get(key)?.size ?? 0
  }

  async function zcount(key: string, min: number | string, max: number | string): Promise<number> {
    if (isExpired(key)) return 0
    const zset = sortedSets.get(key)
    if (!zset) return 0
    const lo = parseScoreBound(min)
    const hi = parseScoreBound(max)
    let count = 0
    for (const score of zset.values()) {
      if (score >= lo && score <= hi) count++
    }
    return count
  }

  async function zremrangebyscore(key: string, min: number | string, max: number | string): Promise<number> {
    if (isExpired(key)) return 0
    const zset = sortedSets.get(key)
    if (!zset) return 0
    const lo = parseScoreBound(min)
    const hi = parseScoreBound(max)
    let removed = 0
    for (const [member, score] of zset) {
      if (score >= lo && score <= hi) {
        zset.delete(member)
        removed++
      }
    }
    return removed
  }

  function createMulti(): RedisMulti {
    const queue: Array<() => Promise<unknown>> = []
    const chain = (fn: () => Promise<unknown>): RedisMulti => {
      queue.push(fn)
      return multi
    }
    const multi: RedisMulti = {
      zremrangebyscore: (key, min, max) => chain(() => zremrangebyscore(key, min, max)),
      zadd: (key, score, member) => chain(() => zadd(key, score, member)),
      zcard: (key) => chain(() => zcard(key)),
      zcount: (key, min, max) => chain(() => zcount(key, min, max)),
      expire: (key, seconds) => chain(() => expire(key, seconds)),
      pttl: (key) => chain(() => pttl(key)),
      incr: (key) => chain(() => incr(key)),
      set: (key, value, ...rest) => chain(() => set(key, value, ...rest)),
      get: (key) => chain(() => get(key)),
      del: (...keys) => chain(() => del(...keys)),
      getdel: (key) => chain(() => getdel(key)),
      exists: (key) => chain(() => exists(key)),
      ttl: (key) => chain(() => ttl(key)),
      exec: async () => {
        const results: Array<[Error | null, unknown]> = []
        for (const fn of queue) {
          try {
            results.push([null, await fn()])
          } catch (err) {
            results.push([err as Error, null])
          }
        }
        return results
      },
    }
    return multi
  }

  const client = {
    get, set, del, getdel, exists, ttl, pttl, expire, incr,
    zadd, zcard, zcount, zremrangebyscore, multi: createMulti,
  }

  function resetRedisMock(): void {
    store.clear()
    sortedSets.clear()
    ttls.clear()
  }

  return { redisMock: client, resetRedisMock }
})

vi.mock('@/lib/redis', () => ({
  getRedis: async () => redisMock,
  withRedis: async <T>(fn: (redis: typeof redisMock) => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn(redisMock)
    } catch {
      return fallback
    }
  },
  closeRedis: async () => {},
}))

export { redisMock, resetRedisMock }
