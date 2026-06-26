// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: mockToast }))

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'box-1' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import BoxDetailPage from '@/app/(auth)/admin/(protected)/boxes/[id]/page'

const mockFetch = vi.fn()
const originalFetch = globalThis.fetch

function mockFetchResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  })
}

const defaultBox = {
  id: 'box-1',
  label: 'Support Inbox',
  greeting: 'Welcome to our support box!',
  slug: 'support-inbox',
  notify: true,
  isActive: true,
  expiresAt: '2025-12-31T00:00:00.000Z',
  maxMessages: 500,
  createdAt: '2024-03-15T10:30:00.000Z',
  hasPassword: true,
  ownerUsername: 'john_doe',
  ownerId: 'user-42',
  messageCount: 128,
  recentMessages: [
    { id: 'msg-aaa111bbb2', readAt: '2024-06-01T12:00:00.000Z', createdAt: '2024-05-30T08:15:00.000Z' },
    { id: 'msg-ccc333ddd4', readAt: null, createdAt: '2024-05-29T14:22:00.000Z' },
    { id: 'msg-eee555fff6', readAt: null, createdAt: '2024-05-28T09:45:00.000Z' },
  ],
}

const inactiveBox = {
  ...defaultBox,
  label: 'Old Archive',
  isActive: false,
  notify: false,
  hasPassword: false,
  greeting: null,
  recentMessages: [],
  messageCount: 0,
}

describe('BoxDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  // ── 1. Renders box detail ─────────────────────────────────────

  it('renders box detail after successful fetch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Support Inbox')).toBeInTheDocument()
    })

    expect(screen.getByText('support-inbox')).toBeInTheDocument()
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByText('Back to Boxes')).toBeInTheDocument()
    const activeElements = screen.getAllByText('Active')
    expect(activeElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Password Set')).toBeInTheDocument()
    expect(screen.getByText('Enabled')).toBeInTheDocument()
  })

  // ── 2. Shows owner username as link ───────────────────────────

  it('shows owner username as link to user detail page', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('john_doe')).toBeInTheDocument()
    })

    const ownerLink = screen.getByText('john_doe')
    expect(ownerLink.closest('a')).toHaveAttribute('href', '/admin/users/user-42')
  })

  // ── 3. Shows recent messages metadata ─────────────────────────

  it('shows recent messages table with metadata (no content)', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Recent Messages')).toBeInTheDocument()
    })

    // Table headers (use getAllByText to handle "Status" appearing in card title too)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getAllByText('Status')).toHaveLength(2)
    expect(screen.getByText('ID')).toBeInTheDocument()

    // Message statuses
    expect(screen.getByText('Read')).toBeInTheDocument()
    expect(screen.getAllByText('Unread')).toHaveLength(2)

    // Message ID prefixes (truncated)
    expect(screen.getByText('msg-aaa111bb')).toBeInTheDocument()
    expect(screen.getByText('msg-ccc333dd')).toBeInTheDocument()
    expect(screen.getByText('msg-eee555ff')).toBeInTheDocument()

    // No message content should be visible
    expect(screen.queryByText(/encrypted|ciphertext|balloons/)).not.toBeInTheDocument()
  })

  it('shows "No messages yet" when box has no messages', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: inactiveBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Old Archive')).toBeInTheDocument()
    })

    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  // ── 4. Deactivate/Activate buttons call PATCH ─────────────────

  it('deactivate button calls PATCH with isActive=false', async () => {
    const fetchCalls: string[] = []
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push(init?.method ?? 'GET')
      if (url === '/api/admin/boxes/box-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      if (url === '/api/csrf?tag=admin-box-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-abc' } })
      }
      if (url === '/api/admin/boxes/box-1' && init?.method === 'PATCH') {
        return mockFetchResponse(200, { success: true, data: { id: 'box-1', isActive: false, label: 'Support Inbox' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Deactivate')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Deactivate'))

    await waitFor(() => {
      expect(fetchCalls).toContain('PATCH')
    })

    // First call after click should be CSRF, second should be PATCH
    expect(fetchCalls[1]).toBe('GET')
    expect(fetchCalls[2]).toBe('PATCH')

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Box deactivated')
    })
  })

  it('activate button calls PATCH with isActive=true', async () => {
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/admin/boxes/box-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: inactiveBox })
      }
      if (url === '/api/csrf?tag=admin-box-action') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-xyz' } })
      }
      if (url === '/api/admin/boxes/box-1' && init?.method === 'PATCH') {
        return mockFetchResponse(200, { success: true, data: { id: 'box-1', isActive: true, label: 'Old Archive' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Activate')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Activate'))

    await waitFor(() => {
      expect(mockToast.success).toHaveBeenCalledWith('Box activated')
    })
  })

  // ── 5. Delete shows confirmation dialog ───────────────────────

  it('delete button shows confirmation dialog', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Delete Box')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete Box'))

    await waitFor(() => {
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument()
    })

    expect(screen.getByText(/permanently delete/i)).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('delete confirmation calls DELETE API', async () => {
    const fetchCalls: string[] = []
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      fetchCalls.push(init?.method ?? 'GET')
      if (url === '/api/admin/boxes/box-1' && (!init || init.method === undefined)) {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      if (url === '/api/csrf?tag=admin-box-delete') {
        return mockFetchResponse(200, { success: true, data: { csrfToken: 'csrf-del' } })
      }
      if (url === '/api/admin/boxes/box-1' && init?.method === 'DELETE') {
        return mockFetchResponse(200, { success: true, data: { message: 'Box deleted' } })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Delete Box')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Delete Box'))

    await waitFor(() => {
      expect(screen.getByText('Confirm Delete')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Confirm Delete'))

    await waitFor(() => {
      expect(fetchCalls).toContain('DELETE')
    })
  })

  // ── 6. Box not found state ────────────────────────────────────

  it('shows not found message when box does not exist', async () => {
    mockFetch.mockImplementation(() =>
      mockFetchResponse(404, { success: false, error: 'Not found' }),
    )

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Box not found')).toBeInTheDocument()
    })

    expect(screen.getByText('Back to Boxes')).toBeInTheDocument()
  })

  // ── 7. Error state ────────────────────────────────────────────

  it('shows error message when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'))

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load box')).toBeInTheDocument()
    })

    expect(screen.getByText('Back to Boxes')).toBeInTheDocument()
  })

  it('shows error message when API returns error response', async () => {
    mockFetch.mockImplementation(() =>
      mockFetchResponse(500, { success: false, error: 'Internal error' }),
    )

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load box')).toBeInTheDocument()
    })
  })

  // ── External link ─────────────────────────────────────────────

  it('shows drop page link with correct href', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Drop Page')).toBeInTheDocument()
    })

    const dropLink = screen.getByText('Open drop page in new tab')
    expect(dropLink.closest('a')).toHaveAttribute('href', '/drop/support-inbox')
    expect(dropLink.closest('a')).toHaveAttribute('target', '_blank')
  })

  // ── Action error toast (CSRF failure) ─────────────────────────

  it('shows error toast when CSRF fetch fails', async () => {
    mockFetch.mockImplementation((url: string, _?: RequestInit) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: defaultBox })
      }
      if (url === '/api/csrf?tag=admin-box-action') {
        return mockFetchResponse(500, { success: false, error: 'CSRF error' })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Deactivate')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Deactivate'))

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith('Failed to get security token')
    })
  })

  // ── Inactive box renders correctly ────────────────────────────

  it('renders inactive box with no password and disabled notifications', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === '/api/admin/boxes/box-1') {
        return mockFetchResponse(200, { success: true, data: inactiveBox })
      }
      return mockFetchResponse(404, { success: false, error: 'Not found' })
    })

    render(<BoxDetailPage />)

    await waitFor(() => {
      expect(screen.getByText('Old Archive')).toBeInTheDocument()
    })

    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('No Password')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText('Activate')).toBeInTheDocument()
  })
})
