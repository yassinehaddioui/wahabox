import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { clearSessionCookie } from '@/lib/session'
import prisma from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    try {
      const user = await getAuthUser(request)
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenVersion: { increment: 1 } },
      })
    } catch {
    }
    await clearSessionCookie()
    return success({ message: 'Logged out' })
  } catch (err) {
    return error(err)
  }
}
