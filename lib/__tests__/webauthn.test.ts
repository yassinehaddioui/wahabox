import { describe, it, expect, beforeEach, vi } from 'vitest'
import { resetRedisMock } from '@/test/helpers/redis-mock'

const challenge = 'mock-challenge-value'

const mockGenerateRegistrationOptions = vi.fn()
const mockVerifyRegistrationResponse = vi.fn()
const mockGenerateAuthenticationOptions = vi.fn()
const mockVerifyAuthenticationResponse = vi.fn()

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: mockGenerateRegistrationOptions,
  verifyRegistrationResponse: mockVerifyRegistrationResponse,
  generateAuthenticationOptions: mockGenerateAuthenticationOptions,
  verifyAuthenticationResponse: mockVerifyAuthenticationResponse,
}))

beforeEach(() => {
  resetRedisMock()
})

describe('generateRegOptions', () => {
  it('stores challenge in redis and returns options', async () => {
    mockGenerateRegistrationOptions.mockResolvedValue({ challenge, rp: {}, pubKeyCredParams: [] })

    const { generateRegOptions } = await import('@/lib/webauthn')
    const result = await generateRegOptions('user-1', 'alice', [])

    expect(result).toEqual({ challenge, rp: {}, pubKeyCredParams: [] })
    expect(mockGenerateRegistrationOptions).toHaveBeenCalledTimes(1)

    const { redisMock } = await import('@/test/helpers/redis-mock')
    const stored = await redisMock.get('passkey:challenge:user-1')
    expect(stored).toBe(challenge)
  })

  it('passes excludeCredentials from existing credentials', async () => {
    mockGenerateRegistrationOptions.mockResolvedValue({ challenge, rp: {} })

    const { generateRegOptions } = await import('@/lib/webauthn')
    await generateRegOptions('user-1', 'alice', [
      { credentialId: new Uint8Array([1, 2, 3]), transports: ['usb'] },
    ])

    expect(mockGenerateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCredentials: expect.arrayContaining([expect.objectContaining({ id: 'AQID' })]),
      }),
    )
  })
})

describe('verifyRegResponse', () => {
  it('verifies a registration response when challenge exists', async () => {
    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: {
          id: 'AQID',
          publicKey: new Uint8Array([4, 5, 6]),
          counter: 1,
          transports: ['internal'],
        },
      },
    })

    const { generateRegOptions } = await import('@/lib/webauthn')
    await generateRegOptions('user-1', 'alice', [])

    const { verifyRegResponse } = await import('@/lib/webauthn')
    const result = await verifyRegResponse('user-1', {} as never)

    expect(result.credentialId).toEqual(new Uint8Array(Buffer.from('AQID', 'base64url')))
    expect(result.counter).toBe(1)
    expect(result.transports).toBe('internal')
  })

  it('throws when challenge is missing (expired or tampered)', async () => {
    const { verifyRegResponse } = await import('@/lib/webauthn')
    await expect(verifyRegResponse('user-99', {} as never)).rejects.toThrow('Challenge expired')
  })

  it('throws when verification fails', async () => {
    mockVerifyRegistrationResponse.mockResolvedValue({ verified: false, registrationInfo: null })

    const { generateRegOptions } = await import('@/lib/webauthn')
    await generateRegOptions('user-1', 'alice', [])

    const { verifyRegResponse } = await import('@/lib/webauthn')
    await expect(verifyRegResponse('user-1', {} as never)).rejects.toThrow(
      'Passkey verification failed',
    )
  })

  it('deletes the challenge after successful verification', async () => {
    mockVerifyRegistrationResponse.mockResolvedValue({
      verified: true,
      registrationInfo: {
        credential: { id: 'AQID', publicKey: new Uint8Array(), counter: 0, transports: [] },
      },
    })

    const { generateRegOptions } = await import('@/lib/webauthn')
    await generateRegOptions('user-1', 'alice', [])

    const { verifyRegResponse } = await import('@/lib/webauthn')
    await verifyRegResponse('user-1', {} as never)

    const { redisMock } = await import('@/test/helpers/redis-mock')
    const stored = await redisMock.get('passkey:challenge:user-1')
    expect(stored).toBeNull()
  })
})

describe('generateAuthOptions', () => {
  it('stores challenge and returns options', async () => {
    mockGenerateAuthenticationOptions.mockResolvedValue({ challenge })

    const { generateAuthOptions } = await import('@/lib/webauthn')
    const result = await generateAuthOptions('user-1', [])

    expect(result).toEqual({ challenge })
    const { redisMock } = await import('@/test/helpers/redis-mock')
    const stored = await redisMock.get('passkey:challenge:user-1')
    expect(stored).toBe(challenge)
  })
})

describe('verifyAuthResponse', () => {
  it('verifies an authentication response', async () => {
    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: true,
      authenticationInfo: { newCounter: 5 },
    })

    const { generateAuthOptions } = await import('@/lib/webauthn')
    await generateAuthOptions('user-1', [])

    const { verifyAuthResponse } = await import('@/lib/webauthn')
    const result = await verifyAuthResponse(
      'user-1',
      { credentialId: new Uint8Array([1]), publicKey: new Uint8Array([2]), counter: 3 },
      {} as never,
    )

    expect(result.verified).toBe(true)
    expect(result.newCounter).toBe(5)
  })

  it('returns original counter when verification fails', async () => {
    mockVerifyAuthenticationResponse.mockResolvedValue({
      verified: false,
      authenticationInfo: null,
    })

    const { generateAuthOptions } = await import('@/lib/webauthn')
    await generateAuthOptions('user-1', [])

    const { verifyAuthResponse } = await import('@/lib/webauthn')
    const result = await verifyAuthResponse(
      'user-1',
      { credentialId: new Uint8Array([1]), publicKey: new Uint8Array([2]), counter: 3 },
      {} as never,
    )

    expect(result.verified).toBe(false)
    expect(result.newCounter).toBe(3)
  })

  it('throws when challenge is missing', async () => {
    const { verifyAuthResponse } = await import('@/lib/webauthn')
    await expect(verifyAuthResponse('user-99', {} as never, {} as never)).rejects.toThrow(
      'Challenge expired',
    )
  })
})
