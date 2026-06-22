import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const message = await prisma.message.findFirst({
      where: { id, poBox: { ownerId: user.id } },
    })
    if (!message) {
      throw new NotFoundError('Message not found')
    }

    await prisma.message.update({
      where: { id, readAt: null },
      data: { readAt: new Date() },
    })

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
    })
    if (!message) {
      throw new NotFoundError('Message not found')
    }

    await prisma.message.delete({ where: { id } })

    return success({ id })
  } catch (err) {
    return error(err)
  }
}
