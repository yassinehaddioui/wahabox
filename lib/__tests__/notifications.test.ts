import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'

vi.mock('@/lib/redis', () => ({
  withRedis: vi.fn(),
}))

vi.mock('@/lib/email-crypto', () => ({
  decryptEmail: vi.fn(),
}))

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn(),
  SendEmailCommand: vi.fn(),
}))

import { withRedis } from '@/lib/redis'
import { decryptEmail } from '@/lib/email-crypto'
import { notifyNewMessage } from '@/lib/notifications'

function owner(overrides: Partial<{
  id: string
  emailEncrypted: Uint8Array
  emailNonce: Uint8Array
  emailVerified: boolean
  notificationsEnabled: boolean
}> = {}) {
  return {
    id: 'user-1',
    emailEncrypted: new Uint8Array(10),
    emailNonce: new Uint8Array(12),
    emailVerified: true,
    notificationsEnabled: true,
    ...overrides,
  }
}

function box(overrides: Partial<{
  label: string
  notify: boolean
  owner: ReturnType<typeof owner>
}> = {}) {
  return {
    label: 'Test Box',
    notify: true,
    owner: owner(),
    ...overrides,
  }
}

describe('notifyNewMessage', () => {
  beforeEach(() => {
    resetPrismaMock()
    vi.clearAllMocks()
  })

  it('returns early when box is not found', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(null)
    await notifyNewMessage('box-id')
    expect(withRedis).not.toHaveBeenCalled()
    expect(decryptEmail).not.toHaveBeenCalled()
  })

  it('skips SES when notify is disabled on the box', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(box({ notify: false }))
    await notifyNewMessage('box-id')
    expect(withRedis).not.toHaveBeenCalled()
    expect(decryptEmail).not.toHaveBeenCalled()
  })

  it('skips SES when owner notifications are disabled', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(box({ owner: owner({ notificationsEnabled: false }) }))
    await notifyNewMessage('box-id')
    expect(withRedis).not.toHaveBeenCalled()
    expect(decryptEmail).not.toHaveBeenCalled()
  })

  it('skips SES when email is not verified', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(box({ owner: owner({ emailVerified: false }) }))
    await notifyNewMessage('box-id')
    expect(withRedis).not.toHaveBeenCalled()
    expect(decryptEmail).not.toHaveBeenCalled()
  })

  it('skips sending when rate limited', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(box())
    vi.mocked(withRedis).mockResolvedValue(true)
    await notifyNewMessage('box-id')
    expect(withRedis).toHaveBeenCalled()
    expect(decryptEmail).not.toHaveBeenCalled()
  })

  it('decrypts email and sends notification on happy path', async () => {
    prismaMock.poBox.findUnique.mockResolvedValue(box())
    vi.mocked(withRedis).mockResolvedValue(false)
    vi.mocked(decryptEmail).mockReturnValue('user@example.com')
    await notifyNewMessage('box-id')
    expect(withRedis).toHaveBeenCalled()
    expect(decryptEmail).toHaveBeenCalled()
  })
})
