import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError, BadRequestError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const { csrfToken } = await request.json() as { csrfToken?: string }
    const sessionId = request.cookies.get('session')?.value
    const csrfValid = await verifyAndConsumeCsrfToken('message-read', csrfToken ?? null, sessionId)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const message = await prisma.message.findFirst({
      where: { id, poBox: { ownerId: user.id } },
    })
    if (!message) {
      throw new NotFoundError('Message not found')
    }

    await prisma.message.update({
      where: { id },
      data: { isRead: true },
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

    const { csrfToken } = await request.json() as { csrfToken?: string }
    const sessionId = request.cookies.get('session')?.value
    const csrfValid = await verifyAndConsumeCsrfToken('message-delete', csrfToken ?? null, sessionId)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

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
