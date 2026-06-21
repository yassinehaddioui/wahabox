import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, recoveryCompleteSchema } from '@/lib/validation'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

function b64(s: string) {
  return Buffer.from(s, 'base64')
}

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryCompleteSchema)

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
