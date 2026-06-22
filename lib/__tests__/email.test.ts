import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetRedisMock } from '@/test/helpers/redis-mock'

const mockSend = vi.fn()

vi.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: vi.fn().mockImplementation(function () {
    return { send: mockSend }
  }),
  SendEmailCommand: vi.fn().mockImplementation(function (args: unknown) {
    return args
  }),
}))

beforeEach(() => {
  resetRedisMock()
  mockSend.mockReset()
  process.env.SES_FROM_ADDRESS = 'noreply@wahabox.com'
})

describe('dev-mode logging', () => {
  beforeEach(() => {
    process.env.APP_MODE = 'development'
  })

  it('sendVerificationEmail logs link in dev mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { sendVerificationEmail } = await import('@/lib/email')

    await sendVerificationEmail('user@test.com', 'alice', 'token-abc')

    expect(logSpy).toHaveBeenCalledWith(
      '[email] Verification link:',
      'http://localhost:3000/verify-email?token=token-abc',
    )
    logSpy.mockRestore()
  })

  it('sendMfaCodeEmail logs code in dev mode', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { sendMfaCodeEmail } = await import('@/lib/email')

    await sendMfaCodeEmail('user@test.com', 'alice', '123456')

    expect(logSpy).toHaveBeenCalledWith(
      '[email] MFA code for user@test.com: 123456',
    )
    logSpy.mockRestore()
  })
})

describe('sendVerificationEmail', () => {
  it('calls SES send with verification details', async () => {
    const { sendVerificationEmail } = await import('@/lib/email')

    await sendVerificationEmail('user@test.com', 'alice', 'token-abc')

    expect(mockSend).toHaveBeenCalledTimes(1)
    const cmd = vi.mocked(
      (await import('@aws-sdk/client-sesv2')).SendEmailCommand,
    ).mock.calls[0][0] as { Destination: { ToAddresses: string[] }; Content: { Simple: { Subject: { Data: string } } } }
    expect(cmd.Destination?.ToAddresses).toEqual(['user@test.com'])
    expect(cmd.Content?.Simple?.Subject?.Data).toBe('Verify your email for Wahabox')
  })

  it('builds a verification link containing the token', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { sendVerificationEmail } = await import('@/lib/email')

    await sendVerificationEmail('user@test.com', 'alice', 'secret-token')

    expect(logSpy).toHaveBeenCalledWith(
      '[email] Verification link:',
      'http://localhost:3000/verify-email?token=secret-token',
    )
    logSpy.mockRestore()
  })
})

describe('sendNewMessageNotification', () => {
  it('calls SES send with notification content', async () => {
    const { sendNewMessageNotification } = await import('@/lib/email')

    await sendNewMessageNotification('user@test.com', 'My Box')

    expect(mockSend).toHaveBeenCalledTimes(1)
    const cmd = mockSend.mock.calls[0][0] as { Content: { Simple: { Subject: { Data: string } } } }
    expect(cmd.Content?.Simple?.Subject?.Data).toBe('New message in your PO Box')
  })
})

describe('sendMfaCodeEmail', () => {
  it('calls SES send with the code', async () => {
    const { sendMfaCodeEmail } = await import('@/lib/email')

    await sendMfaCodeEmail('user@test.com', 'alice', '654321')

    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})

describe('checkNotificationRateLimit', () => {
  it('returns false on first call (no recent notification)', async () => {
    const { checkNotificationRateLimit } = await import('@/lib/email')
    await expect(checkNotificationRateLimit('user-1')).resolves.toBe(false)
  })

  it('returns true on second call within the window', async () => {
    const { checkNotificationRateLimit } = await import('@/lib/email')
    await checkNotificationRateLimit('user-1')
    await expect(checkNotificationRateLimit('user-1')).resolves.toBe(true)
  })

  it('different users have independent rate limits', async () => {
    const { checkNotificationRateLimit } = await import('@/lib/email')
    await checkNotificationRateLimit('user-1')
    await expect(checkNotificationRateLimit('user-2')).resolves.toBe(false)
  })
})
