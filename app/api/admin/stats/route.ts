import { NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { success, error } from '@/lib/response'
import { RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'

const STATS_WINDOW = { windowMs: 60_000, max: 30 }

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
               request.headers.get('x-real-ip') ?? 'unknown'
    if (await checkIpRate(`admin-stats:${ip}`, STATS_WINDOW)) {
      throw new RateLimitError('Too many requests')
    }

    await getAdminUser(request)

    const [totalUsers, totalBoxes, totalMessages, adminCount,
           totalSecureMessages, readSecureMessages, destroyedSecureMessages,
           autoDestructSecureMessages, passwordProtectedSecureMessages,
           pendingSecureMessages] = await Promise.all([
      prisma.user.count(),
      prisma.poBox.count(),
      prisma.message.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.secureMessage.count(),
      prisma.secureMessage.count({ where: { readAt: { not: null } } }),
      prisma.secureMessage.count({ where: { isDestroyed: true } }),
      prisma.secureMessage.count({ where: { autoDestruct: true } }),
      prisma.secureMessage.count({ where: { passwordHash: { not: null } } }),
      prisma.secureMessage.count({ where: { readAt: null, isDestroyed: false } }),
    ])

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [newUsers7d, newBoxes7d, newMessages7d, newSecureMessages7d,
           newUsers30d, newBoxes30d, newMessages30d, newSecureMessages30d,
           activeBoxes, inactiveBoxes] = await Promise.all([
      prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.poBox.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.message.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.secureMessage.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.poBox.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.message.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.secureMessage.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.poBox.count({ where: { isActive: true } }),
      prisma.poBox.count({ where: { isActive: false } }),
    ])

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const [
      secureSent24h, messageSent24h,
      secureReadMessages, dropReadMessages,
      secureSenderGroups, dropBoxGroups,
    ] = await Promise.all([
      prisma.secureMessage.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.message.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
      prisma.secureMessage.findMany({
        where: { readAt: { not: null } },
        select: { createdAt: true, readAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.message.findMany({
        where: { readAt: { not: null } },
        select: { createdAt: true, readAt: true },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
      prisma.secureMessage.groupBy({
        by: ['senderId'],
        _count: { _all: true },
        orderBy: { _count: { senderId: 'desc' } },
        take: 10,
      }),
      prisma.message.groupBy({
        by: ['poBoxId'],
        _count: { _all: true },
        orderBy: { _count: { poBoxId: 'desc' } },
        take: 10,
      }),
    ])

    const senderIds = secureSenderGroups.map(g => g.senderId)
    const boxIds = dropBoxGroups.map(g => g.poBoxId)

    const [senderUsers, dropBoxes] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: senderIds } },
        select: { id: true, username: true },
      }),
      prisma.poBox.findMany({
        where: { id: { in: boxIds } },
        select: { id: true, label: true },
      }),
    ])

    const secureReadRate = totalSecureMessages === 0
      ? 0
      : Math.round((readSecureMessages / totalSecureMessages) * 100)

    const avgSecureReadHours = secureReadMessages.length === 0
      ? 0
      : Math.round(
          (secureReadMessages.reduce((sum, m) => sum + (m.readAt!.getTime() - m.createdAt.getTime()), 0)
           / secureReadMessages.length
           / 3600000) * 10
        ) / 10

    const avgDropReadHours = dropReadMessages.length === 0
      ? 0
      : Math.round(
          (dropReadMessages.reduce((sum, m) => sum + (m.readAt!.getTime() - m.createdAt.getTime()), 0)
           / dropReadMessages.length
           / 3600000) * 10
        ) / 10

    const userMap = new Map(senderUsers.map(u => [u.id, u.username]))
    const topSecureSenders = secureSenderGroups
      .filter(g => userMap.has(g.senderId))
      .map(g => ({
        userId: g.senderId,
        username: userMap.get(g.senderId)!,
        count: g._count._all,
      }))

    const boxMap = new Map(dropBoxes.map(b => [b.id, b.label]))
    const topDropBoxes = dropBoxGroups
      .filter(g => boxMap.has(g.poBoxId))
      .map(g => ({
        boxId: g.poBoxId,
        label: boxMap.get(g.poBoxId)!,
        count: g._count._all,
      }))

    return success({
      totalUsers,
      totalBoxes,
      totalMessages,
      adminCount,
      newUsers7d,
      newBoxes7d,
      newMessages7d,
      newUsers30d,
      newBoxes30d,
      newMessages30d,
      activeBoxes,
      inactiveBoxes,
      totalSecureMessages,
      readSecureMessages,
      destroyedSecureMessages,
      autoDestructSecureMessages,
      passwordProtectedSecureMessages,
      pendingSecureMessages,
      newSecureMessages7d,
      newSecureMessages30d,
      secureReadRate,
      secureSent24h,
      messageSent24h,
      avgSecureReadHours,
      avgDropReadHours,
      topSecureSenders,
      topDropBoxes,
    })
  } catch (err) {
    return error(err)
  }
}
