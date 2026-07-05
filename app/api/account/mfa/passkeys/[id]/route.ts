import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/admin-audit'

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

    // Fire-and-forget audit log
    writeAuditLog({
      actorId: user.id,
      actorUsername: user.username,
      action: 'mfa.passkey_remove',
      targetType: 'user',
      targetId: user.id,
      metadata: { credentialId: id, mfaPasskeyDisabled: remaining === 0 },
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    })

    return success({ deleted: true })
  } catch (err) {
    return error(err)
  }
}
