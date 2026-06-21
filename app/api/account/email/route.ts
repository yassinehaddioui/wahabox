import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { encryptEmail } from '@/lib/email-crypto'
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
    const tokenHash = crypto.createHash('sha256').update(token).digest()

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailEncrypted: new Uint8Array(encrypted),
        emailNonce: new Uint8Array(nonce),
        emailKeyVersion: keyVersion,
        emailVerified: false,
      },
    })

    // TODO: Send verification email with link containing token

    return success({ message: 'Email saved. Verification required.' })
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
