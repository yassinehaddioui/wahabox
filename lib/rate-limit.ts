import { withRedis } from './redis'

type WindowConfig = {
  windowMs: number
  max: number
}

const AUTH_WINDOW: WindowConfig = { windowMs: 30_000, max: 5 }
const DROP_WINDOW: WindowConfig = { windowMs: 60_000, max: 10 }
const GLOBAL_WINDOW: WindowConfig = { windowMs: 1_000, max: 50 }

const FAIL_COUNTER_TTL = 900
const BASE_LOCKOUT_MS = 30_000
const MAX_LOCKOUT_MS = 900_000

function lockoutDuration(failures: number): number {
  return Math.min(BASE_LOCKOUT_MS * Math.pow(2, failures - 1), MAX_LOCKOUT_MS)
}

async function slidingWindow(key: string, cfg: WindowConfig): Promise<boolean> {
  return withRedis(async (redis) => {
    const now = Date.now()
    const windowStart = now - cfg.windowMs
    const multi = redis.multi()

    multi.zremrangebyscore(key, 0, windowStart)
    multi.zadd(key, now, `${now}:${Math.random()}`)
    multi.zcard(key)
    multi.expire(key, Math.ceil(cfg.windowMs / 1000) + 1)
    multi.pttl(key)

    const results = await multi.exec()
    if (!results) return true

    const count = results[2]?.[1] as number | undefined
    return (count ?? 0) > cfg.max
  }, false)
}

async function incrementFail(key: string): Promise<number> {
  return withRedis(async (redis) => {
    const count = await redis.incr(key)
    if (count === 1) {
      await redis.expire(key, FAIL_COUNTER_TTL)
    }
    return count
  }, 0)
}

export async function checkIpRate(key: string, cfg: WindowConfig): Promise<boolean> {
  return slidingWindow(`rl:ip:${key}`, cfg)
}

export async function checkUserRate(username: string, cfg: WindowConfig): Promise<boolean> {
  return slidingWindow(`rl:user:${username}`, cfg)
}

export async function checkGlobalRate(cfg: WindowConfig = GLOBAL_WINDOW): Promise<boolean> {
  return slidingWindow('rl:global', cfg)
}

export async function getFailureCount(username: string): Promise<number> {
  return withRedis(async (redis) => {
    const count = await redis.get(`fail:user:${username}`)
    return count ? parseInt(count, 10) : 0
  }, 0)
}

export async function clearFailures(username: string): Promise<void> {
  await withRedis(async (redis) => {
    await redis.del(`fail:user:${username}`)
  }, undefined)
}

export type RateLimitCheck = {
  ip: boolean
  user: boolean
  global: boolean
  isLocked: boolean
  lockoutRemainingMs: number
}

export async function checkAuthRateLimit(username: string, ip: string): Promise<RateLimitCheck> {
  const [failCount, ipLimited, userLimited, globalLimited] = await Promise.all([
    getFailureCount(username),
    checkIpRate(ip, AUTH_WINDOW),
    checkUserRate(username, AUTH_WINDOW),
    checkGlobalRate(),
  ])

  let isLocked = false
  let lockoutRemainingMs = 0

  if (failCount >= 3) {
    const duration = lockoutDuration(failCount - 2)
    const lastFail = await withRedis(async (redis) => {
      return redis.get(`fail:last:${username}`)
    }, null) as string | null

    if (lastFail) {
      const lastFailTime = parseInt(lastFail, 10)
      const elapsed = Date.now() - lastFailTime
      if (elapsed < duration) {
        isLocked = true
        lockoutRemainingMs = duration - elapsed
      }
    }
  }

  return { ip: ipLimited, user: userLimited, global: globalLimited, isLocked, lockoutRemainingMs }
}

export async function recordAuthFailure(username: string, ip: string): Promise<void> {
  await withRedis(async (redis) => {
    const multi = redis.multi()
    multi.incr(`fail:user:${username}`)
    multi.expire(`fail:user:${username}`, FAIL_COUNTER_TTL)
    multi.set(`fail:last:${username}`, String(Date.now()), 'EX', FAIL_COUNTER_TTL)
    await multi.exec()
  }, undefined)
  await incrementFail(`fail:ip:${ip}`)
}

export async function checkDropRateLimit(slug: string, ip: string): Promise<boolean> {
  const limited = await Promise.all([
    checkIpRate(`drop:${ip}`, DROP_WINDOW),
    checkUserRate(slug, DROP_WINDOW),
    checkGlobalRate(),
  ])
  return limited.some(Boolean)
}

export async function getDropIpCounts(ip: string): Promise<{ hourly: number; daily: number }> {
  const now = Date.now()
  const hourAgo = now - 3600_000
  const dayAgo = now - 86_400_000

  return withRedis(async (redis) => {
    const multi = redis.multi()
    const hourlyKey = `drop:count:hour:${ip}`
    const dailyKey = `drop:count:day:${ip}`

    multi.zremrangebyscore(hourlyKey, 0, hourAgo)
    multi.zcount(hourlyKey, hourAgo, '+inf')
    multi.expire(hourlyKey, 3600 + 60)

    multi.zremrangebyscore(dailyKey, 0, dayAgo)
    multi.zcount(dailyKey, dayAgo, '+inf')
    multi.expire(dailyKey, 86400 + 60)

    const results = await multi.exec()
    return {
      hourly: (results?.[1]?.[1] as number) ?? 0,
      daily: (results?.[3]?.[1] as number) ?? 0,
    }
  }, { hourly: 0, daily: 0 })
}

export async function recordDropIp(ip: string): Promise<void> {
  const now = Date.now()
  await withRedis(async (redis) => {
    const multi = redis.multi()
    multi.zadd(`drop:count:hour:${ip}`, now, `${now}:${Math.random()}`)
    multi.zadd(`drop:count:day:${ip}`, now, `${now}:${Math.random()}`)
    await multi.exec()
  }, undefined)
}
