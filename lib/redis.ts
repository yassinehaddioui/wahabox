import Redis from 'ioredis'
import ENV from './env'

let client: Redis | null = null
let enabled = true

export function getRedis(): Redis {
  if (!enabled) {
    throw new Error('Redis is disabled (connection failed)')
  }
  if (!client) {
    client = new Redis(ENV.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy(times) {
        if (times > 3) return null
        return Math.min(times * 200, 2000)
      },
    })
    client.on('error', () => {
      enabled = false
      client = null
    })
  }
  return client
}

export async function withRedis<T>(fn: (redis: Redis) => Promise<T>, fallback: T): Promise<T> {
  try {
    const redis = getRedis()
    return await fn(redis)
  } catch {
    return fallback
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit()
    client = null
  }
}
