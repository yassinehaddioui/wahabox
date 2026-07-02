import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { success, error } from '@/lib/response'
import { parseBody, updateVaultSchema, deleteVaultSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError, NotFoundError, InvalidPasswordError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params
    const body = await parseBody(request, updateVaultSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('edit-vault', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const vault = await prisma.vault.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!vault) {
      throw new NotFoundError()
    }

    const data: Record<string, unknown> = {}
    if (body.label !== undefined) data.label = body.label

    if (body.password !== undefined) {
      if (body.password === null) {
        data.passwordHash = null
      } else {
        if (vault.passwordHash) {
          if (!body.currentPassword) {
            throw new BadRequestError('Current password is required to change the vault password')
          }
          const valid = await bcrypt.compare(body.currentPassword, vault.passwordHash)
          if (!valid) {
            throw new InvalidPasswordError('Invalid current password')
          }
        }
        data.passwordHash = await bcrypt.hash(body.password, 12)
      }
    }

    const updated = await prisma.vault.update({
      where: { id },
      data,
      select: { id: true, label: true, passwordHash: true, createdAt: true },
    })

    return success({
      id: updated.id,
      label: updated.label,
      hasPassword: !!updated.passwordHash,
      createdAt: updated.createdAt,
    })
  } catch (err) {
    return error(err)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getAuthUser(request)
    const { id } = await params
    const body = await parseBody(request, deleteVaultSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('delete-vault', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const vault = await prisma.vault.findFirst({
      where: { id, ownerId: user.id },
    })
    if (!vault) {
      throw new NotFoundError()
    }

    await prisma.vault.delete({ where: { id } })

    // Fire-and-forget audit log — must not fail the mutation
    prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          actorUsername: user.username,
          action: 'vault.delete',
          targetType: 'vault',
          targetId: vault.id,
          targetLabel: vault.label,
          metadata: Prisma.JsonNull,
          ip: null,
        },
      })
      .catch(() => {})

    return success({ id })
  } catch (err) {
    return error(err)
  }
}
