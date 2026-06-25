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

import AdminLayout from '@/app/(auth)/admin/(protected)/layout'

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('redirects to /login when session cookie is missing', async () => {
    mockCookiesGet.mockReturnValue(undefined)
    await expect(AdminLayout({ children: <div>admin content</div> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login when session is invalid', async () => {
    mockCookiesGet.mockReturnValue({ value: 'invalid-token' })
    mockValidateSession.mockResolvedValue(undefined)
    await expect(AdminLayout({ children: <div>admin content</div> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /admin-promote when user is not admin', async () => {
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockValidateSession.mockResolvedValue({ userId: '1', username: 'user', tokenVersion: 1, createdAt: Date.now(), role: 'user' })
    await expect(AdminLayout({ children: <div>admin content</div> })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/admin-promote')
  })

  it('renders children when user is admin', async () => {
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockValidateSession.mockResolvedValue({ userId: '1', username: 'admin', tokenVersion: 1, createdAt: Date.now(), role: 'admin' })
    const element = await AdminLayout({ children: <div>admin content</div> })
    render(element)
    expect(screen.getByText('admin content')).toBeInTheDocument()
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
