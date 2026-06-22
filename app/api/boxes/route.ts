import { NextRequest } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { success, error } from '@/lib/response'
import { parseBody, createBoxSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'

function generateSlug(): string {
  return crypto.randomBytes(16)
    .toString('base64url')
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const boxes = await prisma.poBox.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        greeting: true,
        slug: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        notify: true,
        passwordHash: true,
        createdAt: true,
        _count: { select: { messages: true } },
        messages: {
          where: { isRead: false },
          select: { id: true },
          take: 1,
        },
      },
    })

    const boxIds = boxes.map((b) => b.id)
    const latestMessages = boxIds.length > 0
      ? await prisma.message.groupBy({
          by: ['poBoxId'],
          where: { poBoxId: { in: boxIds } },
          _max: { createdAt: true },
        })
      : []

    const lastMessageMap = new Map(latestMessages.map((m) => [m.poBoxId, m._max.createdAt]))

    return success(
      boxes.map(({ messages: unreadMessages, passwordHash, ...box }: { messages: { id: string }[]; passwordHash: string | null } & Record<string, unknown>) => ({
        ...box,
        hasUnread: unreadMessages.length > 0,
        hasPassword: !!passwordHash,
        lastMessageAt: lastMessageMap.get(box.id as string)?.toISOString() ?? null,
      }))
    )
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const body = await parseBody(request, createBoxSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('create-box', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const slug = generateSlug()

    const box = await prisma.poBox.create({
      data: {
        ownerId: user.id,
        slug,
        label: body.label,
        greeting: body.greeting ?? null,
        passwordHash: body.password ? await bcrypt.hash(body.password, 12) : null,
      },
      select: { id: true, slug: true, label: true, greeting: true },
    })

    return success(box, 201)
  } catch (err) {
    return error(err)
  }
}
