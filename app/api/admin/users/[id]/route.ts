import { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { success, error } from '@/lib/response'
import { BadRequestError, NotFoundError, RateLimitError } from '@/lib/errors'
import { writeAuditLog } from '@/lib/admin-audit'
import prisma from '@/lib/prisma'

const WINDOW = { windowMs: 300_000, max: 20 }
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
    if (await checkIpRate(`admin-user-detail:${ip}`, GET_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        emailEncrypted: true,
        emailVerified: true,
        notificationsEnabled: true,
        mfaEmail: true,
        mfaTotp: true,
        mfaPasskey: true,
        keyVersion: true,
        tokenVersion: true,
        createdAt: true,
        _count: { select: { poBoxes: true, passkeyCredentials: true } },
      },
    })
    if (!user) throw new NotFoundError('User not found')

    const messageCount = await prisma.message.count({
      where: { poBox: { ownerId: id } },
    })

    return success({
      ...user,
      hasEmail: !!user.emailEncrypted,
      emailEncrypted: undefined,
      _count: undefined,
      boxCount: user._count.poBoxes,
      passkeyCount: user._count.passkeyCredentials,
      messageCount,
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
    if (await checkIpRate(`admin-user-action:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }

    const { action, csrfToken } = (await request.json()) as {
      action?: string
      csrfToken?: string
    }
    if (!action || typeof action !== 'string')
      throw new BadRequestError('Action is required')
    if (!csrfToken || typeof csrfToken !== 'string')
      throw new BadRequestError('CSRF token is required')

    const csrfValid = await verifyAndConsumeCsrfToken('admin-user-action', csrfToken)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, role: true, tokenVersion: true },
    })
    if (!targetUser) throw new NotFoundError('User not found')

    switch (action) {
      case 'promote': {
        if (targetUser.role === 'admin')
          return success({ message: 'Already admin', action })
        await prisma.user.update({ where: { id }, data: { role: 'admin' } })
        await writeAuditLog({
          actorId: adminUser.id,
          actorUsername: adminUser.username,
          action: 'admin.promote',
          targetType: 'user',
          targetId: id,
          targetLabel: targetUser.username,
          ip,
        })
        return success({ message: 'User promoted to admin', action })
      }
      case 'demote': {
        if (targetUser.id === adminUser.id)
          throw new BadRequestError('Cannot demote yourself')
        if (targetUser.role !== 'admin')
          return success({ message: 'Already user', action })
        await prisma.user.update({ where: { id }, data: { role: 'user' } })
        await writeAuditLog({
          actorId: adminUser.id,
          actorUsername: adminUser.username,
          action: 'admin.demote',
          targetType: 'user',
          targetId: id,
          targetLabel: targetUser.username,
          ip,
        })
        return success({ message: 'User demoted to user', action })
      }
      case 'force_logout': {
        if (targetUser.id === adminUser.id)
          throw new BadRequestError('Cannot force-logout yourself')
        await prisma.user.update({
          where: { id },
          data: { tokenVersion: { increment: 1 } },
        })
        await writeAuditLog({
          actorId: adminUser.id,
          actorUsername: adminUser.username,
          action: 'admin.force_logout',
          targetType: 'user',
          targetId: id,
          targetLabel: targetUser.username,
          ip,
        })
        return success({ message: 'User force-logged out', action })
      }
      default:
        throw new BadRequestError(`Unknown action: ${action}`)
    }
  } catch (err) {
    return error(err)
  }
}
