import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, mfaRecoverSchema } from '@/lib/validation'
import { BadRequestError, UnauthorizedError } from '@/lib/errors'
import { getRedis } from '@/lib/redis'
import { verifyRecoveryCode } from '@/lib/totp'
import { createSession, setSessionCookie } from '@/lib/session'
import prisma from '@/lib/prisma'

const MAX_ATTEMPTS = 3

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, mfaRecoverSchema)

    const redis = await getRedis()
    const raw = await redis.get(`mfa:${body.mfaToken}`)
    if (!raw) throw new UnauthorizedError('MFA session expired')

    const session: {
      userId: string
      recoveryAttempts?: number
    } = JSON.parse(raw)

    const attempts = (session.recoveryAttempts ?? 0) + 1
    if (attempts > MAX_ATTEMPTS) {
      await redis.del(`mfa:${body.mfaToken}`)
      throw new UnauthorizedError('Too many recovery attempts')
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, username: true, encPrivPw: true, pwNonce: true, publicKey: true, mfaRecoveryCodes: true },
    })

    if (!user?.mfaRecoveryCodes) {
      throw new BadRequestError('No recovery codes configured')
    }

    const storedHashes: string[] = JSON.parse(new TextDecoder().decode(new Uint8Array(user.mfaRecoveryCodes)))

    if (!verifyRecoveryCode(body.recoveryCode, storedHashes)) {
      session.recoveryAttempts = attempts
      await redis.set(`mfa:${body.mfaToken}`, JSON.stringify(session), 'EX', 300)
      throw new UnauthorizedError('Invalid recovery code')
    }

    await redis.del(`mfa:${body.mfaToken}`)

    const token = createSession(user.id, user.username)
    await setSessionCookie(token)

    return success({
      mfaComplete: true,
      encPrivPw: b64(user.encPrivPw),
      pwNonce: b64(user.pwNonce),
      publicKey: b64(user.publicKey),
    })
  } catch (err) {
    return error(err)
  }
}
