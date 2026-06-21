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
      select: { mfaTotp: true },
    })

    if (!record?.mfaTotp) {
      throw new BadRequestError('TOTP must be enabled to regenerate recovery codes')
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
