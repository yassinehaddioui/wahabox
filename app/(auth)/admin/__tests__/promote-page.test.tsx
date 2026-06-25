// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
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

vi.mock('@/components/admin-promote-form', () => ({
  AdminPromoteForm: () => <div data-testid="promote-form">Promote Form</div>,
}))

const ORIGINAL_TOKEN = process.env.ADMIN_PROMOTE_TOKEN

import AdminPromotePage from '@/app/(auth)/admin-promote/page'

describe('AdminPromotePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ADMIN_PROMOTE_TOKEN = 'test-token'
  })

  afterAll(() => {
    process.env.ADMIN_PROMOTE_TOKEN = ORIGINAL_TOKEN
  })

  it('redirects to /login when session cookie is missing', async () => {
    mockCookiesGet.mockReturnValue(undefined)
    await expect(AdminPromotePage()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/login')
  })

  it('redirects to /admin when user is already admin', async () => {
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockValidateSession.mockResolvedValue({ userId: '1', username: 'admin', tokenVersion: 1, createdAt: Date.now(), role: 'admin' })
    await expect(AdminPromotePage()).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/admin')
  })

  it('renders promote form when token is configured and user is not admin', async () => {
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockValidateSession.mockResolvedValue({ userId: '1', username: 'user', tokenVersion: 1, createdAt: Date.now(), role: 'user' })
    const element = await AdminPromotePage()
    render(element)
    expect(screen.getByTestId('promote-form')).toBeInTheDocument()
    expect(screen.getByText('Admin Promotion')).toBeInTheDocument()
  })

  it('renders disabled message when ADMIN_PROMOTE_TOKEN is not set', async () => {
    delete process.env.ADMIN_PROMOTE_TOKEN
    mockCookiesGet.mockReturnValue({ value: 'valid-token' })
    mockValidateSession.mockResolvedValue({ userId: '1', username: 'user', tokenVersion: 1, createdAt: Date.now(), role: 'user' })
    const element = await AdminPromotePage()
    render(element)
    expect(screen.getByText('Promotion Disabled')).toBeInTheDocument()
    expect(screen.queryByTestId('promote-form')).not.toBeInTheDocument()
  })
})
