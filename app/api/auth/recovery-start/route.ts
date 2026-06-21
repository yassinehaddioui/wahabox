import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, recoveryStartSchema } from '@/lib/validation'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

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
      throw new NotFoundError('User not found')
    }

    return success({
      encPrivRec: b64(user.encPrivRec),
      recKdfSalt: b64(user.recKdfSalt),
      recNonce: b64(user.recNonce),
    })
  } catch (err) {
    return error(err)
  }
}
