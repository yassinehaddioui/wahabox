import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const message = await prisma.secureMessage.findUnique({
      where: { id },
      select: {
        msgNonce: true,
        passwordHash: true,
        passwordSalt: true,
        startDate: true,
        endDate: true,
        isDestroyed: true,
        autoDestruct: true,
        readAt: true,
      },
    })

    if (!message || message.isDestroyed) {
      throw new NotFoundError('Not found')
    }

    return success({
      hasPassword: !!message.passwordHash,
      passwordSalt: message.passwordSalt
        ? Buffer.from(message.passwordSalt).toString('base64')
        : null,
      msgNonce: Buffer.from(message.msgNonce).toString('base64'),
      startDate: message.startDate?.toISOString() ?? null,
      endDate: message.endDate?.toISOString() ?? null,
      isDestroyed: message.isDestroyed,
      autoDestruct: message.autoDestruct,
      readAt: message.readAt?.toISOString() ?? null,
    })
  } catch (err) {
    return error(err)
  }
}
