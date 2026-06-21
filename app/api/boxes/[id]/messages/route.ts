import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError } from '@/lib/errors'
import prisma from '@/lib/prisma'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const box = await prisma.poBox.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!box) {
      throw new NotFoundError('Box not found')
    }

    const messages = await prisma.message.findMany({
      where: { poBoxId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ciphertext: true,
        isRead: true,
        createdAt: true,
      },
    })

    return success(
      messages.map((m: { id: string; ciphertext: Uint8Array; isRead: boolean; createdAt: Date }) => ({
        id: m.id,
        ciphertext: b64(m.ciphertext),
        isRead: m.isRead,
        createdAt: m.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    return error(err)
  }
}
