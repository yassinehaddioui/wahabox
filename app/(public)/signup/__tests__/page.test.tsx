// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/use-csrf', () => ({
  useCsrfToken: () => 'test-csrf-token',
}))

vi.mock('@/lib/crypto', () => ({
  crypto: {
    ready: Promise.resolve(),
    randomBytes: vi.fn((n: number) => new Uint8Array(n)),
    deriveMasterKey: vi.fn(() => new Uint8Array(64)),
    splitMasterKey: vi.fn(() => ({
      authKey: new Uint8Array(32),
      kekPw: new Uint8Array(32),
    })),
    generateKeypair: vi.fn(() => ({
      publicKey: new Uint8Array(32),
      privateKey: new Uint8Array(64),
    })),
    generateRecoveryCode: vi.fn(() => 'RECOVERY-CODE-1234'),
    deriveRecoveryKey: vi.fn(() => new Uint8Array(32)),
    wrapPrivateKey: vi.fn(() => ({
      ciphertext: new Uint8Array(80),
      nonce: new Uint8Array(24),
    })),
    computeAuthVerifier: vi.fn(() => new Uint8Array(32)),
    toBase64: vi.fn(() => 'b64-mock'),
  },
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input {...props} />,
}))

vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div data-testid="card" {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div data-testid="card-header" {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div data-testid="card-content" {...props}>{children}</div>,
  CardDescription: ({ children, ...props }: any) => <div data-testid="card-description" {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <div data-testid="card-title" {...props}>{children}</div>,
}))

vi.mock('@/components/turnstile-widget', () => ({
  TurnstileWidget: () => <div data-testid="turnstile-widget" />,
}))

import SignupPage from '@/app/(public)/signup/page'

describe('SignupPage', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    resetMockFetch()
  })

  it('renders the signup form with username and password fields', () => {
    render(<SignupPage />)
    expect(screen.getByTestId('card-title')).toHaveTextContent('Create Account')
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Account' })).toBeInTheDocument()
  })

  it('transitions to recovery step after form submit', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Save Your Recovery Code')).toBeInTheDocument()
    expect(screen.getByText('RECOVERY-CODE-1234')).toBeInTheDocument()
  })

  it('stores signup data in sessionStorage on form submit', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('Save Your Recovery Code')
    expect(sessionStorage.getItem('signup:username')).toBe('testuser')
    expect(sessionStorage.getItem('signup:authVerifier')).toBe('b64-mock')
    expect(sessionStorage.getItem('signup:authSalt')).toBe('b64-mock')
  })

  it('shows error when recovery code confirmation does not match', async () => {
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('Save Your Recovery Code')
    await user.click(screen.getByText("I've saved my recovery code"))
    await user.type(screen.getByPlaceholderText('Enter your recovery code'), 'WRONG-CODE')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText(/Recovery code does not match/)).toBeInTheDocument()
  })

  it('makes API request on confirm and shows done on success', async () => {
    const fetchStub = mockFetch({
      json: () => ({ success: true, data: { message: 'Account created' } }),
    })
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('Save Your Recovery Code')
    await user.click(screen.getByText("I've saved my recovery code"))
    await user.type(screen.getByPlaceholderText('Enter your recovery code'), 'RECOVERY-CODE-1234')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Account Created!')).toBeInTheDocument()

    const lastCall = fetchStub.mock.lastCall
    expect(lastCall[0]).toBe('/api/auth/signup')
    expect(lastCall[1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    const payload = JSON.parse(lastCall[1].body)
    expect(payload).toMatchObject({
      username: 'testuser',
      csrfToken: 'test-csrf-token',
      turnstileToken: null,
    })
  })

  it('shows error on API failure during signup', async () => {
    mockFetch({
      json: () => ({ success: false, error: 'Username already taken' }),
    })
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('Save Your Recovery Code')
    await user.click(screen.getByText("I've saved my recovery code"))
    await user.type(screen.getByPlaceholderText('Enter your recovery code'), 'RECOVERY-CODE-1234')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    expect(await screen.findByText('Username already taken')).toBeInTheDocument()
  })

  it('clears sessionStorage after successful signup', async () => {
    mockFetch({
      json: () => ({ success: true, data: { message: 'Account created' } }),
    })
    const user = userEvent.setup()
    render(<SignupPage />)
    await user.type(screen.getByLabelText('Username'), 'testuser')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('Save Your Recovery Code')
    await user.click(screen.getByText("I've saved my recovery code"))
    await user.type(screen.getByPlaceholderText('Enter your recovery code'), 'RECOVERY-CODE-1234')
    await user.click(screen.getByRole('button', { name: 'Create Account' }))
    await screen.findByText('Account Created!')
    expect(sessionStorage.getItem('signup:username')).toBeNull()
    expect(sessionStorage.getItem('signup:authVerifier')).toBeNull()
    expect(sessionStorage.getItem('signup:publicKey')).toBeNull()
  })
})
