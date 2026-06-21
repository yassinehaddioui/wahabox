import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, signupSchema } from '@/lib/validation'
import { BadRequestError, ConflictError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'
import { checkIpRate, checkGlobalRate } from '@/lib/rate-limit'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

const WINDOW = { windowMs: 60_000, max: 3 }

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    if (await checkIpRate(`signup:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many signups. Try again later.')
    }
    if (await checkGlobalRate()) {
      throw new RateLimitError('Too many requests')
    }

    const body = await parseBody(request, signupSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('signup', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const existing = await prisma.user.findUnique({
      where: { username: body.username },
    })
    if (existing) {
      throw new ConflictError('Username already taken')
    }

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
      },
    })

    return success({ username: body.username }, 201)
  } catch (err) {
    return error(err)
  }
}
