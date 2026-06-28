// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

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

const mockCrypto = vi.hoisted(() => ({
  ready: Promise.resolve(),
  fromBase64: vi.fn(() => new Uint8Array(32)),
  toBase64: vi.fn(() => 'mock-base64'),
  splitMasterKey: vi.fn(() => ({ authKey: new Uint8Array(32), kekPw: new Uint8Array(32) })),
  unwrapPrivateKey: vi.fn(() => new Uint8Array(32)),
  deriveMasterKey: vi.fn(() => new Uint8Array(64)),
  deriveRecoveryKey: vi.fn(() => new Uint8Array(32)),
  openSealed: vi.fn(() => new Uint8Array(32)),
  computeAuthVerifier: vi.fn(() => new Uint8Array(32)),
  wrapPrivateKey: vi.fn(() => ({ ciphertext: new Uint8Array(32), nonce: new Uint8Array(24) })),
  generateSignKeypair: vi.fn(() => ({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(64) })),
  randomBytes: vi.fn((n: number) => new Uint8Array(n)),
}))

vi.mock('@/lib/crypto', () => ({ crypto: mockCrypto }))

import RecoverPage from '@/app/(public)/recover/page'

function resetCryptoMocks() {
  mockCrypto.fromBase64.mockImplementation(() => new Uint8Array(32))
  mockCrypto.toBase64.mockImplementation(() => 'mock-base64')
  mockCrypto.unwrapPrivateKey.mockImplementation(() => new Uint8Array(32))
  mockCrypto.openSealed.mockImplementation(() => new Uint8Array(32))
  mockCrypto.deriveRecoveryKey.mockImplementation(() => new Uint8Array(32))
  mockCrypto.deriveMasterKey.mockImplementation(() => new Uint8Array(64))
  mockCrypto.splitMasterKey.mockImplementation(() => ({
    authKey: new Uint8Array(32),
    kekPw: new Uint8Array(32),
  }))
  mockCrypto.computeAuthVerifier.mockImplementation(() => new Uint8Array(32))
  mockCrypto.wrapPrivateKey.mockImplementation(() => ({
    ciphertext: new Uint8Array(32),
    nonce: new Uint8Array(24),
  }))
  mockCrypto.randomBytes.mockImplementation((n: number) => new Uint8Array(n))
}

describe('RecoverPage', () => {
  beforeEach(() => {
    resetCryptoMocks()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
  })

  it('renders the recovery form', () => {
    render(React.createElement(RecoverPage))
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Recovery Code')).toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toBeInTheDocument()
  })

  it('shows error when recovery code is invalid (unwrapPrivateKey throws)', async () => {
    mockCrypto.unwrapPrivateKey.mockImplementation(() => {
      throw new Error('Decryption failed')
    })
    mockFetch([
      { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true },
      {
        json: () => ({
          success: true,
          data: {
            encPrivRec: 'enc',
            recKdfSalt: 'salt',
            recNonce: 'nonce',
            publicKey: 'pub',
            sealedChallenge: 'sealed',
            recoveryToken: 'tok',
          },
        }),
        ok: true,
      },
    ])
    render(React.createElement(RecoverPage))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Recovery Code'), { target: { value: 'INVALID-CODE' } })
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: /recover account/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid recovery code')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows error when sealed challenge cannot be opened (wrong code)', async () => {
    mockCrypto.openSealed.mockImplementation(() => {
      throw new Error()
    })
    mockFetch([
      { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true },
      {
        json: () => ({
          success: true,
          data: {
            encPrivRec: 'enc',
            recKdfSalt: 'salt',
            recNonce: 'nonce',
            publicKey: 'pub',
            sealedChallenge: 'sealed',
            recoveryToken: 'tok',
          },
        }),
        ok: true,
      },
    ])
    render(React.createElement(RecoverPage))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Recovery Code'), {
      target: { value: 'ABCD-EFGH-IJKL-MNOP' },
    })
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: /recover account/i }))

    await waitFor(() => {
      expect(screen.getByText('Recovery code does not match this account')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('completes recovery and redirects after 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockFetch([
      { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true },
      {
        json: () => ({
          success: true,
          data: {
            encPrivRec: 'enc',
            recKdfSalt: 'salt',
            recNonce: 'nonce',
            publicKey: 'pub',
            sealedChallenge: 'sealed',
            recoveryToken: 'tok',
          },
        }),
        ok: true,
      },
      { json: () => ({ success: true, data: { csrfToken: 'csrf2' } }), ok: true },
      { json: () => ({ success: true }), ok: true },
    ])
    render(React.createElement(RecoverPage))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Recovery Code'), {
      target: { value: 'ABCD-EFGH-IJKL-MNOP' },
    })
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: /recover account/i }))

    await waitFor(() => {
      expect(screen.getByText('Password Updated!')).toBeInTheDocument()
    })

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(mockPush).toHaveBeenCalledWith('/login')
    vi.useRealTimers()
  })

  it('handles fetch error during recovery', async () => {
    mockFetch([
      {
        json: () => {
          throw new Error('Network error')
        },
      },
    ])
    render(React.createElement(RecoverPage))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Recovery Code'), {
      target: { value: 'ABCD-EFGH-IJKL-MNOP' },
    })
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: /recover account/i }))

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('shows error when recovery-start fails', async () => {
    mockFetch([
      { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true },
      { json: () => ({ success: false, error: 'Invalid username or recovery code' }), ok: true },
    ])
    render(React.createElement(RecoverPage))

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'unknown' } })
    fireEvent.change(screen.getByLabelText('Recovery Code'), {
      target: { value: 'ABCD-EFGH-IJKL-MNOP' },
    })
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpassword123' } })
    fireEvent.click(screen.getByRole('button', { name: /recover account/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid username or recovery code')).toBeInTheDocument()
    })
  })
})
