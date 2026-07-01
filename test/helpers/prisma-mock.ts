import { vi } from 'vitest'

/**
 * Typed Prisma mock for unit/integration tests.
 *
 * Importing this file automatically mocks `@/lib/prisma` — no need to call
 * `vi.mock` in individual test files. Every Prisma model method used by the
 * route handlers and lib modules is stubbed with a `vi.fn()` that resolves a
 * sensible default (null / [] / 0 / {}).
 *
 * Usage:
 *   import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
 *
 *   prismaMock.user.findUnique.mockResolvedValue({ id: '1', username: 'alice', ... })
 *   // ... exercise a route handler ...
 *   expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: '1' } })
 *
 *   afterEach(() => resetPrismaMock())
 */

/** A vi.fn() stub that supports mockResolvedValue / mockReturnValue / etc. */
type PrismaMockFn = ReturnType<typeof vi.fn>

/** Shape of the mocked Prisma client — every model/method used in the codebase. */
export interface PrismaMock {
  user: {
    findUnique: PrismaMockFn
    create: PrismaMockFn
    update: PrismaMockFn
  }
  poBox: {
    findUnique: PrismaMockFn
    findFirst: PrismaMockFn
    findMany: PrismaMockFn
    create: PrismaMockFn
    update: PrismaMockFn
    delete: PrismaMockFn
  }
  vault: {
    findUnique: PrismaMockFn
    findFirst: PrismaMockFn
    findMany: PrismaMockFn
    create: PrismaMockFn
    update: PrismaMockFn
    delete: PrismaMockFn
  }
  auditLog: {
    create: PrismaMockFn
  }
  vaultItem: {
    findMany: PrismaMockFn
    findFirst: PrismaMockFn
    create: PrismaMockFn
    update: PrismaMockFn
    delete: PrismaMockFn
  }
  message: {
    findFirst: PrismaMockFn
    findMany: PrismaMockFn
    create: PrismaMockFn
    count: PrismaMockFn
    update: PrismaMockFn
    delete: PrismaMockFn
    groupBy: PrismaMockFn
  }
  passkeyCredential: {
    findFirst: PrismaMockFn
    findMany: PrismaMockFn
    create: PrismaMockFn
    update: PrismaMockFn
    delete: PrismaMockFn
    deleteMany: PrismaMockFn
    count: PrismaMockFn
  }
  secureMessage: {
    findUnique: PrismaMockFn
    findMany: PrismaMockFn
    create: PrismaMockFn
    update: PrismaMockFn
  }
}

/**
 * Stubs created inside `vi.hoisted` so they exist before the hoisted
 * `vi.mock` factory executes. The same object reference is returned by the
 * factory and exported below — tests mutate one shared instance.
 */
const prismaMock = vi.hoisted(
  (): PrismaMock => ({
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    poBox: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    vault: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    vaultItem: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    message: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      groupBy: vi.fn(),
    },
    passkeyCredential: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
    secureMessage: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  }),
)

// Mock @/lib/prisma — every `import prisma from '@/lib/prisma'` receives this.
vi.mock('@/lib/prisma', () => ({
  default: prismaMock,
}))

/** Flat list of every stub so reset can iterate without recursion. */
const allStubs: readonly PrismaMockFn[] = [
  prismaMock.user.findUnique,
  prismaMock.user.create,
  prismaMock.user.update,
  prismaMock.poBox.findUnique,
  prismaMock.poBox.findFirst,
  prismaMock.poBox.findMany,
  prismaMock.poBox.create,
  prismaMock.poBox.update,
  prismaMock.poBox.delete,
  prismaMock.message.findFirst,
  prismaMock.message.findMany,
  prismaMock.message.create,
  prismaMock.message.count,
  prismaMock.message.update,
  prismaMock.message.delete,
  prismaMock.message.groupBy,
  prismaMock.vault.findUnique,
  prismaMock.vault.findFirst,
  prismaMock.vault.findMany,
  prismaMock.vault.create,
  prismaMock.vault.update,
  prismaMock.vault.delete,
  prismaMock.vaultItem.findMany,
  prismaMock.vaultItem.findFirst,
  prismaMock.vaultItem.create,
  prismaMock.vaultItem.update,
  prismaMock.vaultItem.delete,
  prismaMock.passkeyCredential.findFirst,
  prismaMock.passkeyCredential.findMany,
  prismaMock.passkeyCredential.create,
  prismaMock.passkeyCredential.update,
  prismaMock.passkeyCredential.delete,
  prismaMock.passkeyCredential.deleteMany,
  prismaMock.passkeyCredential.count,
  prismaMock.secureMessage.findUnique,
  prismaMock.secureMessage.findMany,
  prismaMock.secureMessage.create,
  prismaMock.secureMessage.update,
  prismaMock.auditLog.create,
]

/** Apply default resolve values to every stub. Called on load and after reset. */
function applyDefaultResolves(): void {
  prismaMock.user.findUnique.mockResolvedValue(null)
  prismaMock.user.create.mockResolvedValue({})
  prismaMock.user.update.mockResolvedValue({})

  prismaMock.poBox.findUnique.mockResolvedValue(null)
  prismaMock.poBox.findFirst.mockResolvedValue(null)
  prismaMock.poBox.findMany.mockResolvedValue([])
  prismaMock.poBox.create.mockResolvedValue({})
  prismaMock.poBox.update.mockResolvedValue({})
  prismaMock.poBox.delete.mockResolvedValue({})

  prismaMock.message.findFirst.mockResolvedValue(null)
  prismaMock.message.findMany.mockResolvedValue([])
  prismaMock.message.create.mockResolvedValue({})
  prismaMock.message.count.mockResolvedValue(0)
  prismaMock.message.update.mockResolvedValue({})
  prismaMock.message.delete.mockResolvedValue({})
  prismaMock.message.groupBy.mockResolvedValue([])

  prismaMock.vault.findUnique.mockResolvedValue(null)
  prismaMock.vault.findFirst.mockResolvedValue(null)
  prismaMock.vault.findMany.mockResolvedValue([])
  prismaMock.vault.create.mockResolvedValue({})
  prismaMock.vault.update.mockResolvedValue({})
  prismaMock.vault.delete.mockResolvedValue({})
  prismaMock.vaultItem.findMany.mockResolvedValue([])
  prismaMock.vaultItem.findFirst.mockResolvedValue(null)
  prismaMock.vaultItem.create.mockResolvedValue({})
  prismaMock.vaultItem.update.mockResolvedValue({})
  prismaMock.vaultItem.delete.mockResolvedValue({})
  prismaMock.passkeyCredential.findFirst.mockResolvedValue(null)
  prismaMock.passkeyCredential.findMany.mockResolvedValue([])
  prismaMock.passkeyCredential.create.mockResolvedValue({})
  prismaMock.passkeyCredential.update.mockResolvedValue({})
  prismaMock.passkeyCredential.delete.mockResolvedValue({})
  prismaMock.passkeyCredential.deleteMany.mockResolvedValue({ count: 0 })
  prismaMock.passkeyCredential.count.mockResolvedValue(0)

  prismaMock.secureMessage.findUnique.mockResolvedValue(null)
  prismaMock.secureMessage.findMany.mockResolvedValue([])
  prismaMock.secureMessage.create.mockResolvedValue({})
  prismaMock.secureMessage.update.mockResolvedValue({})

  prismaMock.auditLog.create.mockResolvedValue({})
}

// Apply defaults on initial module load.
applyDefaultResolves()

/**
 * Clear all stub call histories and restore default resolve values.
 * Call in `afterEach` to isolate tests.
 */
export function resetPrismaMock(): void {
  for (const stub of allStubs) {
    stub.mockReset()
  }
  applyDefaultResolves()
}

export { prismaMock }
