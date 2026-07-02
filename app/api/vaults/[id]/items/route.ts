import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { success, error } from '@/lib/response'
import { getAuthUser } from '@/lib/auth'
import { NotFoundError, BadRequestError, InvalidPasswordError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { checkUserRate } from '@/lib/rate-limit'
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
      select: { id: true, passwordHash: true },
    })
    if (!vault) {
      throw new NotFoundError('Vault not found')
    }

    // Password gate
    if (vault.passwordHash) {
      const limited = await checkUserRate(`vault:unlock:${vault.id}`, { windowMs: 60_000, max: 10 })
      if (limited) throw new RateLimitError()

      const vaultPassword = request.headers.get('X-Vault-Password')
      if (!vaultPassword) {
        throw new InvalidPasswordError('Vault password is required')
      }
      const valid = await bcrypt.compare(vaultPassword, vault.passwordHash)
      if (!valid) {
        throw new InvalidPasswordError('Invalid vault password')
      }
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
          action: 'vault_item.create',
          targetType: 'vault_item',
          targetId: item.id,
          metadata: Prisma.JsonNull,
          ip: null,
        },
      })
      .catch(() => {})

    return success({
      id: item.id,
      ciphertextTitle: b64(item.ciphertextTitle),
      ciphertextBody: b64(item.ciphertextBody),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    }, 201)
  } catch (err) {
    return error(err)
  }
}
