import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, mfaManageSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError, UnauthorizedError } from '@/lib/errors'
import { getRedis } from '@/lib/redis'
import { generateTotpSecret, getTotpUri, verifyTotp, generateRecoveryCodes } from '@/lib/totp'
import prisma from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        mfaEmail: true,
        mfaTotp: true,
        mfaPasskey: true,
        mfaRecoveryCodesCreatedAt: true,
        emailVerified: true,
        emailEncrypted: true,
      },
    })

    if (!record) throw new UnauthorizedError()

    return success({
      mfaEmail: record.mfaEmail,
      mfaTotp: record.mfaTotp,
      mfaPasskey: record.mfaPasskey,
      hasRecoveryCodes: record.mfaRecoveryCodesCreatedAt != null,
      hasVerifiedEmail: record.emailVerified,
      hasEmail: record.emailEncrypted != null,
    })
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser(request)
    const body = await parseBody(request, mfaManageSchema)

    if (body.method === 'email') {
      if (body.action === 'enable') {
        const user = await prisma.user.findUnique({
          where: { id: authUser.id },
          select: { emailVerified: true, emailEncrypted: true },
        })
        if (!user?.emailVerified || !user?.emailEncrypted) {
          throw new BadRequestError('A verified email is required to enable email 2FA')
        }
        await prisma.user.update({ where: { id: authUser.id }, data: { mfaEmail: true } })
        return success({ mfaEmail: true })
      }
      if (body.action === 'disable') {
        await prisma.user.update({ where: { id: authUser.id }, data: { mfaEmail: false } })
        return success({ mfaEmail: false })
      }
    }

    if (body.method === 'totp') {
      if (body.action === 'setup') {
        const secret = generateTotpSecret()
        const uri = getTotpUri(secret, authUser.username)

        const redis = await getRedis()
        await redis.set(`mfa:setup:${authUser.id}`, secret, 'EX', 600)

        return success({ uri, secret })
      }
      if (body.action === 'confirm') {
        if (!body.code) throw new BadRequestError('Verification code is required')

        const redis = await getRedis()
        const secret = await redis.get(`mfa:setup:${authUser.id}`)
        if (!secret) throw new BadRequestError('Setup session expired. Please restart.')

        if (!await verifyTotp(secret, body.code)) {
          throw new UnauthorizedError('Invalid code')
        }

        const { plain, hashed } = generateRecoveryCodes()

        await redis.del(`mfa:setup:${authUser.id}`)

        await prisma.user.update({
          where: { id: authUser.id },
          data: {
            mfaTotp: true,
            totpSecret: new Uint8Array(Buffer.from(secret, 'utf-8')),
            totpCreatedAt: new Date(),
            mfaRecoveryCodes: new Uint8Array(Buffer.from(JSON.stringify(hashed))),
            mfaRecoveryCodesCreatedAt: new Date(),
          },
        })

        return success({ mfaTotp: true, recoveryCodes: plain })
      }
      if (body.action === 'disable') {
        await prisma.user.update({
          where: { id: authUser.id },
          data: {
            mfaTotp: false,
            totpSecret: null,
            totpCreatedAt: null,
            mfaRecoveryCodes: null,
            mfaRecoveryCodesCreatedAt: null,
          },
        })
        return success({ mfaTotp: false })
      }
    }

    if (body.method === 'passkey') {
      if (body.action === 'disable') {
        await prisma.passkeyCredential.deleteMany({ where: { userId: authUser.id } })
        await prisma.user.update({ where: { id: authUser.id }, data: { mfaPasskey: false } })
        return success({ mfaPasskey: false })
      }
    }

    throw new BadRequestError('Invalid method or action')
  } catch (err) {
    return error(err)
  }
}
