import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, submitMessageSchema } from '@/lib/validation'
import { NotFoundError } from '@/lib/errors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params

    // TODO: Look up box by slug, return label + publicKey only (Phase 7)
    // const box = await prisma.poBox.findUnique({ where: { slug } })
    // if (!box || !box.isActive || ...) {
    //   // Anti-enumeration: generic 404 with identical timing
    //   throw new NotFoundError('Not found')
    // }

    throw new NotFoundError('Not found')
  } catch (err) {
    return error(err)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params
    const body = await parseBody(request, submitMessageSchema)

    // TODO: Validate box exists and is active, enforce size limit, store ciphertext (Phase 7)
    // const box = await prisma.poBox.findUnique({ where: { slug } })
    // if (!box || !box.isActive) {
    //   throw new NotFoundError('Not found')
    // }
    //
    // const ciphertext = Buffer.from(body.ciphertext, 'base64')
    // if (ciphertext.length > MAX_CIPHERTEXT_SIZE) {
    //   throw new BadRequestError('Message too large')
    // }
    //
    // await prisma.message.create({
    //   data: {
    //     poBoxId: box.id,
    //     ciphertext,
    //   },
    // })

    return success({ message: 'Message sent' }, 201)
  } catch (err) {
    return error(err)
  }
}
