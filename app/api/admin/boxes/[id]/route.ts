import { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { success, error } from '@/lib/response'
import { BadRequestError, NotFoundError, RateLimitError } from '@/lib/errors'
import { writeAuditLog } from '@/lib/admin-audit'
import prisma from '@/lib/prisma'

const PATCH_WINDOW = { windowMs: 300_000, max: 30 }
const DELETE_WINDOW = { windowMs: 900_000, max: 5 }
const GET_WINDOW = { windowMs: 60_000, max: 60 }

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await getAdminUser(request)

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-box-detail:${ip}`, GET_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }

    const box = await prisma.poBox.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        greeting: true,
        slug: true,
        notify: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        createdAt: true,
        passwordHash: true,
        owner: { select: { id: true, username: true } },
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, readAt: true, createdAt: true },
        },
      },
    })
    if (!box) throw new NotFoundError('Box not found')

    return success({
      ...box,
      hasPassword: !!box.passwordHash,
      passwordHash: undefined,
      ownerUsername: box.owner.username,
      ownerId: box.owner.id,
      owner: undefined,
      messageCount: box._count.messages,
      recentMessages: box.messages,
      _count: undefined,
      messages: undefined,
    })
  } catch (err) {
    return error(err)
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const adminUser = await getAdminUser(request)

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-box-action:${ip}`, PATCH_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }

    const { isActive, csrfToken } = (await request.json()) as {
      isActive?: boolean
      csrfToken?: string
    }
    if (isActive === undefined || isActive === null || typeof isActive !== 'boolean') {
      throw new BadRequestError('isActive is required')
    }
    if (!csrfToken || typeof csrfToken !== 'string') {
      throw new BadRequestError('CSRF token is required')
    }

    const csrfValid = await verifyAndConsumeCsrfToken('admin-box-action', csrfToken)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const box = await prisma.poBox.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        isActive: true,
        owner: { select: { username: true } },
      },
    })
    if (!box) throw new NotFoundError('Box not found')

    await prisma.poBox.update({ where: { id }, data: { isActive } })

    const action: 'admin.box_activate' | 'admin.box_deactivate' = isActive
      ? 'admin.box_activate'
      : 'admin.box_deactivate'

    await writeAuditLog({
      actorId: adminUser.id,
      actorUsername: adminUser.username,
      action,
      targetType: 'box',
      targetId: id,
      targetLabel: box.label,
      metadata: { ownerUsername: box.owner.username },
      ip,
    })

    return success({ id, isActive, label: box.label })
  } catch (err) {
    return error(err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const adminUser = await getAdminUser(request)

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-box-delete:${ip}`, DELETE_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }

    const { csrfToken } = (await request.json()) as {
      csrfToken?: string
    }
    if (!csrfToken || typeof csrfToken !== 'string') {
      throw new BadRequestError('CSRF token is required')
    }

    const csrfValid = await verifyAndConsumeCsrfToken('admin-box-delete', csrfToken)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const box = await prisma.poBox.findUnique({
      where: { id },
      select: {
        id: true,
        label: true,
        owner: { select: { username: true } },
        _count: { select: { messages: true } },
      },
    })
    if (!box) throw new NotFoundError('Box not found')

    // Audit BEFORE delete (fire-and-forget; failure must not block deletion)
    await writeAuditLog({
      actorId: adminUser.id,
      actorUsername: adminUser.username,
      action: 'admin.box_delete',
      targetType: 'box',
      targetId: id,
      targetLabel: box.label,
      metadata: {
        ownerUsername: box.owner.username,
        messageCount: box._count.messages,
      },
      ip,
    })

    await prisma.poBox.delete({ where: { id } })

    return success({ message: 'Box deleted' })
  } catch (err) {
    return error(err)
  }
}
