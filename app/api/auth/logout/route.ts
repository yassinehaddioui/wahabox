import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { clearSessionCookie } from '@/lib/session'
import prisma from '@/lib/prisma'
import { writeAuditLog } from '@/lib/admin-audit'

export async function POST(request: NextRequest) {
  try {
    try {
      const user = await getAuthUser(request)
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      })
      // Fire-and-forget audit log
      writeAuditLog({
        actorId: user.id,
        actorUsername: user.username,
        action: 'auth.logout',
        targetType: 'user',
        targetId: user.id,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
      })
    } catch {}
    await clearSessionCookie()
    return success({ message: 'Logged out' })
  } catch (err) {
    return error(err)
  }
}
