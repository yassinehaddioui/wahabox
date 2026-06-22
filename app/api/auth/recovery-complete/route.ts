import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, recoveryCompleteSchema } from '@/lib/validation'
import { BadRequestError, NotFoundError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { getRedis } from '@/lib/redis'
import prisma from '@/lib/prisma'
import { checkIpRate, checkUserRate, checkGlobalRate, clearFailures } from '@/lib/rate-limit'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

const WINDOW = { windowMs: 60_000, max: 5 }

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryCompleteSchema)

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (
      (await checkIpRate(`recovery-complete:${ip}`, WINDOW)) ||
      (await checkUserRate(body.username, WINDOW))
    ) {
      throw new RateLimitError('Too many requests')
    }
    if (await checkGlobalRate()) {
      throw new RateLimitError('Too many requests')
    }

    const csrfValid = await verifyAndConsumeCsrfToken('recovery-complete', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const user = await prisma.user.findUnique({
      where: { username: body.username },
      select: { id: true },
    })

    if (!user) {
      throw new NotFoundError('Not found')
    }

    const redis = await getRedis()
    const challengeKey = `recovery:challenge:${body.recoveryToken}`
    const storedChallenge = await redis.getdel(challengeKey)

    if (!storedChallenge) {
      throw new BadRequestError('Invalid or expired recovery token')
    }

    if (
      !crypto.timingSafeEqual(
        Buffer.from(body.decryptedChallenge, 'base64'),
        Buffer.from(storedChallenge, 'base64'),
      )
    ) {
      throw new BadRequestError('Recovery challenge verification failed')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        authVerifier: b64(body.newAuthVerifier),
        authSalt: b64(body.newAuthSalt),
        encPrivPw: b64(body.newEncPrivPw),
        pwKdfSalt: b64(body.newPwKdfSalt),
        pwNonce: b64(body.newPwNonce),
        tokenVersion: { increment: 1 },
      },
    })

    await clearFailures(body.username)

    return success({ message: 'Password updated' })
  } catch (err) {
    return error(err)
  }
}
