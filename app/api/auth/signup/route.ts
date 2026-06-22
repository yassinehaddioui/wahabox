import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, signupSchema } from '@/lib/validation'
import { BadRequestError, ConflictError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { checkTurnstile, TURNSTILE_PROOF_COOKIE } from '@/lib/turnstile'
import prisma from '@/lib/prisma'
import { checkIpRate, checkGlobalRate } from '@/lib/rate-limit'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

const WINDOW = { windowMs: 60_000, max: 3 }

export async function POST(request: NextRequest) {
  let proofToken: string | null = null

  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (await checkIpRate(`signup:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many signups. Try again later.')
    }
    if (await checkGlobalRate()) {
      throw new RateLimitError('Too many requests')
    }

    const body = await parseBody(request, signupSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('signup', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const turnstileResult = await checkTurnstile(
      request.cookies.get(TURNSTILE_PROOF_COOKIE)?.value,
      body.turnstileToken ?? null,
      ip,
    )
    proofToken = turnstileResult.setProofCookie
    if (!turnstileResult.verified) {
      throw new BadRequestError('CAPTCHA verification failed')
    }

    try {
      await prisma.user.create({
        data: {
          username: body.username,
          authVerifier: b64(body.authVerifier),
          authSalt: b64(body.authSalt),
          publicKey: b64(body.publicKey),
          encPrivPw: b64(body.encPrivPw),
          pwKdfSalt: b64(body.pwKdfSalt),
          pwNonce: b64(body.pwNonce),
          encPrivRec: b64(body.encPrivRec),
          recKdfSalt: b64(body.recKdfSalt),
          recNonce: b64(body.recNonce),
          recoveryCodeCreatedAt: new Date(),
        },
      })
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'P2002') {
        throw new ConflictError('This username is already taken')
      }
      throw err
    }

    const res = success({ username: body.username }, 201)
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
