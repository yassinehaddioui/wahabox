import { cookies } from 'next/headers'
import crypto from 'crypto'

type SessionData = {
  userId: string
  username: string
  createdAt: number
}

const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000

function sign(data: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return crypto.createHmac('sha256', secret).update(data).digest('base64')
}

export function createSession(userId: string, username: string): string {
  const payload: SessionData = { userId, username, createdAt: Date.now() }
  const json = JSON.stringify(payload)
  const encoded = Buffer.from(json).toString('base64')
  const signature = sign(encoded)
  return `${encoded}.${signature}`
}

export function getSession(token: string): SessionData | undefined {
  try {
    const dot = token.lastIndexOf('.')
    if (dot === -1) return undefined

    const encoded = token.slice(0, dot)
    const signature = token.slice(dot + 1)

    if (sign(encoded) !== signature) return undefined

    const json = Buffer.from(encoded, 'base64').toString('utf-8')
    const session = JSON.parse(json) as SessionData

    if (typeof session.userId !== 'string' || typeof session.username !== 'string') {
      return undefined
    }

    if (Date.now() - session.createdAt > SESSION_MAX_AGE) {
      return undefined
    }

    return session
  } catch {
    return undefined
  }
}

export function destroySession(_token: string): void {
  // stateless — cookie is cleared via clearSessionCookie
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE / 1000,
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

export function validateToken(token: string): SessionData | undefined {
  return getSession(token)
}
