import Redis from 'ioredis'
import ENV from './env'

let clientPromise: Promise<Redis> | null = null
let enabled = true

export async function getRedis(): Promise<Redis> {
  if (!enabled) {
    throw new Error('Redis is disabled (connection failed)')
  }
  if (!clientPromise) {
    const redis = new Redis(ENV.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 3) return null
        return Math.min(times * 200, 2000)
      },
    })
    redis.on('error', () => {
      enabled = false
      clientPromise = null
    })
    clientPromise = redis.connect().then(() => redis)
  }
  return clientPromise
}

export async function withRedis<T>(fn: (redis: Redis) => Promise<T>, fallback: T): Promise<T> {
  try {
    const redis = await getRedis()
    return await fn(redis)
  } catch {
    return fallback
  }
}

export async function closeRedis(): Promise<void> {
  if (clientPromise) {
    const redis = await clientPromise
    await redis.quit()
    clientPromise = null
  }
}
