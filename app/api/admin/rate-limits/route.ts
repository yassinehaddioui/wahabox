import { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { success, error } from '@/lib/response'
import { RateLimitError } from '@/lib/errors'
import { getRedis } from '@/lib/redis'

const RL_WINDOW = { windowMs: 60_000, max: 10 }

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-ratelimits:${ip}`, RL_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    await getAdminUser(request)

    try {
      const redis = await getRedis()
      const [ipKeys, userKeys, globalKey, failKeys, dropKeys] = await Promise.all([
        redis.keys('rl:ip:*').then((r) => r.length),
        redis.keys('rl:user:*').then((r) => r.length),
        redis.keys('rl:global').then((r) => r.length),
        redis.keys('fail:*').then((r) => r.length),
        redis.keys('drop:count:*').then((r) => r.length),
      ])
      return success({
        redisConnected: true,
        ipRateLimitKeys: ipKeys,
        userRateLimitKeys: userKeys,
        globalRateLimitKey: globalKey,
        authFailureKeys: failKeys,
        dropCountKeys: dropKeys,
      })
    } catch {
      return success({
        redisConnected: false,
        ipRateLimitKeys: 0,
        userRateLimitKeys: 0,
        globalRateLimitKey: 0,
        authFailureKeys: 0,
        dropCountKeys: 0,
      })
    }
  } catch (err) {
    return error(err)
  }
}
