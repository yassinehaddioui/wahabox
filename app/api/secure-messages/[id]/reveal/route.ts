import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, revealSecureMessageSchema } from '@/lib/validation'
import {
  NotFoundError,
  BadRequestError,
  RateLimitError,
  MessageNotAvailableError,
  InvalidPasswordError,
} from '@/lib/errors'
import { verifyMessagePassword } from '@/lib/secure-message-crypto'
import { checkIpRate } from '@/lib/rate-limit'
import { writeAuditLog } from '@/lib/admin-audit'
import prisma from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  // Rate limit by IP — hoisted above try so catch can use ip
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  try {
    const rateLimited = await checkIpRate(`reveal:${id}:${ip}`, {
      windowMs: 30_000,
      max: 5,
    })
    if (rateLimited) {
      throw new RateLimitError('Too many attempts. Try again later.')
    }

    const body = await parseBody(request, revealSecureMessageSchema)

    const message = await prisma.secureMessage.findUnique({
      where: { id },
      select: {
        ciphertext: true,
        passwordHash: true,
        startDate: true,
        endDate: true,
        isDestroyed: true,
        autoDestruct: true,
      },
    })

    if (!message || message.isDestroyed) {
      throw new NotFoundError('Not found')
    }

    // Check date window
    const now = new Date()
    if (message.startDate && now < message.startDate) {
      throw new MessageNotAvailableError('This message is not available yet', message.startDate)
    }
    if (message.endDate && now > message.endDate) {
      throw new MessageNotAvailableError('This message has expired')
    }

    // Check password
    if (message.passwordHash) {
      if (!body.password) {
        throw new InvalidPasswordError('Password required')
      }
      const valid = await verifyMessagePassword(body.password, message.passwordHash)
      if (!valid) {
        throw new InvalidPasswordError('Invalid password')
      }
    }

    // Capture ciphertext before potential wipe
    const ciphertext = message.ciphertext
      ? Buffer.from(message.ciphertext).toString('base64')
      : null

    // Update readAt and handle auto-destruct
    if (message.autoDestruct) {
      await prisma.secureMessage.update({
        where: { id },
        data: {
          readAt: now,
          isDestroyed: true,
          ciphertext: null,
        },
      })
    } else {
      await prisma.secureMessage.update({
        where: { id },
        data: {
          readAt: now,
        },
      })
    }

    // Fire-and-forget audit log — must not block the response
    writeAuditLog({
      actorId: null,
      actorUsername: 'system',
      action: 'secure_message.read',
      targetType: 'secure_message',
      targetId: id,
      ip,
    })

    return success({ ciphertext })
  } catch (err) {
    if (err instanceof InvalidPasswordError || err instanceof MessageNotAvailableError) {
      writeAuditLog({
        actorId: null,
        actorUsername: 'system',
        action: 'secure_message.read_failed',
        targetType: 'secure_message',
        targetId: id,
        metadata: {
          reason: err instanceof InvalidPasswordError ? 'invalid_password' : 'not_available',
        },
        ip,
      })
    }
    return error(err)
  }
}
