import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, signupSchema } from '@/lib/validation'
import { ConflictError } from '@/lib/errors'
import prisma from '@/lib/prisma'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, signupSchema)

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
