import { describe, it, expect, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { createSession, validateSession } from '@/lib/session'

describe('createSession (DB-backed)', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('embeds tokenVersion from the user record', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 7 })
    const token = await createSession('user-1', 'alice')

    const encoded = token.split('.')[0]
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    expect(payload.tokenVersion).toBe(7)
  })
})

describe('validateSession', () => {
  beforeEach(() => {
    resetPrismaMock()
  })

  it('returns session data when tokenVersion matches', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 1 })
    const token = await createSession('user-1', 'alice')

    const session = await validateSession(token)
    expect(session).toBeDefined()
    expect(session?.userId).toBe('user-1')
    expect(session?.tokenVersion).toBe(1)
  })

  it('returns undefined when the user no longer exists in DB', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 1 })
    const token = await createSession('ghost', 'ghost')

    prismaMock.user.findUnique.mockResolvedValue(null)
    const session = await validateSession(token)
    expect(session).toBeUndefined()
  })

  it('returns undefined when tokenVersion has changed (revoked token)', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 1 })
    const token = await createSession('user-1', 'alice')

    prismaMock.user.findUnique.mockResolvedValue({ tokenVersion: 2 })
    const session = await validateSession(token)
    expect(session).toBeUndefined()
  })
})
