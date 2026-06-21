import { NextRequest } from 'next/server'
import crypto from 'crypto'
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
        createdAt: true,
        _count: { select: { messages: true } },
        messages: {
          where: { isRead: false },
          select: { id: true },
          take: 1,
        },
      },
    })

    return success(
      boxes.map(({ messages: unreadMessages, ...box }: { messages: { id: string }[] } & Record<string, unknown>) => ({
        ...box,
        hasUnread: unreadMessages.length > 0,
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
      },
      select: { id: true, slug: true, label: true, greeting: true },
    })

    return success(box, 201)
  } catch (err) {
    return error(err)
  }
}
