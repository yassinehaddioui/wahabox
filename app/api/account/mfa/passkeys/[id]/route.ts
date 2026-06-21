import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const credential = await prisma.passkeyCredential.findFirst({
      where: { id, userId: user.id },
    })

    if (!credential) throw new NotFoundError('Passkey not found')

    await prisma.passkeyCredential.delete({ where: { id } })

    const remaining = await prisma.passkeyCredential.count({ where: { userId: user.id } })
    if (remaining === 0) {
      await prisma.user.update({ where: { id: user.id }, data: { mfaPasskey: false } })
    }

    return success({ deleted: true })
  } catch (err) {
    return error(err)
  }
}
