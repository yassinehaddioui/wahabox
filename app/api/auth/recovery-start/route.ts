import { NextRequest } from 'next/server'
import crypto from 'crypto'
import sodium from 'libsodium-wrappers-sumo'
import { success, error } from '@/lib/response'
import { parseBody, recoveryStartSchema } from '@/lib/validation'
import { BadRequestError, NotFoundError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { getRedis } from '@/lib/redis'
import prisma from '@/lib/prisma'
import { checkAuthRateLimit, recordAuthFailure } from '@/lib/rate-limit'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

function dummyTimingPath(username: string) {
  const dummyInput = Buffer.concat([Buffer.from(username, 'utf-8'), crypto.randomBytes(16)])
  crypto.createHash('sha256').update(dummyInput).digest()
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryStartSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('recovery-start', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    const limits = await checkAuthRateLimit(body.username, ip)
    if (limits.isLocked) {
      const seconds = Math.ceil(limits.lockoutRemainingMs / 1000)
      const minutes = Math.ceil(seconds / 60)
      const wait = minutes > 1 ? `${minutes} minutes` : `${seconds} seconds`
      throw new RateLimitError(`Account is locked. Try again in ${wait}.`)
    }
    if (limits.ip || limits.user || limits.global) {
      throw new RateLimitError('Too many attempts. Try again later.')
    }

    const user = await prisma.user.findUnique({
      where: { username: body.username },
      select: {
        encPrivRec: true,
        recKdfSalt: true,
        recNonce: true,
        publicKey: true,
        publicKeySign: true,
        encPrivSignPw: true,
        signNoncePw: true,
      },
    })

    if (!user) {
      dummyTimingPath(body.username)
      await recordAuthFailure(body.username, ip)
      throw new NotFoundError('Not found')
    }

    await sodium.ready

    const challenge = sodium.randombytes_buf(32)
    const sealedChallenge = sodium.crypto_box_seal(challenge, user.publicKey)
    const recoveryToken = crypto.randomBytes(32).toString('hex')

    const redis = await getRedis()
    await redis.set(
      `recovery:challenge:${recoveryToken}`,
      Buffer.from(challenge).toString('base64'),
      'EX',
      300,
    )

    return success({
      encPrivRec: b64(user.encPrivRec),
      recKdfSalt: b64(user.recKdfSalt),
      recNonce: b64(user.recNonce),
      publicKey: b64(user.publicKey),
      publicKeySign: user.publicKeySign ? b64(user.publicKeySign) : null,
      encPrivSignRec: user.encPrivSignPw ? b64(user.encPrivSignPw) : null,
      signNonceRec: user.signNoncePw ? b64(user.signNoncePw) : null,
      sealedChallenge: Buffer.from(sealedChallenge).toString('base64'),
      recoveryToken,
    })
  } catch (err) {
    return error(err)
  }
}
