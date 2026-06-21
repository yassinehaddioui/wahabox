import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    // TODO: Return messages for the PO box (Phase 8)
    // const box = await prisma.poBox.findFirst({
    //   where: { id, ownerId: user.id },
    // })
    // if (!box) throw new NotFoundError('Box not found')
    //
    // const messages = await prisma.message.findMany({
    //   where: { poBoxId: id },
    //   orderBy: { createdAt: 'desc' },
    // })

    return success([])
  } catch (err) {
    return error(err)
  }
}
