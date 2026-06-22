// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockPush = vi.fn()
const mockReplace = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}))

const mockCrypto = vi.hoisted(() => ({
  ready: Promise.resolve(),
  fromBase64: vi.fn(() => new Uint8Array(32)),
  toBase64: vi.fn(() => 'mock-base64'),
  splitMasterKey: vi.fn(() => ({ authKey: new Uint8Array(32), kekPw: new Uint8Array(32) })),
  unwrapPrivateKey: vi.fn(() => new Uint8Array(32)),
  deriveMasterKey: vi.fn(() => new Uint8Array(64)),
  computeAuthVerifier: vi.fn(() => new Uint8Array(32)),
  randomBytes: vi.fn((n: number) => new Uint8Array(n)),
}))

vi.mock('@/lib/crypto', () => ({ crypto: mockCrypto }))
vi.mock('@/lib/session-keys', () => ({ setSessionKeys: vi.fn() }))

import LoginPage from '@/app/(public)/login/page'

describe('LoginPage', () => {
  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
  })

  const boxCheck = { json: () => ({ success: false }), ok: true }
  const saltsOk = { json: () => ({ success: true, data: { pwKdfSalt: 'salt', authSalt: 'salt2' } }), ok: true }
  const csrfOk = { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true }
  const loginOk = { json: () => ({ success: true, data: { encPrivPw: 'enc', pwNonce: 'nonce', publicKey: 'pub' } }), ok: true }

  it('shows sign-in form after session check', async () => {
    mockFetch(boxCheck)
    render(React.createElement(LoginPage))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('redirects to dashboard when already authenticated', async () => {
    mockFetch({ json: () => ({ success: true }), ok: true })
    render(React.createElement(LoginPage))
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('completes login with valid credentials', async () => {
    mockFetch([boxCheck, saltsOk, csrfOk, loginOk])
    render(React.createElement(LoginPage))

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })

  it('shows error on failed login', async () => {
    mockFetch([
      boxCheck,
      saltsOk,
      csrfOk,
      { json: () => ({ success: false, error: 'Invalid credentials' }), ok: true },
    ])
    render(React.createElement(LoginPage))

    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'alice' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })
})
