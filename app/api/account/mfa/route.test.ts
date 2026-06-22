import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prismaMock, resetPrismaMock } from '@/test/helpers/prisma-mock'
import { resetRedisMock, redisMock } from '@/test/helpers/redis-mock'
import { createUser } from '@/test/helpers/fixtures'
import { GET, POST } from './route'
import { createNextRequest } from '@/test/helpers/request'
import { UnauthorizedError } from '@/lib/errors'

vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/totp', () => ({ generateTotpSecret: vi.fn(), getTotpUri: vi.fn(), verifyTotp: vi.fn(), generateRecoveryCodes: vi.fn() }))

import { getAuthUser } from '@/lib/auth'
import { generateTotpSecret, getTotpUri, verifyTotp, generateRecoveryCodes } from '@/lib/totp'

function mockAuth(): void {
  vi.mocked(getAuthUser).mockResolvedValue({ id: 'user-1', username: 'testuser' })
}

describe('GET /api/account/mfa', () => {
  beforeEach(() => { resetPrismaMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await GET(createNextRequest('http://localhost/api/account/mfa'))
    expect(res.status).toBe(401)
  })

  it('returns MFA status flags', async () => {
    mockAuth()
    prismaMock.user.findUnique.mockResolvedValue(
      createUser({ mfaEmail: true, mfaTotp: false, emailVerified: true, mfaRecoveryCodesCreatedAt: new Date(), emailEncrypted: Buffer.alloc(1, 0x01) }),
    )
    const res = await GET(createNextRequest('http://localhost/api/account/mfa'))
    const body = await res.json()
    expect(body.data).toEqual({
      mfaEmail: true, mfaTotp: false, mfaPasskey: false,
      hasRecoveryCodes: true, hasVerifiedEmail: true, hasEmail: true,
    })
  })
})

describe('POST /api/account/mfa', () => {
  beforeEach(() => { resetPrismaMock(); resetRedisMock(); vi.clearAllMocks() })

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthUser).mockRejectedValue(new UnauthorizedError())
    const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'setup' } }))
    expect(res.status).toBe(401)
  })

  describe('TOTP setup', () => {
    it('returns URI and secret', async () => {
      mockAuth()
      vi.mocked(generateTotpSecret).mockReturnValue('JBSWY3DPEHPK3PXP')
      vi.mocked(getTotpUri).mockReturnValue('otpauth://totp/testuser?secret=JBSWY3DPEHPK3PXP')
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'setup' } }))
      const body = await res.json()
      expect(body.data.secret).toBe('JBSWY3DPEHPK3PXP')
      expect(await redisMock.get('mfa:setup:user-1')).toBe('JBSWY3DPEHPK3PXP')
    })
  })

  describe('TOTP confirm', () => {
    it('returns 400 when setup expired', async () => {
      mockAuth()
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'confirm', code: '123456' } }))
      expect(res.status).toBe(400)
    })

    it('returns 401 for invalid code', async () => {
      mockAuth()
      await redisMock.set('mfa:setup:user-1', 'JBSWY3DPEHPK3PXP', 'EX', 600)
      vi.mocked(verifyTotp).mockResolvedValue(false)
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'confirm', code: '000000' } }))
      expect(res.status).toBe(401)
    })

    it('enables TOTP and returns recovery codes', async () => {
      mockAuth()
      await redisMock.set('mfa:setup:user-1', 'JBSWY3DPEHPK3PXP', 'EX', 600)
      vi.mocked(verifyTotp).mockResolvedValue(true)
      vi.mocked(generateRecoveryCodes).mockReturnValue({ plain: ['CODE1'], hashed: ['hash1'] })
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'confirm', code: '123456' } }))
      const body = await res.json()
      expect(body.data.mfaTotp).toBe(true)
      expect(body.data.recoveryCodes).toEqual(['CODE1'])
      expect(await redisMock.get('mfa:setup:user-1')).toBeNull()
    })
  })

  describe('TOTP disable', () => {
    it('disables TOTP and clears fields', async () => {
      mockAuth()
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'disable' } }))
      expect(res.status).toBe(200)
      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { mfaTotp: false, totpSecret: null, totpCreatedAt: null, mfaRecoveryCodes: null, mfaRecoveryCodesCreatedAt: null },
      })
    })
  })

  describe('Email enable', () => {
    it('requires verified email', async () => {
      mockAuth()
      prismaMock.user.findUnique.mockResolvedValue(createUser({ emailVerified: false, emailEncrypted: null }))
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'email', action: 'enable' } }))
      expect(res.status).toBe(400)
    })

    it('enables email 2FA', async () => {
      mockAuth()
      prismaMock.user.findUnique.mockResolvedValue(createUser({ emailVerified: true, emailEncrypted: Buffer.alloc(1) }))
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'email', action: 'enable' } }))
      expect(res.status).toBe(200)
    })
  })

  describe('Passkey disable', () => {
    it('removes all passkeys', async () => {
      mockAuth()
      const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'passkey', action: 'disable' } }))
      expect(res.status).toBe(200)
      expect(prismaMock.passkeyCredential.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } })
    })
  })

  it('returns 400 for unknown method/action', async () => {
    mockAuth()
    const res = await POST(createNextRequest('http://localhost/api/account/mfa', { method: 'POST', body: { method: 'totp', action: 'unknown' } }))
    expect(res.status).toBe(400)
  })
})
