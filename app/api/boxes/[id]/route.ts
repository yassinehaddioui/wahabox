import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, updateBoxSchema } from '@/lib/validation'
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
    const body = await parseBody(request, updateBoxSchema)

    const box = await prisma.poBox.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!box) {
      throw new NotFoundError('Box not found')
    }

    const data: Record<string, unknown> = {}
    if (body.label !== undefined) data.label = body.label
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.expiresAt !== undefined) {
      data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    }
    if (body.maxMessages !== undefined) data.maxMessages = body.maxMessages
    if (body.notify !== undefined) data.notify = body.notify
    if (body.rotateSlug === true) {
      data.slug = crypto.randomBytes(16).toString('base64url')
    }

    const updated = await prisma.poBox.update({
      where: { id },
      data,
      select: {
        id: true,
        label: true,
        isActive: true,
        slug: true,
        expiresAt: true,
        maxMessages: true,
        notify: true,
      },
    })

    return success(updated)
  } catch (err) {
    return error(err)
  }
}
