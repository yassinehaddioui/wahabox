import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError, BadRequestError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { parseBody, createVaultItemSchema } from '@/lib/validation'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const vault = await prisma.vault.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!vault) {
      throw new NotFoundError('Vault not found')
    }

    const items = await prisma.vaultItem.findMany({
      where: { vaultId: id },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        ciphertextTitle: true,
        ciphertextBody: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    const mapped = items.map((i) => ({
      id: i.id,
      ciphertextTitle: b64(i.ciphertextTitle),
      ciphertextBody: b64(i.ciphertextBody),
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    }))

    return success(mapped)
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params

    const vault = await prisma.vault.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!vault) {
      throw new NotFoundError('Vault not found')
    }

    const body = await parseBody(request, createVaultItemSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('create-vault-item', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const titleBuffer = Buffer.from(body.ciphertextTitle, 'base64')
    const bodyBuffer = Buffer.from(body.ciphertextBody, 'base64')

    const item = await prisma.vaultItem.create({
      data: { vaultId: id, ciphertextTitle: titleBuffer, ciphertextBody: bodyBuffer },
      select: { id: true, createdAt: true },
    })

    // Fire-and-forget audit log — must not fail the mutation
    prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          actorUsername: user.username,
          action: 'vault_item.create',
          targetType: 'vault_item',
          targetId: item.id,
          metadata: Prisma.JsonNull,
          ip: null,
        },
      })
      .catch(() => {})

    return success(item, 201)
  } catch (err) {
    return error(err)
  }
}
