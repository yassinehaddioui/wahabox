// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuditLogPage from '@/app/(auth)/admin/(protected)/audit-log/page'

const originalFetch = globalThis.fetch

type MockFetch = ReturnType<typeof vi.fn>

const defaultEntries = {
  success: true,
  data: {
    entries: [
      {
        id: 'e1',
        actorId: 'u1',
        actorUsername: 'admin_user',
        action: 'admin.promote',
        targetType: 'user',
        targetId: 'u2',
        targetLabel: 'testuser',
        metadata: {},
        ip: '192.168.1.1',
        createdAt: '2025-01-15T10:00:00.000Z',
      },
      {
        id: 'e2',
        actorId: 'u1',
        actorUsername: 'super_admin',
        action: 'admin.box_deactivate',
        targetType: 'box',
        targetId: 'b1',
        targetLabel: 'My Box',
        metadata: {},
        ip: null,
        createdAt: '2025-03-20T14:30:00.000Z',
      },
      {
        id: 'e3',
        actorId: 'u3',
        actorUsername: 'mod_user',
        action: 'admin.force_logout',
        targetType: 'user',
        targetId: 'u4',
        targetLabel: null,
        metadata: {},
        ip: '10.0.0.5',
        createdAt: '2025-06-01T08:00:00.000Z',
      },
    ],
    total: 3,
    page: 1,
    limit: 50,
    totalPages: 1,
  },
}

function setupDefaultMock(mock: MockFetch) {
  mock.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(defaultEntries),
  })
  globalThis.fetch = mock as unknown as typeof fetch
}

describe('AuditLogPage', () => {
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

      render(<AuditLogPage />)

      expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    })
  })

  // ── Data ─────────────────────────────────────────────

  describe('data state', () => {
    it('renders audit log table with entries', async () => {
      setupDefaultMock(mockFetch)

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('admin_user')).toBeInTheDocument()
      })

      expect(screen.getByText('mod_user')).toBeInTheDocument()
      expect(screen.getByText('Promoted user')).toBeInTheDocument()
      expect(screen.getByText('Deactivated box')).toBeInTheDocument()
      expect(screen.getByText('Force logged out user')).toBeInTheDocument()
      expect(screen.getByText('testuser')).toBeInTheDocument()
      expect(screen.getByText('My Box')).toBeInTheDocument()
      // targetLabel null → falls back to targetId
      expect(screen.getByText('u4')).toBeInTheDocument()
      // targetType badges
      const userBadges = screen.getAllByText('User')
      expect(userBadges).toHaveLength(2)
      expect(screen.getByText('Box')).toBeInTheDocument()
      // IP column
      expect(screen.getByText('192.168.1.1')).toBeInTheDocument()
      expect(screen.getByText('10.0.0.5')).toBeInTheDocument()
      expect(screen.getByText('\u2014')).toBeInTheDocument()
    })
  })

  // ── Action labels ────────────────────────────────────

  describe('action labels', () => {
    it('displays human-readable labels, not raw action strings', async () => {
      setupDefaultMock(mockFetch)

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('Promoted user')).toBeInTheDocument()
      })

      // Verify raw action strings are NOT visible
      expect(screen.queryByText('admin.promote')).not.toBeInTheDocument()
      expect(screen.queryByText('admin.box_deactivate')).not.toBeInTheDocument()
      expect(screen.queryByText('admin.force_logout')).not.toBeInTheDocument()
    })

    it('applies color-coded badges per action type', async () => {
      setupDefaultMock(mockFetch)

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('Promoted user')).toBeInTheDocument()
      })

      // admin.promote → default variant (bg-primary)
      const promoteBadge = screen.getByText('Promoted user')
      expect(promoteBadge).toHaveClass('bg-primary')

      // admin.box_deactivate → amber-tinted secondary
      const deactivateBadge = screen.getByText('Deactivated box')
      expect(deactivateBadge.className).toMatch(/amber/)

      // admin.force_logout → secondary variant
      const logoutBadge = screen.getByText('Force logged out user')
      expect(logoutBadge).toHaveClass('bg-secondary')
    })
  })

  // ── Action filter ────────────────────────────────────

  describe('action filter', () => {
    it('calls API with action param when filter changes', async () => {
      setupDefaultMock(mockFetch)

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('admin_user')).toBeInTheDocument()
      })

      mockFetch.mockClear()

      const trigger = screen.getByLabelText('Filter by action')
      await userEvent.click(trigger)
      await userEvent.click(screen.getByRole('option', { name: 'Promoted user' }))

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('action=admin.promote'),
          expect.anything(),
        )
      })
    })

    it('resets to page 1 when filter changes', async () => {
      setupDefaultMock(mockFetch)

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('admin_user')).toBeInTheDocument()
      })

      // Initial call: page=1, no action filter
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1'),
        expect.anything(),
      )
    })

    it('selects "All actions" sends no action param', async () => {
      // Start with a filtered state
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              ...defaultEntries.data,
              entries: [defaultEntries.data.entries[0]],
              total: 1,
            },
          }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('Promoted user')).toBeInTheDocument()
      })

      mockFetch.mockClear()

      const trigger = screen.getByLabelText('Filter by action')
      await userEvent.click(trigger)
      await userEvent.click(screen.getByRole('option', { name: 'All actions' }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls as string[][]
        const url = calls[0]?.[0] ?? ''
        expect(url).not.toContain('action=')
      })
    })
  })

  // ── Pagination ────────────────────────────────────────

  describe('pagination', () => {
    const paginatedData = {
      success: true,
      data: {
        entries: [defaultEntries.data.entries[0]],
        total: 100,
        page: 1,
        limit: 50,
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

      render(<AuditLogPage />)

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

      render(<AuditLogPage />)

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

      render(<AuditLogPage />)

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
    it('shows empty message when no entries returned', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { entries: [], total: 0, page: 1, limit: 50, totalPages: 0 },
          }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('No audit log entries yet.')).toBeInTheDocument()
      })
    })

    it('does not render table or pagination when empty', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: { entries: [], total: 0, page: 1, limit: 50, totalPages: 0 },
          }),
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('No audit log entries yet.')).toBeInTheDocument()
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

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load audit log')).toBeInTheDocument()
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

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load audit log')).toBeInTheDocument()
      })
    })

    it('retries fetch on Retry button click', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AuditLogPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load audit log')).toBeInTheDocument()
      })

      setupDefaultMock(mockFetch)

      await userEvent.click(screen.getByText('Retry'))

      await waitFor(() => {
        expect(screen.getByText('admin_user')).toBeInTheDocument()
      })
    })
  })
})
