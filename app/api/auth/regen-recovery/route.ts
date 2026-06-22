import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'
import { notifyRecoveryRegenerated } from '@/lib/notifications'

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const { encPrivRec, recKdfSalt, recNonce, csrfToken } = await request.json() as {
      encPrivRec: string
      recKdfSalt: string
      recNonce: string
      csrfToken?: string
    }

    const csrfValid = await verifyAndConsumeCsrfToken('regen-recovery', csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    await prisma.user.update({
      where: { id: user.id },
      data: {
        encPrivRec: Buffer.from(encPrivRec, 'base64'),
        recKdfSalt: Buffer.from(recKdfSalt, 'base64'),
        recNonce: Buffer.from(recNonce, 'base64'),
        recoveryCodeCreatedAt: new Date(),
      },
    })

    notifyRecoveryRegenerated(user.id).catch(() => {})

    return success({ message: 'Recovery code updated' })
  } catch (err) {
    return error(err)
  }
}
