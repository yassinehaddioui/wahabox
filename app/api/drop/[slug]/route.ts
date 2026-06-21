import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, submitMessageSchema } from '@/lib/validation'
import { BadRequestError, NotFoundError } from '@/lib/errors'
import { notifyNewMessage } from '@/lib/notifications'
import prisma from '@/lib/prisma'

const MAX_CIPHERTEXT_SIZE = 10 * 1024 // 10 KiB

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    const box = await prisma.poBox.findUnique({
      where: { slug },
      select: {
        label: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        owner: { select: { publicKey: true } },
        _count: { select: { messages: true } },
      },
    })

    if (
      !box ||
      !box.isActive ||
      (box.expiresAt && box.expiresAt < new Date()) ||
      (box.maxMessages !== null && box._count.messages >= box.maxMessages)
    ) {
      throw new NotFoundError('Not found')
    }

    return success({
      label: box.label,
      publicKey: Buffer.from(box.owner.publicKey).toString('base64'),
    })
  } catch (err) {
    return error(err)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await parseBody(request, submitMessageSchema)

    const box = await prisma.poBox.findUnique({
      where: { slug },
      select: {
        id: true,
        isActive: true,
        expiresAt: true,
        maxMessages: true,
        _count: { select: { messages: true } },
      },
    })

    if (
      !box ||
      !box.isActive ||
      (box.expiresAt && box.expiresAt < new Date()) ||
      (box.maxMessages !== null && box._count.messages >= box.maxMessages)
    ) {
      throw new NotFoundError('Not found')
    }

    const ciphertext = Buffer.from(body.ciphertext, 'base64')
    if (ciphertext.length > MAX_CIPHERTEXT_SIZE) {
      throw new BadRequestError('Message too large')
    }

    await prisma.message.create({
      data: {
        poBoxId: box.id,
        ciphertext,
      },
    })

    notifyNewMessage(box.id).catch(() => {})

    return success({ message: 'Message sent' }, 201)
  } catch (err) {
    return error(err)
  }
}
