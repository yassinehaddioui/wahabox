// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminMessagesPage from '@/app/(auth)/admin/(protected)/messages/page'

const originalFetch = globalThis.fetch

type MockFetch = ReturnType<typeof vi.fn>

const defaultStats = {
  success: true,
  data: {
    totalUsers: 5,
    totalBoxes: 10,
    totalMessages: 42,
    adminCount: 2,
    newUsers7d: 1,
    newBoxes7d: 2,
    newMessages7d: 5,
    newUsers30d: 3,
    newBoxes30d: 4,
    newMessages30d: 12,
    activeBoxes: 8,
    inactiveBoxes: 2,
    totalSecureMessages: 30,
    readSecureMessages: 20,
    destroyedSecureMessages: 3,
    autoDestructSecureMessages: 1,
    passwordProtectedSecureMessages: 5,
    pendingSecureMessages: 7,
    newSecureMessages7d: 4,
    newSecureMessages30d: 10,
    secureReadRate: 66.7,
    topSecureSenders: [
      { userId: 'u1', username: 'alice', count: 12 },
      { userId: 'u2', username: 'bob', count: 8 },
      { userId: 'u3', username: 'carol', count: 5 },
    ],
    topDropBoxes: [
      { boxId: 'b1', label: 'Support Inbox', count: 15 },
      { boxId: 'b2', label: 'Feedback Box', count: 7 },
    ],
  },
}

const defaultMessages = {
  success: true,
  data: {
    entries: [
      {
        id: 'm1',
        type: 'secure',
        senderUsername: 'alice',
        targetLabel: null,
        status: 'read',
        createdAt: '2025-01-15T10:00:00.000Z',
        readAt: '2025-01-15T10:30:00.000Z',
      },
      {
        id: 'm2',
        type: 'box',
        senderUsername: null,
        targetLabel: 'Support Inbox',
        status: 'pending',
        createdAt: '2025-03-20T14:30:00.000Z',
        readAt: null,
      },
      {
        id: 'm3',
        type: 'secure',
        senderUsername: 'bob',
        targetLabel: null,
        status: 'destroyed',
        createdAt: '2025-06-01T08:00:00.000Z',
        readAt: null,
      },
    ],
    total: 3,
    page: 1,
    limit: 50,
    totalPages: 1,
  },
}

function setupDefaultMocks(mock: MockFetch) {
  mock.mockImplementation((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    if (urlStr.includes('/api/admin/stats')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
    }
    if (urlStr.includes('/api/admin/messages')) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultMessages) })
    }
    return Promise.reject(new Error('Unknown URL'))
  })
  globalThis.fetch = mock as unknown as typeof fetch
}

/** Wait for page to fully load (both stats + messages resolved) by checking for unique card + table elements */
async function waitForPageLoaded() {
  await waitFor(() => {
    // "Secure Messages" card title is unique
    expect(screen.getByText('Secure Messages')).toBeInTheDocument()
  })
  await waitFor(() => {
    // Table "Timestamp" header is unique
    expect(screen.getByText('Timestamp')).toBeInTheDocument()
  })
}

describe('AdminMessagesPage', () => {
  let mockFetch: MockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  // ── 1. Loading ────────────────────────────────────────

  describe('loading state', () => {
    it('renders skeleton while data is loading', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    })
  })

  // ── 2. Cards ──────────────────────────────────────────

  describe('stats cards', () => {
    it('renders secure messages card with total and read rate', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      // Card heading is unique
      expect(screen.getByText('Secure Messages')).toBeInTheDocument()
      // Card content
      expect(screen.getByText(/Total 30/)).toBeInTheDocument()
      expect(screen.getByText(/Read 20/)).toBeInTheDocument()
      expect(screen.getByText(/66\.7%/)).toBeInTheDocument()
    })

    it('renders top senders card with usernames and counts', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      expect(screen.getByText('Top Senders')).toBeInTheDocument()
      // Scope to the Top Senders card to avoid cross-contamination with table
      const topSendersCard = screen.getByText('Top Senders').closest('[data-slot="card"]') as HTMLElement
      expect(topSendersCard).not.toBeNull()
      expect(within(topSendersCard).getByText('alice')).toBeInTheDocument()
      expect(within(topSendersCard).getByText('bob')).toBeInTheDocument()
      expect(within(topSendersCard).getByText('carol')).toBeInTheDocument()
      expect(within(topSendersCard).getByText('12')).toBeInTheDocument()
      expect(within(topSendersCard).getByText('8')).toBeInTheDocument()
      expect(within(topSendersCard).getByText('5')).toBeInTheDocument()
    })

    it('renders top boxes card with labels and counts', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      expect(screen.getByText('Top Boxes')).toBeInTheDocument()
      const topBoxesCard = screen.getByText('Top Boxes').closest('[data-slot="card"]') as HTMLElement
      expect(topBoxesCard).not.toBeNull()
      expect(within(topBoxesCard).getByText('Support Inbox')).toBeInTheDocument()
      expect(within(topBoxesCard).getByText('Feedback Box')).toBeInTheDocument()
      expect(within(topBoxesCard).getAllByText('15')[0]).toBeInTheDocument()
      expect(within(topBoxesCard).getAllByText('7')[0]).toBeInTheDocument()
    })

    it('shows (none) when top senders is empty', async () => {
      const statsWithNoSenders = {
        ...defaultStats,
        data: { ...defaultStats.data, topSecureSenders: [] },
      }
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(statsWithNoSenders) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultMessages) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      const topSendersCard = screen.getByText('Top Senders').closest('[data-slot="card"]') as HTMLElement
      expect(within(topSendersCard).getByText('(none)')).toBeInTheDocument()
    })

    it('shows (none) when top boxes is empty', async () => {
      const statsWithNoBoxes = {
        ...defaultStats,
        data: { ...defaultStats.data, topDropBoxes: [] },
      }
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(statsWithNoBoxes) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultMessages) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      const topBoxesCard = screen.getByText('Top Boxes').closest('[data-slot="card"]') as HTMLElement
      expect(within(topBoxesCard).getByText('(none)')).toBeInTheDocument()
    })
  })

  // ── 3. Table data ─────────────────────────────────────

  describe('messages table', () => {
    it('renders table rows with type and status badges', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      // Type badges (scoped to table)
      const table = document.querySelector('[data-slot="table"]') as HTMLElement
      const secureBadges = within(table).getAllByText('Secure')
      expect(secureBadges).toHaveLength(2)
      const boxBadges = within(table).getAllByText('Drop')
      expect(boxBadges).toHaveLength(1)

      // Status badges
      expect(within(table).getByText('Read')).toBeInTheDocument()
      expect(within(table).getByText('Pending')).toBeInTheDocument()
      expect(within(table).getByText('Destroyed')).toBeInTheDocument()
    })

    it('renders Anonymous for box messages with null sender', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      const table = document.querySelector('[data-slot="table"]') as HTMLElement
      expect(within(table).getByText('Anonymous')).toBeInTheDocument()
    })

    it('renders target label or dash', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      const table = document.querySelector('[data-slot="table"]') as HTMLElement
      // box message has targetLabel in table
      expect(within(table).getByText('Support Inbox')).toBeInTheDocument()
      // secure messages have null targetLabel → dash (m1, m3 target + m2 readAt + m3 readAt)
      const dashes = within(table).getAllByText('\u2014')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })

    it('renders readAt timestamp or dash', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      // m1 has readAt → formatted timestamp should appear
      // m1 createdAt is '2025-01-15T10:00:00.000Z'
      // readAt is '2025-01-15T10:30:00.000Z'
      // We verify table is not empty and has dashes for null readAt
      const table = document.querySelector('[data-slot="table"]') as HTMLElement
      const dashes = within(table).getAllByText('\u2014')
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ── 4. Filters ────────────────────────────────────────

  describe('filters', () => {
    it('renders type and status filter selects', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      expect(screen.getByLabelText('Filter by type')).toBeInTheDocument()
      expect(screen.getByLabelText('Filter by status')).toBeInTheDocument()
    })

    it('changes type filter refetches with type= param and resets to page 1', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      mockFetch.mockClear()

      const typeTrigger = screen.getByLabelText('Filter by type')
      await userEvent.click(typeTrigger)
      await userEvent.click(screen.getByRole('option', { name: 'Secure' }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls as string[][]
        const url = calls[0]?.[0] ?? ''
        expect(url).toContain('type=secure')
        expect(url).toContain('page=1')
      })
    })

    it('changes status filter refetches with status= param and resets to page 1', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      mockFetch.mockClear()

      const statusTrigger = screen.getByLabelText('Filter by status')
      await userEvent.click(statusTrigger)
      await userEvent.click(screen.getByRole('option', { name: 'Pending' }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls as string[][]
        const url = calls[0]?.[0] ?? ''
        expect(url).toContain('status=pending')
        expect(url).toContain('page=1')
      })
    })

    it('selecting "All types" sends no type param', async () => {
      setupDefaultMocks(mockFetch)

      render(<AdminMessagesPage />)

      await waitForPageLoaded()

      mockFetch.mockClear()

      // First switch to secure to set up a filtered state, then back to All
      const typeTrigger = screen.getByLabelText('Filter by type')
      await userEvent.click(typeTrigger)
      await userEvent.click(screen.getByRole('option', { name: 'Secure' }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls as string[][]
        expect(calls[0]?.[0] ?? '').toContain('type=secure')
      })

      mockFetch.mockClear()

      await userEvent.click(typeTrigger)
      await userEvent.click(screen.getByRole('option', { name: 'All types' }))

      await waitFor(() => {
        const calls = mockFetch.mock.calls as string[][]
        const url = calls[0]?.[0] ?? ''
        expect(url).not.toContain('type=')
      })
    })
  })

  // ── 5. Pagination ─────────────────────────────────────

  describe('pagination', () => {
    const paginatedMessages = {
      success: true,
      data: {
        entries: [defaultMessages.data.entries[0]],
        total: 100,
        page: 1,
        limit: 50,
        totalPages: 2,
      },
    }

    it('renders pagination controls when totalPages > 1', async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(paginatedMessages) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      })

      expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
      expect(screen.getByLabelText('Next page')).toBeInTheDocument()
    })

    it('disables Previous button on first page', async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(paginatedMessages) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      })

      expect(screen.getByLabelText('Previous page')).toBeDisabled()
      expect(screen.getByLabelText('Next page')).not.toBeDisabled()
    })

    it('navigates to next page on button click', async () => {
      let callCount = 0
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        callCount++
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          // First call for initial render; subsequent for pagination
          if (callCount <= 3) {
            return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(paginatedMessages) })
          }
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { ...paginatedMessages.data, page: 2 } }) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      })

      mockFetch.mockClear()

      await userEvent.click(screen.getByLabelText('Next page'))

      await waitFor(() => {
        const calls = mockFetch.mock.calls as string[][]
        const url = calls[0]?.[0] ?? ''
        expect(url).toContain('page=2')
      })
    })
  })

  // ── 6. Empty state ────────────────────────────────────

  describe('empty state', () => {
    it('shows empty message when no entries returned', async () => {
      const emptyMessages = {
        success: true,
        data: { entries: [], total: 0, page: 1, limit: 50, totalPages: 0 },
      }
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(emptyMessages) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('No messages yet.')).toBeInTheDocument()
      })
    })
  })

  // ── 7. Error state ────────────────────────────────────

  describe('error state', () => {
    it('shows error message when messages API rejects', async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load messages')).toBeInTheDocument()
      })

      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('shows error when messages API returns non-success', async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ success: false, error: 'Server error' }) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load messages')).toBeInTheDocument()
      })
    })

    it('retries fetch on Retry button click', async () => {
      // First call: stats succeeds, messages fails
      mockFetch.mockImplementationOnce((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultStats) })
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.reject(new Error('Network error'))
        }
        return Promise.reject(new Error('Unknown URL'))
      })

      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      await waitFor(() => {
        expect(screen.getByText('Failed to load messages')).toBeInTheDocument()
      })

      setupDefaultMocks(mockFetch)

      await userEvent.click(screen.getByText('Retry'))

      await waitFor(() => {
        expect(screen.getByText('Secure Messages')).toBeInTheDocument()
      })
    })

    it('does not crash when stats fetch fails but messages succeeds', async () => {
      mockFetch.mockImplementation((url: string | URL | Request) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/admin/stats')) {
          return Promise.reject(new Error('Stats unreachable'))
        }
        if (urlStr.includes('/api/admin/messages')) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultMessages) })
        }
        return Promise.reject(new Error('Unknown URL'))
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch

      render(<AdminMessagesPage />)

      // Table should still render
      await waitFor(() => {
        expect(screen.getByText('Timestamp')).toBeInTheDocument()
      })

      // Stats unavailable message should appear
      expect(screen.getByText('Stats unavailable')).toBeInTheDocument()

      // Table badges should still be visible
      const table = document.querySelector('[data-slot="table"]') as HTMLElement
      expect(within(table).getAllByText('Secure').length).toBeGreaterThan(0)
    })
  })
})
