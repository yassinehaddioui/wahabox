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
    if (await checkIpRate(`admin-boxes:${ip}`, WINDOW)) {
      throw new RateLimitError('Too many requests')
    }
    await getAdminUser(request)

    const { searchParams } = request.nextUrl
    const q = searchParams.get('q')
    const isActive = searchParams.get('isActive')
    const ownerId = searchParams.get('ownerId')
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10) || 20))

    const where: Prisma.PoBoxWhereInput = {}
    if (q) {
      where.OR = [
        { label: { contains: q, mode: 'insensitive' } },
        { owner: { username: { contains: q, mode: 'insensitive' } } },
      ]
    }
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false
    if (ownerId) where.ownerId = ownerId

    const [boxes, total] = await Promise.all([
      prisma.poBox.findMany({
        where,
        select: {
          id: true,
          label: true,
          slug: true,
          isActive: true,
          expiresAt: true,
          maxMessages: true,
          passwordHash: true,
          createdAt: true,
          owner: { select: { id: true, username: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.poBox.count({ where }),
    ])

    const mapped = boxes.map(({ passwordHash, _count, owner, ...b }) => ({
      ...b,
      hasPassword: !!passwordHash,
      messageCount: _count.messages,
      ownerId: owner.id,
      ownerUsername: owner.username,
    }))

    return success({
      boxes: mapped,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  } catch (err) {
    return error(err)
  }
}
