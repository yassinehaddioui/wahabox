import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getRedis } from '@/lib/redis'

const CHECK_TIMEOUT_MS = 5000

async function checkPostgres(): Promise<'ok' | 'down' | 'timeout'> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS),
  )
  try {
    await Promise.race([prisma.$queryRaw<[{ '1': number }]>`SELECT 1 AS "1"`, timeout])
    return 'ok'
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') return 'timeout'
    return 'down'
  }
}

async function checkRedis(): Promise<'ok' | 'down' | 'timeout'> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), CHECK_TIMEOUT_MS),
  )
  try {
    const redis = await getRedis()
    await Promise.race([redis.ping(), timeout])
    return 'ok'
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') return 'timeout'
    return 'down'
  }
}

export async function GET(_request: NextRequest) {
  const results = await Promise.allSettled([checkPostgres(), checkRedis()])

  const getCheckStatus = (result: PromiseSettledResult<'ok' | 'down' | 'timeout'>) =>
    result.status === 'fulfilled' ? result.value : 'down'

  const checks = {
    postgres: getCheckStatus(results[0]),
    redis: getCheckStatus(results[1]),
  }

  if (checks.postgres === 'ok' && checks.redis === 'ok') {
    return NextResponse.json({ success: true as const, data: checks })
  }

  return NextResponse.json(
    { success: false as const, error: 'Service unavailable', checks },
    { status: 503 },
  )
}
