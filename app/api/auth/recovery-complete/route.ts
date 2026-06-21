import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, recoveryCompleteSchema } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, recoveryCompleteSchema)

    // TODO: Update user's auth verifier and wrapped private key (Phase 5)
    // const user = await prisma.user.update({
    //   where: { username: body.username },
    //   data: {
    //     authVerifier: Buffer.from(body.newAuthVerifier, 'base64'),
    //     authSalt: Buffer.from(body.newAuthSalt, 'base64'),
    //     encPrivPw: Buffer.from(body.newEncPrivPw, 'base64'),
    //     pwKdfSalt: Buffer.from(body.newPwKdfSalt, 'base64'),
    //     pwNonce: Buffer.from(body.newPwNonce, 'base64'),
    //   },
    // })

    return success({ message: 'Recovery complete' })
  } catch (err) {
    return error(err)
  }
}
