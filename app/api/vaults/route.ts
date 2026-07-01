import { NextRequest } from 'next/server'
import { success, error } from '@/lib/response'
import { parseBody, createVaultSchema } from '@/lib/validation'
import { getAuthUser } from '@/lib/auth'
import { BadRequestError, RateLimitError } from '@/lib/errors'
import { verifyAndConsumeCsrfToken } from '@/lib/csrf'
import { checkUserRate } from '@/lib/rate-limit'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)

    const vaults = await prisma.vault.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        createdAt: true,
        _count: { select: { items: true } },
        items: {
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { updatedAt: true },
        },
      },
    })

    return success(
      vaults.map((vault) => ({
        id: vault.id,
        label: vault.label,
        itemCount: vault._count.items,
        createdAt: vault.createdAt.toISOString(),
        updatedAt: vault.items[0]?.updatedAt?.toISOString() ?? vault.createdAt.toISOString(),
      })),
    )
  } catch (err) {
    return error(err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const body = await parseBody(request, createVaultSchema)

    const csrfValid = await verifyAndConsumeCsrfToken('create-vault', body.csrfToken ?? null)
    if (!csrfValid) throw new BadRequestError('Invalid CSRF token')

    const limited = await checkUserRate(`vault:create:${user.id}`, { windowMs: 60_000, max: 20 })
    if (limited) throw new RateLimitError()

    const vault = await prisma.vault.create({
      data: { ownerId: user.id, label: body.label },
      select: { id: true, label: true, createdAt: true },
    })

    // Fire-and-forget audit log — must not fail the mutation
    prisma.auditLog
      .create({
        data: {
          actorId: user.id,
          actorUsername: user.username,
          action: 'vault.create',
          targetType: 'vault',
          targetId: vault.id,
          targetLabel: vault.label,
          metadata: Prisma.JsonNull,
          ip: null,
        },
      })
      .catch(() => {})

    return success(vault, 201)
  } catch (err) {
    return error(err)
  }
}
