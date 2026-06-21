import { cookies } from 'next/headers'
import crypto from 'crypto'

type SessionData = {
  userId: string
  username: string
  createdAt: number
}

const sessions = new Map<string, SessionData>()

const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours

export function createSession(userId: string, username: string): string {
  const token = crypto.randomBytes(32).toString('hex')
  sessions.set(token, { userId, username, createdAt: Date.now() })
  return token
}

export function getSession(token: string): SessionData | undefined {
  const session = sessions.get(token)
  if (!session) return undefined
  if (Date.now() - session.createdAt > SESSION_MAX_AGE) {
    sessions.delete(token)
    return undefined
  }
  return session
}

export function destroySession(token: string): void {
  sessions.delete(token)
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
