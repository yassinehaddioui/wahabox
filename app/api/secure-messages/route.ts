import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, createSecureMessageSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import {
  sealReceiverEmail,
  revealReceiverEmail,
} from '@/lib/secure-message-crypto'
import { sendSecureMessageNotification } from '@/lib/email'
import ENV from '@/lib/env'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const body = await parseBody(request, createSecureMessageSchema)

    const csrfValid = await verifyAndConsumeCsrfToken(
      'create-secure-message',
      body.csrfToken ?? null,
    )
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const ciphertext = Buffer.from(body.ciphertext, 'base64')
    if (ciphertext.length > 100 * 1024) {
      throw new BadRequestError('Message too large')
    }

    // Encrypt receiver email if provided
    let receiverEmailBytes: Uint8Array<ArrayBuffer> | null = null
    let emailNonce: Uint8Array<ArrayBuffer> | null = null
    let emailKeyVersion: number | null = null

    if (body.receiverEmail) {
      const sealed = sealReceiverEmail(body.receiverEmail)
      receiverEmailBytes = new Uint8Array(sealed.encrypted)
      emailNonce = new Uint8Array(sealed.nonce)
      emailKeyVersion = sealed.keyVersion
    }

    // Password hash is already computed client-side via bcrypt
    const passwordHash = body.passwordHash ?? null

    // Parse optional dates
    let startDate: Date | null = null
    let endDate: Date | null = null
    if (body.startDate) startDate = new Date(body.startDate)
    if (body.endDate) endDate = new Date(body.endDate)

    const secureMessage = await prisma.secureMessage.create({
      data: {
        senderId: user.id,
        ciphertext,
        msgNonce: Buffer.from(body.msgNonce, 'base64'),
        passwordHash,
        passwordSalt: body.passwordSalt
          ? Buffer.from(body.passwordSalt, 'base64')
          : null,
        receiverEmail: receiverEmailBytes,
        emailNonce,
        emailKeyVersion,
        startDate,
        endDate,
        autoDestruct: body.autoDestruct,
        signature: body.signature
          ? Buffer.from(body.signature, 'base64')
          : undefined,
        senderPublicKeySign: body.senderPublicKeySign
          ? Buffer.from(body.senderPublicKeySign, 'base64')
          : undefined,
      },
    })

    // Assemble read URL with fragment (urlFragment is NOT stored in DB)
    const readUrl = `${ENV.APP_URL.replace(/\/+$/, '')}/read/${secureMessage.id}#${body.urlFragment}`

    // Send email notification if receiver email was provided
    if (body.receiverEmail) {
      sendSecureMessageNotification(body.receiverEmail, readUrl).catch(() => {})
    }

    return success({ id: secureMessage.id, readUrl }, 201)
  } catch (err) {
    return error(err)
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const messages = await prisma.secureMessage.findMany({
      where: { senderId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        readAt: true,
        isDestroyed: true,
        autoDestruct: true,
        startDate: true,
        endDate: true,
        passwordHash: true,
        receiverEmail: true,
        emailNonce: true,
        emailKeyVersion: true,
        signature: true,
        senderPublicKeySign: true,
      },
    })

    return success(
      messages.map((m) => {
        let receiverEmail: string | null = null
        if (
          m.receiverEmail &&
          m.emailNonce &&
          m.emailKeyVersion !== null
        ) {
          try {
            receiverEmail = revealReceiverEmail(
              new Uint8Array(m.receiverEmail),
              new Uint8Array(m.emailNonce),
            )
          } catch {
            // Email decryption failed — omit receiver email from response
          }
        }
        return {
          id: m.id,
          createdAt: m.createdAt.toISOString(),
          readAt: m.readAt?.toISOString() ?? null,
          isDestroyed: m.isDestroyed,
          autoDestruct: m.autoDestruct,
          startDate: m.startDate?.toISOString() ?? null,
          endDate: m.endDate?.toISOString() ?? null,
          hasPassword: !!m.passwordHash,
          receiverEmail,
          signature: m.signature
            ? Buffer.from(m.signature).toString('base64')
            : null,
          senderPublicKeySign: m.senderPublicKeySign
            ? Buffer.from(m.senderPublicKeySign).toString('base64')
            : null,
        }
      }),
    )
  } catch (err) {
    return error(err)
  }
}
