import { type NextRequest } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { checkIpRate } from '@/lib/rate-limit'
import { success, error } from '@/lib/response'
import { RateLimitError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { type Prisma } from '@prisma/client'

const WINDOW = { windowMs: 60_000, max: 30 }

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'
    if (await checkIpRate(`admin-users:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    await getAdminUser(request)

    const { searchParams } = request.nextUrl
    const q = searchParams.get('q')
    const role = searchParams.get('role')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))

    const where: Prisma.UserWhereInput = {}
    if (q) where.username = { contains: q, mode: 'insensitive' }
    if (role === 'user' || role === 'admin') where.role = role

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          role: true,
          suspended: true,
          emailEncrypted: true,
          emailVerified: true,
          notificationsEnabled: true,
          mfaEmail: true,
          mfaTotp: true,
          mfaPasskey: true,
          createdAt: true,
          _count: { select: { poBoxes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])

    const mapped = users.map(({ emailEncrypted, _count, ...u }) => ({
      ...u,
      hasEmail: !!emailEncrypted,
      boxCount: _count.poBoxes,
    }))

    return success({
      users: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    return error(err)
  }
}
