// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminBoxesPage from '@/app/(auth)/admin/(protected)/boxes/page'

const originalFetch = globalThis.fetch
type MockFetch = ReturnType<typeof vi.fn>

const defaultBoxes = {
  success: true,
  data: {
    boxes: [
      { id: 'b1', label: 'Support Inbox', slug: 'support-inbox', isActive: true, ownerId: 'u1', ownerUsername: 'alice', messageCount: 12, hasPassword: true, createdAt: '2025-01-15T10:00:00.000Z' },
      { id: 'b2', label: 'Feedback Box', slug: 'feedback-box', isActive: false, ownerId: 'u2', ownerUsername: 'bob', messageCount: 3, hasPassword: false, createdAt: '2025-03-20T14:30:00.000Z' },
      { id: 'b3', label: 'Newsletter', slug: 'newsletter', isActive: true, ownerId: 'u1', ownerUsername: 'alice', messageCount: 0, hasPassword: false, createdAt: '2025-06-01T08:00:00.000Z' },
    ],
    total: 3, page: 1, limit: 20, totalPages: 1,
  },
}

function mockBoxesResponse(mock: MockFetch, data = defaultBoxes) {
  mock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(data) })
  globalThis.fetch = mock as unknown as typeof fetch
}

describe('AdminBoxesPage', () => {
  let mockFetch: MockFetch

  beforeEach(() => { mockFetch = vi.fn() })
  afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks() })

  // ── 1. Loading ────────────────────────────────────────

  describe('loading state', () => {
    it('renders skeleton while data is loading', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument()
    })
  })

  // ── 2. Data ────────────────────────────────────────────

  describe('data state', () => {
    it('renders boxes table with data', async () => {
      mockBoxesResponse(mockFetch)
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
      expect(screen.getByText('Feedback Box')).toBeInTheDocument()
      expect(screen.getByText('Newsletter')).toBeInTheDocument()
      expect(screen.getAllByText('alice')).toHaveLength(2)
      expect(screen.getByText('bob')).toBeInTheDocument()
      expect(screen.getAllByText('Active')).toHaveLength(2)
      expect(screen.getByText('Inactive')).toBeInTheDocument()
      expect(screen.getByText('12')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('0')).toBeInTheDocument()
      expect(screen.getByLabelText('Password protected')).toBeInTheDocument()
      expect(screen.getAllByLabelText('Deactivate')).toHaveLength(2)
      expect(screen.getByLabelText('Activate')).toBeInTheDocument()
    })
  })

  // ── 3. Search ──────────────────────────────────────────

  describe('search input', () => {
    it('calls API with q param after debounce', async () => {
      mockBoxesResponse(mockFetch)
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
      mockFetch.mockClear()
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { ...defaultBoxes.data, boxes: [defaultBoxes.data.boxes[0]], total: 1 } }) })
      await userEvent.type(screen.getByPlaceholderText('Search by label or owner...'), 'support')
      await waitFor(() => { expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('q=support'), expect.anything()) }, { timeout: 1000 })
    })
  })

  // ── 4. Active filter ───────────────────────────────────

  describe('active filter', () => {
    it('calls API with isActive param when filter changes', async () => {
      mockBoxesResponse(mockFetch)
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
      mockFetch.mockClear()
      await userEvent.click(screen.getByLabelText('Filter by status'))
      await userEvent.click(screen.getByRole('option', { name: 'Active' }))
      await waitFor(() => { expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('isActive=true'), expect.anything()) }, { timeout: 1000 })
    })
  })

  // ── 5. Pagination ──────────────────────────────────────

  describe('pagination', () => {
    const paginatedData = { success: true, data: { ...defaultBoxes.data, total: 25, totalPages: 2 } }

    it('renders pagination controls when totalPages > 1', async () => {
      mockBoxesResponse(mockFetch, paginatedData)
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Page 1 of 2')).toBeInTheDocument() })
      expect(screen.getByLabelText('Previous page')).toBeInTheDocument()
      expect(screen.getByLabelText('Next page')).toBeInTheDocument()
    })

    it('navigates to next page on button click', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve(paginatedData) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { ...paginatedData.data, page: 2 } }) })
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Page 1 of 2')).toBeInTheDocument() })
      mockFetch.mockClear()
      await userEvent.click(screen.getByLabelText('Next page'))
      await waitFor(() => { expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.anything()) })
    })
  })

  // ── 6. Deactivate button ───────────────────────────────

  describe('deactivate action', () => {
    it('calls PATCH with isActive:false when Deactivate clicked', async () => {
      let patchCalled = false
      mockFetch.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/csrf')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { csrfToken: 'tok_123' } }) })
        if (init?.method === 'PATCH') { patchCalled = true; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { id: 'b1', isActive: false, label: 'Support Inbox' } }) }) }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultBoxes) })
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getAllByLabelText('Deactivate')[0]).toBeInTheDocument() })
      await userEvent.click(screen.getAllByLabelText('Deactivate')[0])
      await waitFor(() => { expect(patchCalled).toBe(true) })
    })

    it('calls PATCH with isActive:true when Activate clicked', async () => {
      let patchCalled = false
      mockFetch.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/csrf')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { csrfToken: 'tok_123' } }) })
        if (init?.method === 'PATCH') { patchCalled = true; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { id: 'b2', isActive: true, label: 'Feedback Box' } }) }) }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultBoxes) })
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByLabelText('Activate')).toBeInTheDocument() })
      await userEvent.click(screen.getByLabelText('Activate'))
      await waitFor(() => { expect(patchCalled).toBe(true) })
    })
  })

  // ── 7. Delete dialog ───────────────────────────────────

  describe('delete dialog', () => {
    it('shows confirmation dialog when Delete clicked', async () => {
      mockBoxesResponse(mockFetch)
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
      await userEvent.click(screen.getAllByLabelText('Delete')[0])
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Delete Box' })).toBeInTheDocument() })
      expect(screen.getByText(/permanently delete/)).toBeInTheDocument()
    })

    it('disables Delete Box button until DELETE is typed', async () => {
      mockBoxesResponse(mockFetch)
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
      await userEvent.click(screen.getAllByLabelText('Delete')[0])
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Delete Box' })).toBeInTheDocument() })
      expect(screen.getByRole('button', { name: 'Delete Box' })).toBeDisabled()
    })
  })

  // ── 8. Confirm delete ──────────────────────────────────

  describe('confirm delete', () => {
    it('calls DELETE API when confirmed', async () => {
      let deleteCalled = false
      mockFetch.mockImplementation((url: string | URL | Request, init?: RequestInit) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
        if (urlStr.includes('/api/csrf')) return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { csrfToken: 'tok_789' } }) })
        if (init?.method === 'DELETE') { deleteCalled = true; return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: { message: 'Box deleted' } }) }) }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(defaultBoxes) })
      })
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
      await userEvent.click(screen.getAllByLabelText('Delete')[0])
      await waitFor(() => { expect(screen.getByRole('heading', { name: 'Delete Box' })).toBeInTheDocument() })
      await userEvent.type(screen.getByPlaceholderText('Type DELETE to confirm'), 'DELETE')
      expect(screen.getByRole('button', { name: 'Delete Box' })).not.toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: 'Delete Box' }))
      await waitFor(() => { expect(deleteCalled).toBe(true) })
    })
  })

  // ── 9. Empty state ─────────────────────────────────────

  describe('empty state', () => {
    it('shows empty message when no boxes returned', async () => {
      mockBoxesResponse(mockFetch, { success: true, data: { boxes: [], total: 0, page: 1, limit: 20, totalPages: 0 } })
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('No boxes found.')).toBeInTheDocument() })
    })
  })

  // ── 10. Error state ────────────────────────────────────

  describe('error state', () => {
    it('shows error message when API rejects', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Failed to load boxes')).toBeInTheDocument() })
      expect(screen.getByText('Retry')).toBeInTheDocument()
    })

    it('shows error when API returns non-success', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({ success: false, error: 'Server error' }) })
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Failed to load boxes')).toBeInTheDocument() })
    })

    it('retries fetch on Retry button click', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))
      globalThis.fetch = mockFetch as unknown as typeof fetch
      render(<AdminBoxesPage />)
      await waitFor(() => { expect(screen.getByText('Failed to load boxes')).toBeInTheDocument() })
      mockBoxesResponse(mockFetch)
      await userEvent.click(screen.getByText('Retry'))
      await waitFor(() => { expect(screen.getByText('Support Inbox')).toBeInTheDocument() })
    })
  })
})
