import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, updateBoxSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params
    const body = await parseBody(request, updateBoxSchema)

    // TODO: Update PO box (rename, toggle, rotate slug, set expiry/quota) (Phase 6)
    // const box = await prisma.poBox.findFirst({
    //   where: { id, ownerId: user.id },
    // })
    // if (!box) throw new NotFoundError('Box not found')

    return success({ id })
  } catch (err) {
    return error(err)
  }
}
