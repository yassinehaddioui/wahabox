// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'

const mockPush = vi.fn()
let mockPathname = '/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: mockPush }),
}))

const mockUseSession = vi.fn()
vi.mock('@/lib/session-provider', () => ({
  useSession: () => mockUseSession(),
}))

vi.mock('@/lib/session-keys', () => ({
  clearSessionKeys: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}))

vi.mock('@/components/ui/sidebar', () => ({
  Sidebar: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar">{children}</div>,
  SidebarContent: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-content">{children}</div>,
  SidebarFooter: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="sidebar-footer" className={className}>{children}</div>
  ),
  SidebarGroup: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-group">{children}</div>,
  SidebarGroupLabel: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-group-label">{children}</div>,
  SidebarHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-header">{children}</div>,
  SidebarMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-menu">{children}</div>,
  SidebarMenuButton: ({
    children,
    isActive,
    render: renderProp,
  }: {
    children: React.ReactNode
    isActive?: boolean
    render?: React.ReactNode
  }) => (
    <button data-testid="sidebar-menu-button" data-active={String(isActive ?? false)}>
      {renderProp}
      {children}
    </button>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => <div data-testid="sidebar-menu-item">{children}</div>,
  SidebarRail: () => <div data-testid="sidebar-rail" />,
}))

import { AppSidebar } from '@/components/app-sidebar'

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname = '/dashboard'
})

describe('AppSidebar', () => {
  it('renders the logo link', () => {
    mockUseSession.mockReturnValue(null)
    render(<AppSidebar />)
    expect(screen.getByText('Wahabox')).toBeInTheDocument()
  })

  it('renders all navigation items', () => {
    mockUseSession.mockReturnValue(null)
    render(<AppSidebar />)
    expect(screen.getByText('Boxes')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('displays username from session', () => {
    mockUseSession.mockReturnValue({ username: 'alice' })
    render(<AppSidebar />)
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('displays ellipsis when no session', () => {
    mockUseSession.mockReturnValue(null)
    render(<AppSidebar />)
    expect(screen.getByText('...')).toBeInTheDocument()
  })

  it('marks the dashboard link as active on /dashboard', () => {
    mockUseSession.mockReturnValue(null)
    mockPathname = '/dashboard'
    render(<AppSidebar />)
    const buttons = screen.getAllByTestId('sidebar-menu-button')
    expect(buttons[0]).toHaveAttribute('data-active', 'true')
    expect(buttons[1]).toHaveAttribute('data-active', 'false')
  })

  it('marks the settings link as active on /settings', () => {
    mockUseSession.mockReturnValue(null)
    mockPathname = '/settings'
    render(<AppSidebar />)
    const buttons = screen.getAllByTestId('sidebar-menu-button')
    expect(buttons[0]).toHaveAttribute('data-active', 'false')
    expect(buttons[1]).toHaveAttribute('data-active', 'true')
  })

  it('clears session keys, POSTs to logout, and redirects on logout click', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchSpy)
    mockUseSession.mockReturnValue(null)
    render(<AppSidebar />)
    await userEvent.click(screen.getByText('Logout'))
    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).toHaveBeenCalledTimes(1)
    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(mockPush).toHaveBeenCalledWith('/login')
    vi.unstubAllGlobals()
  })
})
