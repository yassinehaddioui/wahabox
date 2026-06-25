import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, loginSchema } from '@/lib/validation'
import { UnauthorizedError, BadRequestError, RateLimitError, MfaRequiredError, SuspendedError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'
import { createSession, setSessionCookie } from '@/lib/session'
import { checkAuthRateLimit, recordAuthFailure, clearFailures } from '@/lib/rate-limit'
import { getRedis } from '@/lib/redis'
import { checkTurnstile, TURNSTILE_PROOF_COOKIE } from '@/lib/turnstile'

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
  const dummyInput = Buffer.concat([Buffer.from(username, 'utf-8'), dummySalt])
  const dummyKey = crypto.createHash('sha256').update(dummyInput).digest()
  const dummyVerifier = crypto.randomBytes(HASH_BYTES)
  const dummyCompare = Buffer.alloc(HASH_BYTES)
  for (let i = 0; i < HASH_BYTES; i++) {
    dummyCompare[i] = dummyKey[i] ^ dummyVerifier[i]
  }
}

export async function POST(request: NextRequest) {
  let proofToken: string | null = null

  try {
    const body = await parseBody(request, loginSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('login', body.csrfToken ?? null)
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

    const turnstileResult = await checkTurnstile(
      request.cookies.get(TURNSTILE_PROOF_COOKIE)?.value,
      body.turnstileToken ?? null,
      ip,
    )
    proofToken = turnstileResult.setProofCookie
    if (!turnstileResult.verified) {
      throw new BadRequestError('CAPTCHA verification required. Please complete the challenge.')
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
        mfaEmail: true,
        mfaTotp: true,
        mfaPasskey: true,
        emailEncrypted: true,
        emailNonce: true,
        emailVerified: true,
        suspended: true,
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

    if (user.suspended) {
      throw new SuspendedError()
    }

    const methods: string[] = []
    if (user.mfaEmail && user.emailVerified && user.emailEncrypted && user.emailNonce) {
      methods.push('email')
    }
    if (user.mfaTotp) {
      methods.push('totp')
    }
    if (user.mfaPasskey) {
      methods.push('passkey')
    }

    if (methods.length > 0) {
      const mfaToken = crypto.randomBytes(32).toString('hex')
      const redis = await getRedis()
      await redis.set(
        `mfa:${mfaToken}`,
        JSON.stringify({
          userId: user.id,
          methods,
          verified: [] as string[],
          emailCodeHash: null,
          emailSentAt: null,
          emailAttempts: 0,
          totpAttempts: 0,
          verificationAttempts: 0,
          createdAt: Date.now(),
        }),
        'EX',
        300,
      )

      throw new MfaRequiredError('MFA required', mfaToken, methods)
    }

    const token = await createSession(user.id, user.username)
    await setSessionCookie(token)

    const res = success({
      encPrivPw: b64(user.encPrivPw),
      pwNonce: b64(user.pwNonce),
      publicKey: b64(user.publicKey),
    })
    if (proofToken) {
      res.cookies.set(TURNSTILE_PROOF_COOKIE, proofToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 2592000,
      })
    }
    return res
  } catch (err) {
    const errorRes = error(err)
    if (proofToken) {
      errorRes.cookies.set(TURNSTILE_PROOF_COOKIE, proofToken, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 2592000,
      })
    }
    return errorRes
  }
}
