import crypto from 'crypto'
import { getRedis } from './redis'

const CSRF_TTL = 180 * 60

function getCsrfSecret(): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return secret
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function generateCsrfToken(tag: string, bindId?: string): string {
  const nonce = crypto.randomUUID()
  const payload = bindId ? `${tag}:${nonce}:${bindId}` : `${tag}:${nonce}`
  const signature = crypto.createHmac('sha256', getCsrfSecret()).update(payload).digest('base64url')
  return `${nonce}.${signature}`
}

export async function storeCsrfToken(token: string): Promise<void> {
  try {
    const redis = await getRedis()
    await redis.set(`csrf:${hashToken(token)}`, '1', 'EX', CSRF_TTL)
  } catch {}
}

export async function verifyAndConsumeCsrfToken(
  tag: string,
  token: string | null,
  bindId?: string,
): Promise<boolean> {
  if (!token) return false

  const dot = token.indexOf('.')
  if (dot === -1) return false

  const nonce = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const payload = bindId ? `${tag}:${nonce}:${bindId}` : `${tag}:${nonce}`
  const expected = crypto.createHmac('sha256', getCsrfSecret()).update(payload).digest('base64url')

  if (signature.length !== expected.length) return false
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return false
  }

  try {
    const key = `csrf:${hashToken(token)}`
    const redis = await getRedis()
    const consumed = await redis.del(key)
    return consumed === 1
  } catch {
    return false
  }
}
