import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { NotFoundError, RateLimitError } from '@/lib/errors'
import { checkIpRate } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/admin-audit'
import prisma from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Rate limit by IP — hoisted above try so catch can use ip
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  try {
    if (
      await checkIpRate(`reader-destroy:${id}:${ip}`, {
        windowMs: 30_000,
        max: 5,
      })
    ) {
      throw new RateLimitError('Too many requests. Try again later.')
    }

    const message = await prisma.secureMessage.findUnique({
      where: { id },
      select: {
        isDestroyed: true,
        allowReaderDelete: true,
      },
    })

    if (!message || message.isDestroyed || !message.allowReaderDelete) {
      throw new NotFoundError('Not found')
    }

    await prisma.secureMessage.update({
      where: { id },
      data: {
        isDestroyed: true,
        ciphertext: null,
      },
    })

    // Fire-and-forget audit log — must not block the response
    writeAuditLog({
      actorId: null,
      actorUsername: 'system',
      action: 'secure_message.reader_destroy',
      targetType: 'secure_message',
      targetId: id,
      ip,
    })

    return success({ id })
  } catch (err) {
    return error(err)
  }
}