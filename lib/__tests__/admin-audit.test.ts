import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeAuditLog } from '@/lib/admin-audit'

const { mockPrismaAuditLogCreate } = vi.hoisted(() => ({
  mockPrismaAuditLogCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    auditLog: {
      create: mockPrismaAuditLogCreate,
    },
  },
}))

describe('writeAuditLog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrismaAuditLogCreate.mockResolvedValue({
      id: 'log-1',
      createdAt: new Date(),
    })
  })

  it('creates an audit log record with all required fields', async () => {
    await writeAuditLog({
      actorId: 'admin-1',
      actorUsername: 'admin',
      action: 'admin.promote',
      targetType: 'user',
      targetId: 'user-2',
    })

    expect(mockPrismaAuditLogCreate).toHaveBeenCalledTimes(1)
    expect(mockPrismaAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        actorUsername: 'admin',
        action: 'admin.promote',
        targetType: 'user',
        targetId: 'user-2',
        targetLabel: null,
        metadata: expect.anything(),
        ip: null,
      },
    })

    // Metadata defaults to Prisma.JsonNull (not plain null) for Prisma 7 Json? compatibility
    const callArg = mockPrismaAuditLogCreate.mock.calls[0][0] as { data: { metadata: unknown } }
    expect(callArg.data.metadata).toBeDefined()
    expect(callArg.data.metadata).not.toBeNull()
  })

  it('includes optional fields when provided', async () => {
    await writeAuditLog({
      actorId: 'admin-1',
      actorUsername: 'admin',
      action: 'admin.box_delete',
      targetType: 'box',
      targetId: 'box-99',
      targetLabel: 'My Box',
      metadata: { reason: 'spam' },
      ip: '10.0.0.1',
    })

    expect(mockPrismaAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        actorUsername: 'admin',
        action: 'admin.box_delete',
        targetType: 'box',
        targetId: 'box-99',
        targetLabel: 'My Box',
        metadata: { reason: 'spam' },
        ip: '10.0.0.1',
      },
    })
  })

  it('does NOT throw when prisma.auditLog.create fails (fire-and-forget)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockPrismaAuditLogCreate.mockRejectedValue(new Error('DB down'))

    // Must not throw
    await expect(
      writeAuditLog({
        actorId: 'admin-1',
        actorUsername: 'admin',
        action: 'admin.promote',
        targetType: 'user',
        targetId: 'user-2',
      }),
    ).resolves.toBeUndefined()

    expect(consoleErrorSpy).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('accepts all AuditAction values', async () => {
    const actions = [
      'admin.promote',
      'admin.demote',
      'admin.force_logout',
      'admin.suspend',
      'admin.unsuspend',
      'admin.box_deactivate',
      'admin.box_activate',
      'admin.box_delete',
      'vault.create',
      'vault.update',
      'vault.delete',
      'vault_item.create',
      'vault_item.update',
      'vault_item.delete',
      'auth.signup',
      'auth.login',
      'auth.logout',
      'auth.password_change',
      'box.create',
      'box.update',
      'box.delete',
      'account.email_set',
      'account.email_remove',
      'account.notifications_toggle',
      'mfa.email_enable',
      'mfa.email_disable',
      'mfa.totp_confirm',
      'mfa.totp_disable',
      'mfa.passkey_register',
      'mfa.passkey_remove',
      'mfa.recovery_codes_regenerate',
      'secure_message.create',
      'secure_message.read',
      'secure_message.read_failed',
      'secure_message.destroy',
      'message.create',
      'message.read',
      'message.delete',
    ] as const

    for (const action of actions) {
      vi.clearAllMocks()
      await writeAuditLog({
        actorId: 'admin-1',
        actorUsername: 'admin',
        action,
        targetType: action.startsWith('admin.') || action.startsWith('auth.') || action.startsWith('account.') || action.startsWith('mfa.')
        ? 'user'
        : action.includes('item')
        ? 'vault_item'
        : action.startsWith('box.')
        ? 'box'
        : action.startsWith('secure_message.')
        ? 'secure_message'
        : action.startsWith('message.')
        ? 'message'
        : 'vault',
        targetId: 'target-1',
      })

      expect(mockPrismaAuditLogCreate).toHaveBeenCalledTimes(1)
      expect(mockPrismaAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action }),
        }),
      )
    }
  })

  it('supports anonymous actors (actorId null)', async () => {
    await writeAuditLog({
      actorId: null,
      actorUsername: 'system',
      action: 'message.create',
      targetType: 'message',
      targetId: 'm1',
    })

    expect(mockPrismaAuditLogCreate).toHaveBeenCalledWith({
      data: {
        actorId: null,
        actorUsername: 'system',
        action: 'message.create',
        targetType: 'message',
        targetId: 'm1',
        targetLabel: null,
        metadata: expect.anything(),
        ip: null,
      },
    })
  })
})
