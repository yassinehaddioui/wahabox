import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError, BadRequestError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { parseBody, updateVaultItemSchema, deleteVaultItemSchema } from '@/lib/validation'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

function b64(u: Uint8Array): string {
  return Buffer.from(u).toString('base64')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id, itemId } = await params

    const body = await parseBody(request, updateVaultItemSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('edit-vault-item', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const item = await prisma.vaultItem.findFirst({
      where: { id: itemId, vault: { id, ownerId: user.id } },
    })
    if (!item) {
      throw new NotFoundError('Item not found')
    }

    const data: Record<string, unknown> = {}
    if (body.ciphertextTitle !== undefined) {
      data.ciphertextTitle = Buffer.from(body.ciphertextTitle, 'base64')
    }
    if (body.ciphertextBody !== undefined) {
      data.ciphertextBody = Buffer.from(body.ciphertextBody, 'base64')
    }

    const updated = await prisma.vaultItem.update({
      where: { id: itemId },
      data,
      select: {
        id: true,
        ciphertextTitle: true,
        ciphertextBody: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Fire-and-forget audit log — must not fail the mutation
    prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          actorUsername: user.username,
          action: 'vault_item.update',
          targetType: 'vault_item',
          targetId: itemId,
          metadata: Prisma.JsonNull,
          ip: null,
        },
      })
      .catch(() => {})

    return success({
      id: updated.id,
      ciphertextTitle: b64(updated.ciphertextTitle),
      ciphertextBody: b64(updated.ciphertextBody),
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    })
  } catch (err) {
    return error(err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id, itemId } = await params
    const body = await parseBody(request, deleteVaultItemSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('delete-vault-item', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const item = await prisma.vaultItem.findFirst({
      where: { id: itemId, vault: { id, ownerId: user.id } },
    })
    if (!item) {
      throw new NotFoundError('Item not found')
    }

    await prisma.vaultItem.delete({ where: { id: itemId } })

    // Fire-and-forget audit log — must not fail the mutation
    prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          actorUsername: user.username,
          action: 'vault_item.delete',
          targetType: 'vault_item',
          targetId: itemId,
          metadata: Prisma.JsonNull,
          ip: null,
        },
      })
      .catch(() => {})

    return success({ id: itemId })
  } catch (err) {
    return error(err)
  }
}
