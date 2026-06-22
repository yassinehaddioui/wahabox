import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        encPrivRec: true,
        recKdfSalt: true,
        recNonce: true,
        recoveryCodeCreatedAt: true,
        createdAt: true,
      },
    })

    const hasRecoveryKey = !!(record?.encPrivRec && record?.recKdfSalt && record?.recNonce)

    const createdAt =
      record?.recoveryCodeCreatedAt?.toISOString() ??
      (hasRecoveryKey && record?.createdAt ? record.createdAt.toISOString() : null)

    return success({
      hasRecoveryKey,
      createdAt,
    })
  } catch (err) {
    return error(err)
  }
}
