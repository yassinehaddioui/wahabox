import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import { writeAuditLog } from '@/lib/admin-audit'
import prisma from '@/lib/prisma'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const message = await prisma.message.findFirst({
      where: { id, poBox: { ownerId: user.id } },
      select: { id: true, poBox: { select: { label: true } } },
    })
    if (!message) {
      throw new NotFoundError('Message not found')
    }

    const updated = await prisma.message.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date() },
    })

    // Auto-decrypt and a manual decrypt can submit this PATCH at the same time.
    // Only the first request changes readAt; later requests should still succeed.
    if (updated.count > 0) {
      writeAuditLog({
        actorId: user.id,
        actorUsername: user.username,
        action: 'message.read',
        targetType: 'message',
        targetId: id,
        targetLabel: message.poBox.label,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      })
    }

    return success({ id })
  } catch (err) {
    return error(err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const message = await prisma.message.findFirst({
      where: { id, poBox: { ownerId: user.id } },
      select: { id: true, poBox: { select: { label: true } } },
    })
    if (!message) {
      throw new NotFoundError('Message not found')
    }

    await prisma.message.delete({ where: { id } })

    writeAuditLog({
      actorId: user.id,
      actorUsername: user.username,
      action: 'message.delete',
      targetType: 'message',
      targetId: id,
      targetLabel: message.poBox.label,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    })

    return success({ id })
  } catch (err) {
    return error(err)
  }
}
