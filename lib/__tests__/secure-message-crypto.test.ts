import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('bcryptjs', () => ({
  default: { compare: vi.fn(async () => true) },
}))

import bcrypt from 'bcryptjs'
import { verifyMessagePassword } from '../secure-message-crypto'

describe('verifyMessagePassword', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    '$2b$31$' + 'A'.repeat(53),
    '$2b$13$' + 'A'.repeat(53),
    '$2b$12$short',
  ])('rejects unsafe hash without invoking bcrypt: %s', async (hash) => {
    await expect(verifyMessagePassword('password', hash)).resolves.toBe(false)
    expect(bcrypt.compare).not.toHaveBeenCalled()
  })

  it('allows a complete bcrypt hash with cost 12', async () => {
    const hash = '$2b$12$' + 'A'.repeat(53)

    await expect(verifyMessagePassword('password', hash)).resolves.toBe(true)
    expect(bcrypt.compare).toHaveBeenCalledWith('password', hash)
  })
})
