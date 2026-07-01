import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type AuditAction =
  | 'admin.promote'
  | 'admin.demote'
  | 'admin.force_logout'
  | 'admin.suspend'
  | 'admin.unsuspend'
  | 'admin.box_deactivate'
  | 'admin.box_activate'
  | 'admin.box_delete'
  | 'vault.create'
  | 'vault.delete'
  | 'vault_item.create'
  | 'vault_item.update'
  | 'vault_item.delete'

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type AuditParams = {
  actorId: string
  actorUsername: string
  action: AuditAction
  targetType: 'user' | 'box' | 'vault' | 'vault_item'
  targetId: string
  targetLabel?: string
  metadata?: { [key: string]: JsonValue }
  ip?: string
}

/** Fire-and-forget audit logging. Errors are logged but never thrown — audit failures must not block the primary operation. */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorUsername: params.actorUsername,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetLabel: params.targetLabel ?? null,
        metadata: params.metadata ?? Prisma.JsonNull,
        ip: params.ip ?? null,
      },
    })
  } catch (e) {
    console.error('[audit] failed to write log:', e)
  }
}
