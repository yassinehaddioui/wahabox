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
           autoDestructSecureMessages, passwordProtectedSecureMessages] = await Promise.all([
      prisma.user.count(),
      prisma.poBox.count(),
      prisma.message.count(),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.secureMessage.count(),
      prisma.secureMessage.count({ where: { readAt: { not: null } } }),
      prisma.secureMessage.count({ where: { isDestroyed: true } }),
      prisma.secureMessage.count({ where: { autoDestruct: true } }),
      prisma.secureMessage.count({ where: { passwordHash: { not: null } } }),
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
      newSecureMessages7d,
      newSecureMessages30d,
    })
  } catch (err) {
    return error(err)
  }
}
