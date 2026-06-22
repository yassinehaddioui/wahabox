// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockSearchParamsGet = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: mockSearchParamsGet }),
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardDescription: ({ children }: any) => <div data-testid="card-description">{children}</div>,
  CardTitle: ({ children }: any) => <div data-testid="card-title">{children}</div>,
}))

vi.mock('lucide-react', () => ({
  CheckCircle: () => <div data-testid="icon-check" />,
  XCircle: () => <div data-testid="icon-x" />,
  Loader2: () => <div data-testid="icon-loader" />,
}))

import VerifyEmailPage from '@/app/(public)/verify-email/page'

describe('VerifyEmailPage', () => {
  afterEach(() => {
    resetMockFetch()
  })

  it('shows loading state while verifying', () => {
    mockSearchParamsGet.mockReturnValue('some-token')
    render(<VerifyEmailPage />)
    expect(screen.getByText('Verifying…')).toBeInTheDocument()
  })

  it('shows error when no token is present in URL', async () => {
    mockSearchParamsGet.mockReturnValue(null)
    render(<VerifyEmailPage />)
    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument()
    })
    expect(screen.getByText('No verification token found in the link.')).toBeInTheDocument()
  })

  it('shows success state on successful verification', async () => {
    mockSearchParamsGet.mockReturnValue('valid-token')
    mockFetch({ json: () => ({ success: true, data: { message: 'Email verified!' } }) })
    render(<VerifyEmailPage />)
    await waitFor(() => {
      expect(screen.getByText('Verified!')).toBeInTheDocument()
    })
    expect(screen.getByText('Email verified!')).toBeInTheDocument()
  })

  it('shows error state on failed verification', async () => {
    mockSearchParamsGet.mockReturnValue('valid-token')
    mockFetch({ json: () => ({ success: false, error: 'Invalid or expired token' }) })
    render(<VerifyEmailPage />)
    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument()
    })
    expect(screen.getByText('Invalid or expired token')).toBeInTheDocument()
  })

  it('shows error state on network failure', async () => {
    mockSearchParamsGet.mockReturnValue('valid-token')
    mockFetch({ json: () => { throw new Error('Network error') } })
    render(<VerifyEmailPage />)
    await waitFor(() => {
      expect(screen.getByText('Verification Failed')).toBeInTheDocument()
    })
    expect(screen.getByText('Failed to verify email. Please try again.')).toBeInTheDocument()
  })

  it('calls setTimeout with 2000ms delay on success to redirect', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    mockSearchParamsGet.mockReturnValue('valid-token')
    mockFetch({ json: () => ({ success: true, data: { message: 'Ok' } }) })
    render(<VerifyEmailPage />)
    await waitFor(() => {
      expect(screen.getByText('Verified!')).toBeInTheDocument()
    })
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000)
  })
})
