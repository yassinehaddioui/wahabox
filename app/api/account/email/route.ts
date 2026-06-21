import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { encryptEmail, decryptEmail } from '@/lib/email-crypto'
import { sendVerificationEmail } from '@/lib/email'
import { getRedis } from '@/lib/redis'
import prisma from '@/lib/prisma'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const maskedLocal = local.length <= 2
    ? local[0] + '***'
    : local[0] + '***' + local[local.length - 1]
  return `${maskedLocal}@${domain}`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailEncrypted: true, emailNonce: true, emailVerified: true, notificationsEnabled: true },
    })

    if (!record?.emailEncrypted || !record?.emailNonce) {
      return success({ hasEmail: false, isVerified: false, notificationsEnabled: record?.notificationsEnabled ?? true })
    }

    const email = decryptEmail(
      new Uint8Array(record.emailEncrypted),
      new Uint8Array(record.emailNonce),
    )

    return success({
      hasEmail: true,
      isVerified: record.emailVerified,
      maskedEmail: maskEmail(email),
      notificationsEnabled: record.notificationsEnabled,
    })
  } catch (err) {
    return error(err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const { email } = await request.json() as { email?: string }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      throw new BadRequestError('Invalid email address')
    }

    const { encrypted, nonce, keyVersion } = encryptEmail(email)

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailEncrypted: new Uint8Array(encrypted),
        emailNonce: new Uint8Array(nonce),
        emailKeyVersion: keyVersion,
        emailVerified: false,
      },
    })

    const redis = await getRedis()
    await redis.set(
      `verify:${tokenHash}`,
      user.id,
      'EX',
      3600,
    )

    try {
      await sendVerificationEmail(email, user.username, token)
    } catch (err) {
      if (process.env.APP_MODE === 'development') {
        console.error('[email] Failed to send verification email:', err)
      }
      return success({ message: 'Email saved. Unable to send verification email.' })
    }

    return success({ message: 'Verification email sent.' })
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { emailEncrypted: true, emailNonce: true, emailVerified: true, username: true },
    })

    if (!record?.emailEncrypted || !record?.emailNonce) {
      throw new BadRequestError('No email address is set')
    }

    if (record.emailVerified) {
      return success({ message: 'Email is already verified' })
    }

    const email = decryptEmail(
      new Uint8Array(record.emailEncrypted),
      new Uint8Array(record.emailNonce),
    )

    const token = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

    const redis = await getRedis()
    await redis.set(`verify:${tokenHash}`, user.id, 'EX', 3600)

    try {
      await sendVerificationEmail(email, record.username, token)
    } catch (err) {
      if (process.env.APP_MODE === 'development') {
        console.error('[email] Failed to send verification email:', err)
      }
      return success({ message: 'Unable to send verification email. Please try again.' })
    }

    return success({ message: 'Verification email sent.' })
  } catch (err) {
    return error(err)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailEncrypted: null,
        emailNonce: null,
        emailKeyVersion: null,
        emailVerified: false,
      },
    })

    return success({ message: 'Email removed' })
  } catch (err) {
    return error(err)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const { notificationsEnabled } = await request.json() as { notificationsEnabled?: boolean }

    if (typeof notificationsEnabled !== 'boolean') {
      throw new BadRequestError('notificationsEnabled must be a boolean')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { notificationsEnabled },
    })

    return success({ notificationsEnabled })
  } catch (err) {
    return error(err)
  }
}
