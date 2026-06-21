import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, createBoxSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    // TODO: Return list of user's PO boxes (Phase 6)
    // const boxes = await prisma.poBox.findMany({
    //   where: { ownerId: user.id },
    //   orderBy: { createdAt: 'desc' },
    // })

    return success([])
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const body = await parseBody(request, createBoxSchema)

    // TODO: Create PO box with random slug (Phase 6)
    // const slug = base64url(crypto.getRandomValues(new Uint8Array(16)))
    // const box = await prisma.poBox.create({
    //   data: {
    //     ownerId: user.id,
    //     slug,
    //     label: body.label,
    //   },
    // })

    return success({ id: 'placeholder', slug: 'placeholder', label: body.label }, 201)
  } catch (err) {
    return error(err)
  }
}
