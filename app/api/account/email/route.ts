import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { encryptEmail } from '@/lib/email-crypto'
import { sendVerificationEmail } from '@/lib/email'
import { getRedis } from '@/lib/redis'
import prisma from '@/lib/prisma'

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

    const redis = getRedis()
    await redis.set(
      `verify:${tokenHash}`,
      user.id,
      'EX',
      3600,
    )

    try {
      await sendVerificationEmail(email, user.username, token)
    } catch {
      return success({ message: 'Email saved. Unable to send verification email.' })
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
