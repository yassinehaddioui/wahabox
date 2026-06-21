import { withRedis } from './redis'

type WindowConfig = {
  windowMs: number
  max: number
}

const AUTH_WINDOW: WindowConfig = { windowMs: 30_000, max: 5 }
const AUTH_LOCKOUT: WindowConfig = { windowMs: 300_000, max: 10 }
const DROP_WINDOW: WindowConfig = { windowMs: 60_000, max: 10 }
const GLOBAL_WINDOW: WindowConfig = { windowMs: 1_000, max: 50 }

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

const FAIL_COUNTER_TTL = 300

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

export async function recordAuthFailure(username: string, ip: string): Promise<void> {
  await Promise.all([
    incrementFail(`fail:user:${username}`),
    incrementFail(`fail:ip:${ip}`),
  ])
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
}

export async function checkAuthRateLimit(username: string, ip: string): Promise<RateLimitCheck> {
  const [failCount, ipLimited, userLimited, globalLimited] = await Promise.all([
    getFailureCount(username),
    checkIpRate(ip, AUTH_WINDOW),
    checkUserRate(username, AUTH_WINDOW),
    checkGlobalRate(),
  ])

  const isLocked = failCount >= AUTH_LOCKOUT.max

  return { ip: ipLimited, user: userLimited, global: globalLimited, isLocked }
}

export async function checkDropRateLimit(slug: string, ip: string): Promise<boolean> {
  const limited = await Promise.all([
    checkIpRate(`drop:${ip}`, DROP_WINDOW),
    checkUserRate(slug, DROP_WINDOW),
    checkGlobalRate(),
  ])
  return limited.some(Boolean)
}
