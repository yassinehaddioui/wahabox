import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, loginSchema } from '@/lib/validation'
import { UnauthorizedError, RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { createSession, setSessionCookie } from '@/lib/session'
import { checkAuthRateLimit, recordAuthFailure, clearFailures } from '@/lib/rate-limit'

const HASH_BYTES = 32

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function dummyTimingPath(username: string) {
  const dummySalt = crypto.randomBytes(16)
  const dummyInput = Buffer.concat([
    Buffer.from(username, 'utf-8'),
    dummySalt,
  ])
  const dummyKey = crypto.createHash('sha256').update(dummyInput).digest()
  const dummyVerifier = crypto.randomBytes(HASH_BYTES)
  const dummyCompare = Buffer.alloc(HASH_BYTES)
  for (let i = 0; i < HASH_BYTES; i++) {
    dummyCompare[i] = dummyKey[i] ^ dummyVerifier[i]
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, loginSchema)

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    const limits = await checkAuthRateLimit(body.username, ip)
    if (limits.isLocked || limits.ip || limits.user || limits.global) {
      throw new RateLimitError('Too many attempts. Try again later.')
    }

    const user = await prisma.user.findUnique({
      where: { username: body.username },
      select: {
        id: true,
        username: true,
        authVerifier: true,
        authSalt: true,
        encPrivPw: true,
        pwNonce: true,
        publicKey: true,
      },
    })

    if (!user) {
      dummyTimingPath(body.username)
      await recordAuthFailure(body.username, ip)
      throw new UnauthorizedError('Invalid credentials')
    }

    const clientVerifier = Buffer.from(body.authVerifier, 'base64')
    if (!constantTimeEqual(clientVerifier, user.authVerifier)) {
      await recordAuthFailure(body.username, ip)
      throw new UnauthorizedError('Invalid credentials')
    }

    await clearFailures(body.username)

    const token = createSession(user.id, user.username)
    await setSessionCookie(token)

    return success({
      encPrivPw: b64(user.encPrivPw),
      pwNonce: b64(user.pwNonce),
      publicKey: b64(user.publicKey),
    })
  } catch (err) {
    return error(err)
  }
}
