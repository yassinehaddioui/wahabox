import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError, UnauthorizedError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { clearSessionCookie } from '@/lib/session'
import prisma from '@/lib/prisma'
import { checkIpRate, checkGlobalRate } from '@/lib/rate-limit'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const WINDOW = { windowMs: 60_000, max: 5 }

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { authSalt: true, pwKdfSalt: true, encPrivPw: true, pwNonce: true },
    })

    if (!record) {
      throw new UnauthorizedError('User not found')
    }

    return success({
      authSalt: Buffer.from(record.authSalt).toString('base64'),
      pwKdfSalt: Buffer.from(record.pwKdfSalt).toString('base64'),
      encPrivPw: Buffer.from(record.encPrivPw).toString('base64'),
      pwNonce: Buffer.from(record.pwNonce).toString('base64'),
    })
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    if (await checkIpRate(`password:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    if (await checkGlobalRate()) {
      throw new RateLimitError('Too many requests')
    }

    const body = await request.json() as {
      currentAuthVerifier?: string
      newAuthVerifier?: string
      newAuthSalt?: string
      newEncPrivPw?: string
      newPwKdfSalt?: string
      newPwNonce?: string
      csrfToken?: string
    }

    const csrfValid = await verifyAndConsumeCsrfToken('password-change', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const { currentAuthVerifier, newAuthVerifier, newAuthSalt, newEncPrivPw, newPwKdfSalt, newPwNonce } = body

    if (!currentAuthVerifier || !newAuthVerifier || !newAuthSalt || !newEncPrivPw || !newPwKdfSalt || !newPwNonce) {
      throw new BadRequestError('Missing required fields')
    }

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { authVerifier: true },
    })

    if (!record) {
      throw new UnauthorizedError('User not found')
    }

    const clientVerifier = Buffer.from(currentAuthVerifier, 'base64')
    if (!constantTimeEqual(clientVerifier, record.authVerifier)) {
      throw new UnauthorizedError('Current password is incorrect')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        authVerifier: b64(newAuthVerifier),
        authSalt: b64(newAuthSalt),
        encPrivPw: b64(newEncPrivPw),
        pwKdfSalt: b64(newPwKdfSalt),
        pwNonce: b64(newPwNonce),
        tokenVersion: { increment: 1 },
      },
    })

    await clearSessionCookie()

    return success({ message: 'Password updated' })
  } catch (err) {
    return error(err)
  }
}
