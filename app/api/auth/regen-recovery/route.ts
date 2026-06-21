import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const { encPrivRec, recKdfSalt, recNonce } = await request.json() as {
      encPrivRec: string
      recKdfSalt: string
      recNonce: string
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        encPrivRec: Buffer.from(encPrivRec, 'base64'),
        recKdfSalt: Buffer.from(recKdfSalt, 'base64'),
        recNonce: Buffer.from(recNonce, 'base64'),
        recoveryCodeCreatedAt: new Date(),
      },
    })

    return success({ message: 'Recovery code updated' })
  } catch (err) {
    return error(err)
  }
}
