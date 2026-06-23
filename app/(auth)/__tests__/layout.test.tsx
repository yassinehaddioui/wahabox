// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockCookiesGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: () => ({ get: mockCookiesGet }),
}))

const mockRedirect = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => {
    mockRedirect(...args)
    throw new Error('NEXT_REDIRECT')
  },
}))

const mockGetSession = vi.fn()
vi.mock('@/lib/session', () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
}))

vi.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-provider">{children}</div>,
  SidebarInset: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-inset">{children}</div>,
  SidebarTrigger: () => <button data-testid="sidebar-trigger" />,
}))

vi.mock('@/components/app-sidebar', () => ({
  AppSidebar: () => <div data-testid="app-sidebar" />,
}))

vi.mock('@/components/session-key-sync', () => ({
  SessionKeySync: () => null,
}))

vi.mock('@/lib/session-provider', () => ({
  SessionProvider: ({ value, children }: { value: Record<string, unknown> | null; children: React.ReactNode }) => (
    <div data-testid="session-provider" data-username={value?.username}>
      {children}
    </div>
  ),
}))

import AuthLayout from '@/app/(auth)/layout'

describe('AuthLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when session cookie is missing', async () => {
    mockCookiesGet.mockReturnValue(undefined)
    await expect(AuthLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when session cookie value is empty', async () => {
    mockCookiesGet.mockReturnValue({ value: '' })
    await expect(AuthLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when getSession returns undefined', async () => {
    mockCookiesGet.mockReturnValue({ value: 'invalid-token' })
    mockGetSession.mockReturnValue(undefined)
    await expect(AuthLayout({ children: <div /> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders SessionProvider with username and children when session is valid', async () => {
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockGetSession.mockReturnValue({
      username: 'alice',
      userId: '1',
      tokenVersion: 1,
      createdAt: Date.now(),
    })
    const element = await AuthLayout({ children: <div>protected content</div> })
    render(element)
    const provider = screen.getByTestId('session-provider')
    expect(provider).toHaveAttribute('data-username', 'alice')
    expect(screen.getByText('protected content')).toBeInTheDocument()
    expect(mockGetSession).toHaveBeenCalledWith('valid-token')
  })
})
