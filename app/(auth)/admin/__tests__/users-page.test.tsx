// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminUsersPage from '@/app/(auth)/admin/(protected)/users/page'

const originalFetch = globalThis.fetch

type MockFetch = ReturnType<typeof vi.fn>

const defaultUsers = {
  success: true,
  data: {
    users: [
      {
        id: 'u1',
        username: 'alice',
        role: 'admin',
        hasEmail: true,
        emailVerified: true,
        mfaEmail: false,
        mfaTotp: true,
        mfaPasskey: false,
        boxCount: 3,
        createdAt: '2025-01-15T10:00:00.000Z',
      },
      {
        id: 'u2',
        username: 'bob',
        role: 'user',
        hasEmail: true,
        emailVerified: false,
        mfaEmail: true,
        mfaTotp: false,
        mfaPasskey: true,
        boxCount: 1,
        createdAt: '2025-03-20T14:30:00.000Z',
      },
      {
        id: 'u3',
        username: 'carol',
        role: 'user',
        hasEmail: false,
        emailVerified: false,
        mfaEmail: false,
        mfaTotp: false,
        mfaPasskey: false,
        boxCount: 0,
        createdAt: '2025-05-10T08:00:00.000Z',
      },
    ],
    total: 3,
    page: 1,
    limit: 20,
    totalPages: 1,
  },
}

function setupDefaultMock(mock: MockFetch) {
  mock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(defaultUsers),
  })
  globalThis.fetch = mock as unknown as typeof fetch
}

describe('AdminUsersPage', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // ── Loading ──────────────────────────────────────────

  describe('loading state', () => {
    it('renders skeleton while data is loading', () => {
      mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    })
  })

  // ── Data ─────────────────────────────────────────────

  describe('data state', () => {
    it('renders users table with data', async () => {
      setupDefaultMock(mockFetch)

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })

      expect(screen.getByText('bob')).toBeInTheDocument()
      expect(screen.getByText('carol')).toBeInTheDocument()
      expect(screen.getByText('Admin')).toBeInTheDocument()
      const userBadges = screen.getAllByText('User')
      expect(userBadges).toHaveLength(2)
      expect(screen.getByText('Verified')).toBeInTheDocument()
      expect(screen.getByText('Not verified')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByLabelText('TOTP enabled')).toBeInTheDocument()
      expect(screen.getByLabelText('Passkey enabled')).toBeInTheDocument()
      expect(screen.getByLabelText('Email MFA enabled')).toBeInTheDocument()
    })

    it('renders username as link to user detail page', async () => {
      setupDefaultMock(mockFetch)

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })

      const aliceLink = screen.getByText('alice').closest('a')
      expect(aliceLink).toHaveAttribute('href', '/admin/users/u1')
    })
  })

  // ── Search ────────────────────────────────────────────

  describe('search input', () => {
    it('calls API with q param after debounce (300ms)', async () => {
      setupDefaultMock(mockFetch)

      render(<AdminUsersPage />)

      // Wait for initial data to appear
      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })

      mockFetch.mockClear()

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { ...defaultUsers.data, users: [defaultUsers.data.users[0]], total: 1 },
          }),
      })

      const input = screen.getByPlaceholderText('Search by username...')
      await userEvent.type(input, 'alice')

      // Wait for debounce (300ms) + fetch
      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('q=alice'),
            expect.anything(),
          )
        },
        { timeout: 1000 },
      )
    })
  })

  // ── Role filter ───────────────────────────────────────

  describe('role filter', () => {
    it('calls API with role param when filter changes', async () => {
      setupDefaultMock(mockFetch)

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })

      mockFetch.mockClear()

      const trigger = screen.getByLabelText('Filter by role')
      await userEvent.click(trigger)
      await userEvent.click(screen.getByRole('option', { name: 'Admin' }))

      await waitFor(
        () => {
          expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('role=admin'),
            expect.anything(),
          )
        },
        { timeout: 1000 },
      )
    })
  })

  // ── Pagination ────────────────────────────────────────

  describe('pagination', () => {
    const paginatedData = {
      success: true,
      data: {
        users: [defaultUsers.data.users[0]],
        total: 25,
        page: 1,
        limit: 20,
        totalPages: 2,
      },
    }

    it('renders pagination controls when totalPages > 1', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(paginatedData),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      })

      expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
      expect(screen.getByLabelText('Next page')).toBeInTheDocument()
    })

    it('disables Previous button on first page', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(paginatedData),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      })

      expect(screen.getByLabelText('Previous page')).toBeDisabled()
      expect(screen.getByLabelText('Next page')).not.toBeDisabled()
    })

    it('navigates to next page on button click', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(paginatedData),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: { ...paginatedData.data, page: 2 },
            }),
        })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      })

      mockFetch.mockClear()

      const nextButton = screen.getByLabelText('Next page')
      await userEvent.click(nextButton)

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('page=2'),
          expect.anything(),
        )
      })
    })
  })

  // ── Empty state ───────────────────────────────────────

  describe('empty state', () => {
    it('shows empty message when no users returned', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { users: [], total: 0, page: 1, limit: 20, totalPages: 0 },
          }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(
          screen.getByText('No users found matching your search.'),
        ).toBeInTheDocument()
      })
    })

    it('does not render table or pagination when empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { users: [], total: 0, page: 1, limit: 20, totalPages: 0 },
          }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(
          screen.getByText('No users found matching your search.'),
        ).toBeInTheDocument()
      })

      expect(document.querySelector('table')).not.toBeInTheDocument()
      expect(screen.queryByText('Previous')).not.toBeInTheDocument()
    })
  })

  // ── Error state ───────────────────────────────────────

  describe('error state', () => {
    it('shows error message when API rejects', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument()
      })

      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('shows error when API returns non-success', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ success: false, error: 'Server error' }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument()
      })
    })

    it('retries fetch on Retry button click', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminUsersPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load users')).toBeInTheDocument()
      })

      setupDefaultMock(mockFetch)

      await userEvent.click(screen.getByText('Retry'))

      await waitFor(() => {
        expect(screen.getByText('alice')).toBeInTheDocument()
      })
    })
  })
})
