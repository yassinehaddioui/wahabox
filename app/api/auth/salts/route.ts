import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { checkIpRate, checkGlobalRate } from '@/lib/rate-limit'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

function dummySalt(): string {
  return crypto.randomBytes(16).toString('base64')
}

const WINDOW = { windowMs: 5_000, max: 3 }

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown'

    if (await checkIpRate(`salts:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    if (await checkGlobalRate()) {
      throw new RateLimitError('Too many requests')
    }

    const { username } = await request.json() as { username?: string }
    if (!username || typeof username !== 'string') {
      return success({ pwKdfSalt: dummySalt(), authSalt: dummySalt() })
    }

    const normalized = username.toLowerCase()

    const user = await prisma.user.findUnique({
      where: { username: normalized },
      select: { pwKdfSalt: true, authSalt: true },
    })

    if (!user) {
      return success({ pwKdfSalt: dummySalt(), authSalt: dummySalt() })
    }

    return success({
      pwKdfSalt: b64(user.pwKdfSalt),
      authSalt: b64(user.authSalt),
    })
  } catch (err) {
    return error(err)
  }
}
