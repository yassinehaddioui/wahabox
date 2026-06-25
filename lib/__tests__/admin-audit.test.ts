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
      'admin.box_deactivate',
      'admin.box_activate',
      'admin.box_delete',
    ] as const

    for (const action of actions) {
      vi.clearAllMocks()
      await writeAuditLog({
        actorId: 'admin-1',
        actorUsername: 'admin',
        action,
        targetType: 'user',
        targetId: 'user-2',
      })

      expect(mockPrismaAuditLogCreate).toHaveBeenCalledTimes(1)
      expect(mockPrismaAuditLogCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action }),
        }),
      )
    }
  })
})
