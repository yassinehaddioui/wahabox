import { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { success, error } from '@/lib/response'
import { RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { getRedis } from '@/lib/redis'
import pkg from '@/package.json'

const HEALTH_WINDOW = { windowMs: 60_000, max: 30 }

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-health:${ip}`, HEALTH_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    await getAdminUser(request)

    const [dbOk, redisOk] = await Promise.all([
      (async () => {
        try {
          await prisma.$queryRaw`SELECT 1`
          return true
        } catch {
          return false
        }
      })(),
      (async () => {
        try {
          const r = await getRedis()
          await r.ping()
          return true
        } catch {
          return false
        }
      })(),
    ])

    return success({
      appVersion: pkg.version,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      dbConnected: dbOk,
      redisConnected: redisOk,
      emailConfigured: !!process.env.SES_FROM_ADDRESS,
      turnstileConfigured: !!process.env.TURNSTILE_SECRET_KEY,
      adminPromoteConfigured: !!process.env.ADMIN_PROMOTE_TOKEN,
    })
  } catch (err) {
    return error(err)
  }
}
