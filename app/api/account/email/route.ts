import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { encryptEmail, decryptEmail } from '@/lib/email-crypto'
import { sendVerificationEmail } from '@/lib/email'
import { getRedis } from '@/lib/redis'
import prisma from '@/lib/prisma'
import { checkIpRate, checkUserRate, checkGlobalRate } from '@/lib/rate-limit'

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  const maskedLocal =
    local.length <= 2 ? local[0] + '***' : local[0] + '***' + local[local.length - 1]
  return `${maskedLocal}@${domain}`
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        emailEncrypted: true,
        emailNonce: true,
        emailVerified: true,
        notificationsEnabled: true,
      },
    })

    if (!record?.emailEncrypted || !record?.emailNonce) {
      return success({
        hasEmail: false,
        isVerified: false,
        notificationsEnabled: record?.notificationsEnabled ?? true,
      })
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

const EMAIL_WINDOW = { windowMs: 300_000, max: 20 }
const EMAIL_RESEND_COOLDOWN_S = 30

export async function PUT(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (
      (await checkIpRate(`email:${ip}`, EMAIL_WINDOW)) ||
      (await checkUserRate(user.username, EMAIL_WINDOW)) ||
      (await checkGlobalRate())
    ) {
      throw new RateLimitError('Too many requests. Try again later.')
    }

    const redis = await getRedis()
    const cooldownKey = `email-resend-cooldown:${user.id}`
    if (await redis.exists(cooldownKey)) {
      const ttl = await redis.ttl(cooldownKey)
      throw new RateLimitError(`Wait ${ttl}s before resending.`)
    }

    const { email, csrfToken } = (await request.json()) as { email?: string; csrfToken?: string }
    const csrfValid = await verifyAndConsumeCsrfToken('email-set', csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

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

    await redis.set(`verify:${tokenHash}`, user.id, 'EX', 3600)

    try {
      await sendVerificationEmail(email, user.username, token)
    } catch (err) {
      if (process.env.APP_MODE === 'development') {
        console.error('[email] Failed to send verification email:', err)
      }
      await redis.del(`verify:${tokenHash}`)
      throw new Error('Failed to send verification email')
    }

    await redis.set(cooldownKey, '1', 'EX', EMAIL_RESEND_COOLDOWN_S)

    return success({ message: 'Verification email sent.' })
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown'

    if (
      (await checkIpRate(`email:${ip}`, EMAIL_WINDOW)) ||
      (await checkUserRate(user.username, EMAIL_WINDOW)) ||
      (await checkGlobalRate())
    ) {
      throw new RateLimitError('Too many requests. Try again later.')
    }

    const redis = await getRedis()
    const cooldownKey = `email-resend-cooldown:${user.id}`
    if (await redis.exists(cooldownKey)) {
      const ttl = await redis.ttl(cooldownKey)
      throw new RateLimitError(`Wait ${ttl}s before resending.`)
    }

    const { csrfToken } = (await request.json().catch(() => ({}))) as { csrfToken?: string }
    const csrfValid = await verifyAndConsumeCsrfToken('email-resend', csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

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

    await redis.set(`verify:${tokenHash}`, user.id, 'EX', 3600)

    try {
      await sendVerificationEmail(email, record.username, token)
    } catch (err) {
      if (process.env.APP_MODE === 'development') {
        console.error('[email] Failed to send verification email:', err)
      }
      await redis.del(`verify:${tokenHash}`)
      throw new Error('Failed to send verification email')
    }

    await redis.set(cooldownKey, '1', 'EX', EMAIL_RESEND_COOLDOWN_S)

    return success({ message: 'Verification email sent.' })
  } catch (err) {
    return error(err)
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const { csrfToken } = (await request.json().catch(() => ({}))) as { csrfToken?: string }
    const csrfValid = await verifyAndConsumeCsrfToken('email-delete', csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

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
    const { notificationsEnabled, csrfToken } = (await request.json().catch(() => ({}))) as {
      notificationsEnabled?: boolean
      csrfToken?: string
    }

    const csrfValid = await verifyAndConsumeCsrfToken('email-notifications', csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

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
