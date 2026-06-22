import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, mfaVerifySchema } from '@/lib/validation'
import { BadRequestError, UnauthorizedError } from '@/lib/errors'
import { getRedis } from '@/lib/redis'
import { decryptEmail } from '@/lib/email-crypto'
import { verifyTotp } from '@/lib/totp'
import { generateAuthOptions, verifyAuthResponse } from '@/lib/webauthn'
import { createSession, setSessionCookie } from '@/lib/session'
import prisma from '@/lib/prisma'
import ENV from '@/lib/env'

const MAX_ATTEMPTS = 10

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, mfaVerifySchema)

    const redis = await getRedis()
    const raw = await redis.get(`mfa:${body.mfaToken}`)
    if (!raw) throw new UnauthorizedError('MFA session expired')

    const session: {
      userId: string
      methods: string[]
      verified: string[]
      emailCodeHash: string | null
      emailSentAt: number | null
      emailAttempts: number
      totpAttempts: number
      verificationAttempts: number
    } = JSON.parse(raw)

    if (!session.methods.includes(body.method)) {
      throw new BadRequestError(`MFA method "${body.method}" is not enabled`)
    }

    if (session.verified.includes(body.method)) {
      throw new BadRequestError('This method is already verified')
    }

    session.verificationAttempts++
    if (session.verificationAttempts > MAX_ATTEMPTS) {
      await redis.del(`mfa:${body.mfaToken}`)
      throw new UnauthorizedError('Too many MFA attempts')
    }

    if (body.method === 'email') {
      if (!body.code || typeof body.code !== 'string' || body.code.length !== 6) {
        throw new BadRequestError('A 6-digit code is required')
      }
      if (!session.emailCodeHash) {
        throw new BadRequestError('No email code was sent. Request one first.')
      }

      session.emailAttempts++
      const codeHash = crypto.createHash('sha256').update(body.code).digest('hex')
      if (codeHash !== session.emailCodeHash) {
        if (session.emailAttempts >= 3) {
          session.emailCodeHash = null
          session.emailSentAt = null
        }
        await redis.set(`mfa:${body.mfaToken}`, JSON.stringify(session), 'EX', 300)
        throw new UnauthorizedError('Invalid code')
      }

      session.emailCodeHash = null
      session.emailAttempts = 0
      session.verified.push('email')
    } else if (body.method === 'totp') {
      if (!body.code || typeof body.code !== 'string' || body.code.length !== 6) {
        throw new BadRequestError('A 6-digit code is required')
      }

      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { totpSecret: true },
      })

      if (!user?.totpSecret) {
        throw new BadRequestError('TOTP is not configured')
      }

      session.totpAttempts++
      const secret = new TextDecoder().decode(new Uint8Array(user.totpSecret))

      if (!(await verifyTotp(secret, body.code))) {
        await redis.set(`mfa:${body.mfaToken}`, JSON.stringify(session), 'EX', 300)
        throw new UnauthorizedError('Invalid code')
      }

      session.verified.push('totp')
    } else if (body.method === 'passkey') {
      const credentials = await prisma.passkeyCredential.findMany({
        where: { userId: session.userId },
        select: { credentialId: true, publicKey: true, counter: true },
      })

      if (credentials.length === 0) {
        throw new BadRequestError('No passkeys registered')
      }

      const options = await generateAuthOptions(session.userId, credentials)
      await redis.set(`mfa:${body.mfaToken}`, JSON.stringify(session), 'EX', 300)

      return success({
        passkeyOptions: options,
      })
    }

    const allVerified = session.methods.every((m) => session.verified.includes(m))

    if (allVerified) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: { id: true, username: true, encPrivPw: true, pwNonce: true, publicKey: true },
      })

      if (!user) throw new UnauthorizedError('User not found')

      await redis.del(`mfa:${body.mfaToken}`)

      const token = await createSession(user.id, user.username)
      await setSessionCookie(token)

      return success({
        mfaComplete: true,
        encPrivPw: b64(user.encPrivPw),
        pwNonce: b64(user.pwNonce),
        publicKey: b64(user.publicKey),
      })
    }

    await redis.set(`mfa:${body.mfaToken}`, JSON.stringify(session), 'EX', 300)

    return success({
      verified: session.verified,
      pending: session.methods.filter((m) => !session.verified.includes(m)),
    })
  } catch (err) {
    return error(err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { mfaToken, assertion } = (await request.json()) as { mfaToken?: string; assertion?: any }

    if (!mfaToken || !assertion) {
      throw new BadRequestError('mfaToken and assertion are required')
    }

    const redis = await getRedis()
    const raw = await redis.get(`mfa:${mfaToken}`)
    if (!raw) throw new UnauthorizedError('MFA session expired')

    const session: {
      userId: string
      methods: string[]
      verified: string[]
      verificationAttempts: number
    } = JSON.parse(raw)

    if (session.verified.includes('passkey')) {
      throw new BadRequestError('Passkey already verified')
    }

    const credentials = await prisma.passkeyCredential.findMany({
      where: { userId: session.userId },
    })

    for (const cred of credentials) {
      if (cred.credentialId) {
        try {
          const result = await verifyAuthResponse(
            session.userId,
            {
              credentialId: new Uint8Array(cred.credentialId),
              publicKey: new Uint8Array(cred.publicKey),
              counter: cred.counter,
            },
            assertion,
          )

          if (result.verified) {
            await prisma.passkeyCredential.update({
              where: { id: cred.id },
              data: { counter: result.newCounter, lastUsedAt: new Date() },
            })

            session.verified.push('passkey')

            const allVerified = session.methods.every((m) => session.verified.includes(m))

            if (allVerified) {
              const user = await prisma.user.findUnique({
                where: { id: session.userId },
                select: {
                  id: true,
                  username: true,
                  encPrivPw: true,
                  pwNonce: true,
                  publicKey: true,
                },
              })

              if (!user) throw new UnauthorizedError('User not found')

              await redis.del(`mfa:${mfaToken}`)

              const token = await createSession(user.id, user.username)
              await setSessionCookie(token)

              return success({
                mfaComplete: true,
                encPrivPw: b64(user.encPrivPw),
                pwNonce: b64(user.pwNonce),
                publicKey: b64(user.publicKey),
              })
            }

            await redis.set(`mfa:${mfaToken}`, JSON.stringify(session), 'EX', 300)

            return success({
              verified: session.verified,
              pending: session.methods.filter((m) => !session.verified.includes(m)),
            })
          }
        } catch {
          continue
        }
      }
    }

    throw new UnauthorizedError('Passkey verification failed')
  } catch (err) {
    return error(err)
  }
}
