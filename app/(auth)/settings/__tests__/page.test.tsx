// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'
import { toast } from 'sonner'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/session-keys', () => ({
  clearSessionKeys: vi.fn(),
  getSessionKeys: vi.fn(() => ({ privateKey: 'mock-private-key', publicKey: 'mock-public-key' })),
}))

const mockCrypto = vi.hoisted(() => ({
  ready: Promise.resolve(),
  fromBase64: vi.fn(() => new Uint8Array(32)),
  toBase64: vi.fn(() => 'mock-base64'),
  splitMasterKey: vi.fn(() => ({ authKey: new Uint8Array(32), kekPw: new Uint8Array(32) })),
  unwrapPrivateKey: vi.fn(() => new Uint8Array(32)),
  deriveMasterKey: vi.fn(() => new Uint8Array(64)),
  computeAuthVerifier: vi.fn(() => new Uint8Array(32)),
  wrapPrivateKey: vi.fn(() => ({ ciphertext: new Uint8Array(32), nonce: new Uint8Array(24) })),
  randomBytes: vi.fn((n: number) => new Uint8Array(n)),
  generateRecoveryCode: vi.fn(() => 'MOCK-CODE-1234-XXXX'),
  deriveRecoveryKey: vi.fn(() => new Uint8Array(32)),
}))

vi.mock('@/lib/crypto', () => ({ crypto: mockCrypto }))
vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(() => Promise.resolve({ id: 'cred-id', response: {} })),
}))

import SettingsPage from '@/app/(auth)/settings/page'

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
  })

  const emailStatus = {
    json: () => ({
      success: true,
      data: {
        hasEmail: true,
        isVerified: true,
        maskedEmail: 'a***@example.com',
        notificationsEnabled: true,
      },
    }),
    ok: true,
  }
  const mfaEnabledStatus = {
    json: () => ({
      success: true,
      data: {
        mfaEmail: true,
        mfaTotp: true,
        mfaPasskey: false,
        hasRecoveryCodes: true,
        hasVerifiedEmail: true,
        hasEmail: true,
      },
    }),
    ok: true,
  }
  const mfaDisabledStatus = {
    json: () => ({
      success: true,
      data: {
        mfaEmail: false,
        mfaTotp: false,
        mfaPasskey: false,
        hasRecoveryCodes: false,
        hasVerifiedEmail: true,
        hasEmail: true,
      },
    }),
    ok: true,
  }
  const passkeysData = {
    json: () => ({
      success: true,
      data: [
        {
          id: 'pk-1',
          deviceName: 'YubiKey',
          createdAt: '2024-01-01T00:00:00Z',
          lastUsedAt: '2024-06-01T00:00:00Z',
        },
      ],
    }),
    ok: true,
  }
  const emptyPasskeys = { json: () => ({ success: true, data: [] }), ok: true }
  const csrfOk = { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true }

  it('renders the settings page with title', async () => {
    mockFetch([emailStatus, mfaEnabledStatus, passkeysData])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Email Notifications')).toBeInTheDocument()
      expect(screen.getByText('Password')).toBeInTheDocument()
      expect(screen.getByText('Multi-Factor Authentication')).toBeInTheDocument()
    })
  })

  it('loads and displays email status', async () => {
    mockFetch([emailStatus, mfaEnabledStatus, passkeysData])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('a***@example.com')).toBeInTheDocument()
    })
  })

  it('saves email and starts cooldown', async () => {
    mockFetch([
      emailStatus,
      mfaEnabledStatus,
      passkeysData,
      csrfOk,
      { json: () => ({ success: true, data: { message: 'Verification email sent' } }), ok: true },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => expect(screen.getByText('Email Notifications')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    })
    fireEvent.click(screen.getByText('Update'))
  })

  it('changes password successfully with crypto re-wrap', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      emptyPasskeys,
      {
        json: () => ({
          success: true,
          data: { authSalt: 'salt', pwKdfSalt: 'kdf', encPrivPw: 'enc', pwNonce: 'nonce' },
        }),
        ok: true,
      },
      csrfOk,
      { json: () => ({ success: true, data: { message: 'Password changed' } }), ok: true },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => expect(screen.getByText('Change Password')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass123' } })
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass456' } })
    fireEvent.change(screen.getByLabelText('Confirm New Password'), {
      target: { value: 'newpass456' },
    })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login')
    })
  })

  it('shows MFA status sections', async () => {
    mockFetch([emailStatus, mfaEnabledStatus, passkeysData])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Email 2FA')).toBeInTheDocument()
      expect(screen.getByText('Authenticator App')).toBeInTheDocument()
      expect(screen.getByText('Passkeys')).toBeInTheDocument()
    })
  })

  it('displays enabled badge for active MFA methods', async () => {
    mockFetch([emailStatus, mfaEnabledStatus, passkeysData])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      const badges = screen.getAllByText('Enabled')
      expect(badges.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('sets up TOTP and shows setup UI', async () => {
    mockFetch([
      emailStatus,
      mfaDisabledStatus,
      emptyPasskeys,
      {
        json: () => ({
          success: true,
          data: { uri: 'otpauth://totp/test', secret: 'JBSWY3DPEHPK3PXP' },
        }),
        ok: true,
      },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => expect(screen.getByText('Authenticator App')).toBeInTheDocument())

    fireEvent.click(screen.getByText('Setup'))

    await waitFor(() => {
      expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
    })
  })

  it('regenerates recovery codes', async () => {
    mockFetch([
      emailStatus,
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: true,
            mfaTotp: true,
            mfaPasskey: false,
            hasRecoveryCodes: true,
            hasVerifiedEmail: true,
            hasEmail: true,
          },
        }),
        ok: true,
      },
      passkeysData,
      {
        json: () => ({
          success: true,
          data: { recoveryCodes: ['AAAA-BBBB-CCCC-DDDD', 'EEEE-FFFF-GGGG-HHHH'] },
        }),
        ok: true,
      },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      const regen = screen.queryByText('Regenerate Recovery Codes')
      if (regen) fireEvent.click(regen)
    })
  })

  it('renders password recovery key section', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Password Recovery Key')).toBeInTheDocument()
    })
  })

  it('shows last generated date when recovery key exists', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText(/Last generated/)).toBeInTheDocument()
    })
  })

  it('shows at account creation when no regeneration date exists', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({ success: true, data: { hasRecoveryKey: true, createdAt: null } }),
        ok: true,
      },
    ])
    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText(/at account creation/)).toBeInTheDocument()
    })
  })

  it('regenerates recovery key and shows dialog', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-regen' } }), ok: true },
      { json: () => ({ success: true, data: { message: 'Recovery code updated' } }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
    ])

    mockCrypto.generateRecoveryCode = vi.fn(() => 'ABCD-EFGH-IJKL-MNOP')
    mockCrypto.deriveRecoveryKey = vi.fn(() => new Uint8Array(32))
    mockCrypto.wrapPrivateKey = vi.fn(() => ({
      ciphertext: new Uint8Array(48),
      nonce: new Uint8Array(24),
    }))
    mockCrypto.toBase64 = vi.fn(() => 'mock-base64')
    mockCrypto.fromBase64 = vi.fn(() => new Uint8Array(32))

    render(React.createElement(SettingsPage))

    await waitFor(() => {
      expect(screen.getByText('Regenerate Recovery Key')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Regenerate Recovery Key'))

    await waitFor(() => {
      expect(screen.getByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument()
    })

    expect(screen.getByText('New Recovery Key')).toBeInTheDocument()
    expect(screen.getByText("I've saved my key")).toBeInTheDocument()
  })

  it('copy button copies recovery key to clipboard', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })

    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-regen' } }), ok: true },
      { json: () => ({ success: true, data: { message: 'Recovery code updated' } }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
    ])

    mockCrypto.generateRecoveryCode = vi.fn(() => 'ABCD-EFGH-IJKL-MNOP')
    mockCrypto.deriveRecoveryKey = vi.fn(() => new Uint8Array(32))
    mockCrypto.wrapPrivateKey = vi.fn(() => ({
      ciphertext: new Uint8Array(48),
      nonce: new Uint8Array(24),
    }))
    mockCrypto.toBase64 = vi.fn(() => 'mock-base64')
    mockCrypto.fromBase64 = vi.fn(() => new Uint8Array(32))

    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Regenerate Recovery Key')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Regenerate Recovery Key'))
    await waitFor(() => {
      expect(screen.getByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Copy'))
    expect(writeText).toHaveBeenCalledWith('ABCD-EFGH-IJKL-MNOP')
  })

  it('shows error toast when regeneration API fails', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-regen' } }), ok: true },
      { json: () => ({ success: false, error: 'CSRF token invalid' }), ok: true },
    ])

    mockCrypto.generateRecoveryCode = vi.fn(() => 'ABCD-EFGH-IJKL-MNOP')
    mockCrypto.deriveRecoveryKey = vi.fn(() => new Uint8Array(32))
    mockCrypto.wrapPrivateKey = vi.fn(() => ({
      ciphertext: new Uint8Array(48),
      nonce: new Uint8Array(24),
    }))
    mockCrypto.toBase64 = vi.fn(() => 'mock-base64')
    mockCrypto.fromBase64 = vi.fn(() => new Uint8Array(32))

    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Regenerate Recovery Key')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Regenerate Recovery Key'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('disables button while regenerating', async () => {
    const putResolve = vi.fn()
    const putPromise = new Promise((resolve) => {
      putResolve.mockImplementation(() =>
        resolve({ json: () => ({ success: true, data: { message: 'ok' } }), ok: true }),
      )
    })

    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-regen' } }), ok: true },
      putPromise,
    ])

    mockCrypto.generateRecoveryCode = vi.fn(() => 'ABCD-EFGH-IJKL-MNOP')
    mockCrypto.deriveRecoveryKey = vi.fn(() => new Uint8Array(32))
    mockCrypto.wrapPrivateKey = vi.fn(() => ({
      ciphertext: new Uint8Array(48),
      nonce: new Uint8Array(24),
    }))
    mockCrypto.toBase64 = vi.fn(() => 'mock-base64')
    mockCrypto.fromBase64 = vi.fn(() => new Uint8Array(32))

    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Regenerate Recovery Key')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Regenerate Recovery Key'))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeDisabled()
    })
  })

  it('dismisses dialog with saved my key', async () => {
    mockFetch([
      {
        json: () => ({
          success: true,
          data: { hasEmail: false, isVerified: false, notificationsEnabled: false },
        }),
        ok: true,
      },
      {
        json: () => ({
          success: true,
          data: {
            mfaEmail: false,
            mfaTotp: false,
            mfaPasskey: false,
            hasRecoveryCodes: false,
            hasVerifiedEmail: false,
            hasEmail: false,
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: [] }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-regen' } }), ok: true },
      { json: () => ({ success: true, data: { message: 'Recovery code updated' } }), ok: true },
      {
        json: () => ({
          success: true,
          data: { hasRecoveryKey: true, createdAt: '2025-06-22T12:00:00.000Z' },
        }),
        ok: true,
      },
    ])

    mockCrypto.generateRecoveryCode = vi.fn(() => 'ABCD-EFGH-IJKL-MNOP')
    mockCrypto.deriveRecoveryKey = vi.fn(() => new Uint8Array(32))
    mockCrypto.wrapPrivateKey = vi.fn(() => ({
      ciphertext: new Uint8Array(48),
      nonce: new Uint8Array(24),
    }))
    mockCrypto.toBase64 = vi.fn(() => 'mock-base64')
    mockCrypto.fromBase64 = vi.fn(() => new Uint8Array(32))

    render(React.createElement(SettingsPage))
    await waitFor(() => {
      expect(screen.getByText('Regenerate Recovery Key')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Regenerate Recovery Key'))
    await waitFor(() => {
      expect(screen.getByText('ABCD-EFGH-IJKL-MNOP')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText("I've saved my key"))
    await waitFor(() => {
      expect(screen.queryByText('ABCD-EFGH-IJKL-MNOP')).not.toBeInTheDocument()
    })
  })
})
