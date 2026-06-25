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

const mockValidateSession = vi.fn()
vi.mock('@/lib/session', () => ({
  validateSession: (...args: unknown[]) => mockValidateSession(...args),
}))

import AdminPage from '@/app/(auth)/admin/(protected)/page'

describe('AdminPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when session cookie is missing', async () => {
    mockCookiesGet.mockReturnValue(undefined)
    await expect(AdminPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('renders admin panel heading and username', async () => {
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockValidateSession.mockResolvedValue({ userId: '1', username: 'adminuser', tokenVersion: 1, createdAt: Date.now(), role: 'admin' })
    const element = await AdminPage()
    render(element)
    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
    expect(screen.getByText('adminuser')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Coming Soon')).toBeInTheDocument()
  })
})
