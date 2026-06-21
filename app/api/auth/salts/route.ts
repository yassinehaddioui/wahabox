import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success } from '@/lib/response'
import prisma from '@/lib/prisma'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

function dummySalt(): string {
  return crypto.randomBytes(16).toString('base64')
}

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json() as { username?: string }
    if (!username || typeof username !== 'string') {
      return success({ pwKdfSalt: dummySalt(), authSalt: dummySalt() })
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { pwKdfSalt: true, authSalt: true },
    })

    if (!user) {
      return success({ pwKdfSalt: dummySalt(), authSalt: dummySalt() })
    }

    return success({
      pwKdfSalt: b64(user.pwKdfSalt),
      authSalt: b64(user.authSalt),
    })
  } catch {
    return success({ pwKdfSalt: dummySalt(), authSalt: dummySalt() })
  }
}
