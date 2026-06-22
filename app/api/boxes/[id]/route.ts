import { NextRequest } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { success, error } from '@/lib/response'
import { parseBody, updateBoxSchema, deleteBoxSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError, NotFoundError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params
    const body = await parseBody(request, updateBoxSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('edit-box', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const box = await prisma.poBox.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!box) {
      throw new NotFoundError('Box not found')
    }

    const data: Record<string, unknown> = {}
    if (body.label !== undefined) data.label = body.label
    if (body.greeting !== undefined) data.greeting = body.greeting
    if (body.isActive !== undefined) data.isActive = body.isActive
    if (body.expiresAt !== undefined) {
      data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
    }
    if (body.maxMessages !== undefined) data.maxMessages = body.maxMessages
    if (body.notify !== undefined) data.notify = body.notify
    if (body.password !== undefined) {
      data.passwordHash = body.password ? await bcrypt.hash(body.password, 12) : null
    }
    if (body.rotateSlug === true) {
      data.slug = crypto.randomBytes(16).toString('base64url')
    }

    const updated = await prisma.poBox.update({
      where: { id },
      data,
      select: {
        id: true,
        label: true,
        greeting: true,
        isActive: true,
        slug: true,
        expiresAt: true,
        maxMessages: true,
        notify: true,
        passwordHash: true,
      },
    })

    return success({
      id: updated.id,
      label: updated.label,
      greeting: updated.greeting,
      isActive: updated.isActive,
      slug: updated.slug,
      expiresAt: updated.expiresAt,
      maxMessages: updated.maxMessages,
      notify: updated.notify,
      hasPassword: !!updated.passwordHash,
    })
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
    const body = await parseBody(request, deleteBoxSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('delete-box', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const box = await prisma.poBox.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!box) {
      throw new NotFoundError('Box not found')
    }

    await prisma.poBox.delete({ where: { id } })

    return success({ id })
  } catch (err) {
    return error(err)
  }
}
