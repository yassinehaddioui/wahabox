import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, signupSchema } from '@/lib/validation'
import { ConflictError } from '@/lib/errors'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, signupSchema)

    const existing = await prisma.user.findUnique({
      where: { username: body.username },
    })
    if (existing) {
      throw new ConflictError('Username already taken')
    }

    // TODO: Insert user with crypto fields (Phase 3)
    // const user = await prisma.user.create({
    //   data: {
    //     username: body.username,
    //     authVerifier: Buffer.from(body.authVerifier, 'base64'),
    //     authSalt: Buffer.from(body.authSalt, 'base64'),
    //     publicKey: Buffer.from(body.publicKey, 'base64'),
    //     encPrivPw: Buffer.from(body.encPrivPw, 'base64'),
    //     pwKdfSalt: Buffer.from(body.pwKdfSalt, 'base64'),
    //     pwNonce: Buffer.from(body.pwNonce, 'base64'),
    //     encPrivRec: Buffer.from(body.encPrivRec, 'base64'),
    //     recKdfSalt: Buffer.from(body.recKdfSalt, 'base64'),
    //     recNonce: Buffer.from(body.recNonce, 'base64'),
    //   },
    // })

    return success({ username: body.username }, 201)
  } catch (err) {
    return error(err)
  }
}
