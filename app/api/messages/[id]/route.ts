import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    // TODO: Mark message as read (Phase 8)
    // const message = await prisma.message.findFirst({
    //   where: { id, poBox: { ownerId: user.id } },
    // })
    // if (!message) throw new NotFoundError('Message not found')
    //
    // await prisma.message.update({
    //   where: { id },
    //   data: { isRead: true },
    // })

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

    // TODO: Delete message (Phase 8)
    // const message = await prisma.message.findFirst({
    //   where: { id, poBox: { ownerId: user.id } },
    // })
    // if (!message) throw new NotFoundError('Message not found')
    //
    // await prisma.message.delete({ where: { id } })

    return success({ id })
  } catch (err) {
    return error(err)
  }
}
