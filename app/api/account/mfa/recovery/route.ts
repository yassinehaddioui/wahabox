import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError } from '@/lib/errors'
import { generateRecoveryCodes } from '@/lib/totp'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const record = await prisma.user.findUnique({
      where: { id: user.id },
      select: { mfaEmail: true, mfaTotp: true, mfaPasskey: true },
    })

    if (!record?.mfaEmail && !record?.mfaTotp && !record?.mfaPasskey) {
      throw new BadRequestError('At least one MFA method must be enabled to manage recovery codes')
    }

    const { plain, hashed } = generateRecoveryCodes()

    await prisma.user.update({
      where: { id: user.id },
      data: {
        mfaRecoveryCodes: new Uint8Array(Buffer.from(JSON.stringify(hashed))),
        mfaRecoveryCodesCreatedAt: new Date(),
      },
    })

    return success({ recoveryCodes: plain })
  } catch (err) {
    return error(err)
  }
}
