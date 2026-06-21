import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { parseBody, createBoxSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
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
        slug: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        notify: true,
        createdAt: true,
        _count: { select: { messages: true } },
      },
    })

    return success(boxes)
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const body = await parseBody(request, createBoxSchema)

    const slug = generateSlug()

    const box = await prisma.poBox.create({
      data: {
        ownerId: user.id,
        slug,
        label: body.label,
      },
      select: { id: true, slug: true, label: true },
    })

    return success(box, 201)
  } catch (err) {
    return error(err)
  }
}
