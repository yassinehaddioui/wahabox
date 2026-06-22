import { cookies } from 'next/headers'
import crypto from 'crypto'
import prisma from '@/lib/prisma'

type SessionData = {
  userId: string
  username: string
  tokenVersion: number
  createdAt: number
}

const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000

function sign(data: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return crypto.createHmac('sha256', secret).update(data).digest('base64')
}

export async function createSession(userId: string, username: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokenVersion: true },
  })
  const tokenVersion = user?.tokenVersion ?? 0
  const payload: SessionData = { userId, username, tokenVersion, createdAt: Date.now() }
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

    const expected = sign(encoded)
    if (signature.length !== expected.length) return undefined

    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        return undefined
      }
    } catch {
      return undefined
    }

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

export async function validateSession(token: string): Promise<SessionData | undefined> {
  const session = await getSession(token)
  if (!session) return undefined

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { tokenVersion: true },
  })
  if (!user || user.tokenVersion !== session.tokenVersion) {
    return undefined
  }

  return session
}

export async function destroySession(): Promise<void> {}

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
