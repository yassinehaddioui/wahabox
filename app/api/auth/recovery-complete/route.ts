import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, recoveryCompleteSchema } from '@/lib/validation'
import { BadRequestError, NotFoundError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'
import { checkIpRate, checkUserRate, checkGlobalRate } from '@/lib/rate-limit'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

const WINDOW = { windowMs: 60_000, max: 5 }

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryCompleteSchema)

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    if (await checkIpRate(`recovery-complete:${ip}`, WINDOW) ||
        await checkUserRate(body.username, WINDOW)) {
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
      throw new NotFoundError('User not found')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        authVerifier: b64(body.newAuthVerifier),
        authSalt: b64(body.newAuthSalt),
        encPrivPw: b64(body.newEncPrivPw),
        pwKdfSalt: b64(body.newPwKdfSalt),
        pwNonce: b64(body.newPwNonce),
      },
    })

    return success({ message: 'Password updated' })
  } catch (err) {
    return error(err)
  }
}
