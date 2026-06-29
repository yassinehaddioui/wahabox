// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: mockToast }))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'user-1' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import UserDetailPage from '@/app/(auth)/admin/(protected)/users/[id]/page'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

function mockFetchResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

const defaultUser = {
  id: 'user-1',
  username: 'testuser',
  role: 'user' as const,
  hasEmail: true,
  emailVerified: true,
  notificationsEnabled: true,
  mfaEmail: false,
  mfaTotp: true,
  mfaPasskey: false,
  keyVersion: 42,
  tokenVersion: 7,
  suspended: false,
  createdAt: '2024-01-15T10:30:00.000Z',
  boxCount: 3,
  passkeyCount: 1,
  messageCount: 128,
}

const adminUser = {
  ...defaultUser,
  username: 'adminuser',
  role: 'admin' as const,
  suspended: false,
  mfaTotp: true,
  mfaPasskey: true,
}

describe('UserDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ── Basic render ──────────────────────────────────────────────

  it('renders user detail after successful fetch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    expect(screen.getByText('user')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
    expect(screen.getByText('Back to Users')).toBeInTheDocument()
  })

  it('renders security card with MFA statuses', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('testuser')).toBeInTheDocument()
    })

    expect(screen.getByText('Set')).toBeInTheDocument()
    expect(screen.getByText('Verified')).toBeInTheDocument()
    // TOTP enabled
    expect(screen.getByText('TOTP')).toBeInTheDocument()
    const enabledBadges = screen.getAllByText('Enabled')
    expect(enabledBadges.length).toBeGreaterThanOrEqual(1)
    // Passkey disabled
    const disabledBadges = screen.getAllByText('Disabled')
    expect(disabledBadges.length).toBeGreaterThanOrEqual(1)
  })

  it('renders stats card', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Statistics')).toBeInTheDocument()
    })

    expect(screen.getByText('PO Boxes')).toBeInTheDocument()
    expect(screen.getByText('Messages')).toBeInTheDocument()
    expect(screen.getByText('Passkeys')).toBeInTheDocument()
  })

  // ── Action buttons ────────────────────────────────────────────

  it('shows Promote to Admin button when role is user', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Promote to Admin')).toBeInTheDocument()
    })

    expect(screen.getByText('Force Logout')).toBeInTheDocument()
    expect(screen.queryByText('Demote to User')).not.toBeInTheDocument()
  })

  it('shows Demote to User button when role is admin', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: adminUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('adminuser')).toBeInTheDocument()
    })

    expect(screen.getByText('Demote to User')).toBeInTheDocument()
    expect(screen.queryByText('Promote to Admin')).not.toBeInTheDocument()
  })

  // ── Promote action ────────────────────────────────────────────

  it('promote action fetches CSRF token then calls PATCH API', async () => {
    const fetchCalls: string[] = []
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push(init?.method ?? 'GET')
      if (url === '/api/admin/users/user-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      if (url === '/api/csrf?tag=admin-user-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-abc' } })
      }
      if (url === '/api/admin/users/user-1' && init?.method === 'PATCH') {
        return mockFetchResponse(200, { success: true, data: { message: 'User promoted to admin', action: 'promote' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Promote to Admin')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Promote to Admin'))

    await waitFor(() => {
      expect(fetchCalls).toContain('PATCH')
    })

    // First call after click should be CSRF
    expect(fetchCalls[1]).toBe('GET') // CSRF fetch
    expect(fetchCalls[2]).toBe('PATCH') // PATCH call

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('User promoted to admin')
    })
  })

  it('promote action shows error toast on API failure', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/users/user-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      if (url === '/api/csrf?tag=admin-user-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-abc' } })
      }
      if (url === '/api/admin/users/user-1' && init?.method === 'PATCH') {
        return mockFetchResponse(400, { success: false, error: 'Cannot demote yourself' })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Promote to Admin')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Promote to Admin'))

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Cannot demote yourself')
    })
  })

  // ── Force Logout with confirmation dialog ─────────────────────

  it('force logout shows confirmation dialog', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Force Logout')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Force Logout'))

    await waitFor(() => {
      expect(screen.getByText('Confirm Force Logout')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/invalidate all active sessions for/),
    ).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('force logout cancel button closes dialog', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Force Logout')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Force Logout'))

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Cancel'))

    await waitFor(() => {
      expect(screen.queryByText('Cancel')).not.toBeInTheDocument()
    })
  })

  it('force logout confirm calls PATCH with force_logout action', async () => {
    const fetchCalls: string[] = []
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push(init?.method ?? 'GET')
      if (url === '/api/admin/users/user-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      if (url === '/api/csrf?tag=admin-user-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-xyz' } })
      }
      if (url === '/api/admin/users/user-1' && init?.method === 'PATCH') {
        return mockFetchResponse(200, { success: true, data: { message: 'User force-logged out', action: 'force_logout' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Force Logout')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Force Logout'))

    await waitFor(() => {
      expect(screen.getByText('Confirm Force Logout')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Confirm Force Logout'))

    await waitFor(() => {
      expect(fetchCalls).toContain('PATCH')
    })

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('User force-logged out')
    })
  })

  // ── Not found state ───────────────────────────────────────────

  it('shows not found message when user does not exist', async () => {
    mockFetch.mockImplementation(() =>
      mockFetchResponse(404, { success: false, error: 'Not found' }),
    )

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument()
    })

    expect(screen.getByText('Back to Users')).toBeInTheDocument()
  })

  // ── Error state ───────────────────────────────────────────────

  it('shows error message when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load user')).toBeInTheDocument()
    })

    expect(screen.getByText('Back to Users')).toBeInTheDocument()
  })

  it('shows error message when API returns error response', async () => {
    mockFetch.mockImplementation(() =>
      mockFetchResponse(500, { success: false, error: 'Internal error' }),
    )

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load user')).toBeInTheDocument()
    })
  })

  // ── Demote action ─────────────────────────────────────────────

  it('demote action calls PATCH API for admin role', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/users/user-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: adminUser })
      }
      if (url === '/api/csrf?tag=admin-user-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-demote' } })
      }
      if (url === '/api/admin/users/user-1' && init?.method === 'PATCH') {
        return mockFetchResponse(200, { success: true, data: { message: 'User demoted to user', action: 'demote' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Demote to User')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Demote to User'))

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('User demoted to user')
    })
  })

  // ── Action error toast (CSRF failure) ─────────────────────────

  it('shows error toast when CSRF fetch fails', async () => {
    mockFetch.mockImplementation((url: string, _init?: RequestInit) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      if (url === '/api/csrf?tag=admin-user-action') {
        return mockFetchResponse(500, { success: false, error: 'CSRF error' })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Promote to Admin')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Promote to Admin'))

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to get security token')
    })
  })

  // ── Suspend / Unsuspend ───────────────────────────────────────

  it('shows Suspend User button when user is not suspended', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Suspend User')).toBeInTheDocument()
    })
  })

  it('does not show Suspend User button when role is admin', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: adminUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('adminuser')).toBeInTheDocument()
    })

    expect(screen.queryByText('Suspend User')).not.toBeInTheDocument()
  })

  it('shows Unsuspend User button and Suspended badge when suspended', async () => {
    const suspendedUser = { ...defaultUser, suspended: true }

    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: suspendedUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Unsuspend User')).toBeInTheDocument()
    })

    expect(screen.getByText('Suspended')).toBeInTheDocument()
    expect(screen.queryByText('Suspend User')).not.toBeInTheDocument()
  })

  it('suspend confirmation dialog shows with correct message', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/users/user-1') {
        return mockFetchResponse(200, { success: true, data: defaultUser })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Suspend User')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Suspend User'))

    await waitFor(() => {
      expect(screen.getByText('Confirm Suspend')).toBeInTheDocument()
    })

    expect(
      screen.getByText(/Are you sure you want to suspend this user/),
    ).toBeInTheDocument()
  })

  it('unsuspend action calls PATCH API', async () => {
    const suspendedUser = { ...defaultUser, suspended: true }

    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/users/user-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: suspendedUser })
      }
      if (url === '/api/csrf?tag=admin-user-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-unsuspend' } })
      }
      if (url === '/api/admin/users/user-1' && init?.method === 'PATCH') {
        return mockFetchResponse(200, { success: true, data: { message: 'User unsuspended', action: 'unsuspend' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<UserDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Unsuspend User')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Unsuspend User'))

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('User unsuspended')
    })
  })
})
