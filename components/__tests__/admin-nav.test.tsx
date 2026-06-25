// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

let mockPathname = '/admin'

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}))

// Use LinkBehavior for @testing-library to render <Link> without router context
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

import { AdminNav } from '@/components/admin-nav'

beforeEach(() => {
  vi.clearAllMocks()
  mockPathname = '/admin'
})

describe('AdminNav', () => {
  it('renders all four tabs', () => {
    render(<AdminNav />)
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Boxes')).toBeInTheDocument()
    expect(screen.getByText('Audit Log')).toBeInTheDocument()
  })

  it('highlights the Dashboard tab when on /admin (exact match)', () => {
    mockPathname = '/admin'
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).toContain('border-primary')
    const usersLink = screen.getByText('Users').closest('a')
    expect(usersLink?.className).not.toContain('border-primary')
  })

  it('highlights the Users tab when on /admin/users', () => {
    mockPathname = '/admin/users'
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).not.toContain('border-primary')
    const usersLink = screen.getByText('Users').closest('a')
    expect(usersLink?.className).toContain('border-primary')
  })

  it('highlights the Boxes tab when on /admin/boxes', () => {
    mockPathname = '/admin/boxes'
    render(<AdminNav />)
    const boxesLink = screen.getByText('Boxes').closest('a')
    expect(boxesLink?.className).toContain('border-primary')
  })

  it('highlights the Audit Log tab when on /admin/audit-log', () => {
    mockPathname = '/admin/audit-log'
    render(<AdminNav />)
    const auditLink = screen.getByText('Audit Log').closest('a')
    expect(auditLink?.className).toContain('border-primary')
  })

  it('does not highlight Dashboard when on a subpath like /admin/users (exact match only)', () => {
    mockPathname = '/admin/users'
    render(<AdminNav />)
    const dashboardLink = screen.getByText('Dashboard').closest('a')
    expect(dashboardLink?.className).not.toContain('border-primary')
  })

  it('all tabs have correct href attributes', () => {
    render(<AdminNav />)
    expect(screen.getByText('Dashboard').closest('a')).toHaveAttribute('href', '/admin')
    expect(screen.getByText('Users').closest('a')).toHaveAttribute('href', '/admin/users')
    expect(screen.getByText('Boxes').closest('a')).toHaveAttribute('href', '/admin/boxes')
    expect(screen.getByText('Audit Log').closest('a')).toHaveAttribute('href', '/admin/audit-log')
  })
})
