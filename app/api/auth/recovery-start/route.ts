import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, recoveryStartSchema } from '@/lib/validation'
import { NotFoundError, RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { checkAuthRateLimit, recordAuthFailure, clearFailures } from '@/lib/rate-limit'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

function dummyTimingPath(username: string) {
  const dummyInput = Buffer.concat([
    Buffer.from(username, 'utf-8'),
    crypto.randomBytes(16),
  ])
  crypto.createHash('sha256').update(dummyInput).digest()
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryStartSchema)

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
        encPrivRec: true,
        recKdfSalt: true,
        recNonce: true,
      },
    })

    if (!user) {
      dummyTimingPath(body.username)
      await recordAuthFailure(body.username, ip)
      throw new NotFoundError('User not found')
    }

    await clearFailures(body.username)

    return success({
      encPrivRec: b64(user.encPrivRec),
      recKdfSalt: b64(user.recKdfSalt),
      recNonce: b64(user.recNonce),
    })
  } catch (err) {
    return error(err)
  }
}
