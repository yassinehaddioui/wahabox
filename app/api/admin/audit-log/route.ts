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
    if (await checkIpRate(`admin-audit:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    await getAdminUser(request)

    const { searchParams } = request.nextUrl
    const action = searchParams.get('action')
    const actorId = searchParams.get('actorId')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50))

    const where: Prisma.AuditLogWhereInput = {}
    if (action) where.action = action
    if (actorId) where.actorId = actorId

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    return success({
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    return error(err)
  }
}
