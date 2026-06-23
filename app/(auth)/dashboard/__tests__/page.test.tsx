// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const AUTO_DECRYPT_KEY = 'wahabox:autoDecrypt'
let localStorageStore: Record<string, string> = {}

import DashboardPage from '@/app/(auth)/dashboard/page'

describe('DashboardPage', () => {
  beforeEach(() => {
    mockPush.mockClear()
    localStorageStore = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        localStorageStore[key] = val
      }),
      removeItem: vi.fn((key: string) => {
        delete localStorageStore[key]
      }),
      clear: vi.fn(() => {
        localStorageStore = {}
      }),
      get length() {
        return Object.keys(localStorageStore).length
      },
      key: vi.fn((i: number) => Object.keys(localStorageStore)[i] ?? null),
    })
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn() } })
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const mockBoxesData = {
    success: true,
    data: [
      {
        id: 'box-1',
        label: 'Inbox',
        greeting: null,
        slug: 'abc123',
        isActive: true,
        expiresAt: null,
        maxMessages: null,
        notify: true,
        hasPassword: false,
        createdAt: '2024-01-01T00:00:00Z',
        lastMessageAt: '2024-06-15T10:30:00Z',
        _count: { messages: 5 },
        hasUnread: true,
      },
      {
        id: 'box-2',
        label: 'Work',
        greeting: 'Hello',
        slug: 'def456',
        isActive: false,
        expiresAt: null,
        maxMessages: null,
        notify: false,
        hasPassword: true,
        createdAt: '2024-01-02T00:00:00Z',
        lastMessageAt: null,
        _count: { messages: 2 },
        hasUnread: false,
      },
    ],
  }

  it('shows loading skeletons initially', () => {
    mockFetch([])
    render(React.createElement(DashboardPage))
    const skeletons = document.querySelectorAll('.space-y-3')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no boxes', async () => {
    mockFetch({ json: () => ({ success: true, data: [] }), ok: true })
    render(React.createElement(DashboardPage))
    await waitFor(() => {
      expect(screen.getByText(/No PO boxes yet/)).toBeInTheDocument()
    })
  })

  it('renders boxes after fetch', async () => {
    mockFetch({ json: () => mockBoxesData, ok: true })
    render(React.createElement(DashboardPage))
    await waitFor(() => {
      expect(screen.getByText('Inbox')).toBeInTheDocument()
      expect(screen.getByText('Work')).toBeInTheDocument()
    })
  })

  it('syncs autoDecryptMap from localStorage on mount', async () => {
    localStorageStore[AUTO_DECRYPT_KEY] = JSON.stringify(['box-1'])
    mockFetch({ json: () => mockBoxesData, ok: true })
    render(React.createElement(DashboardPage))
    await waitFor(() => {
      expect(screen.getByText('Inbox')).toBeInTheDocument()
    })
  })

  it('toggleAutoDecrypt writes to localStorage', async () => {
    mockFetch({ json: () => mockBoxesData, ok: true })
    render(React.createElement(DashboardPage))
    await waitFor(() => {
      expect(screen.getByText('Inbox')).toBeInTheDocument()
    })

    const buttons = screen.getAllByLabelText('Toggle auto-decrypt')
    fireEvent.click(buttons[0])

    const stored = JSON.parse(localStorageStore[AUTO_DECRYPT_KEY] ?? '[]')
    expect(stored).toContain('box-1')
  })

  it('creates a new box', async () => {
    mockFetch([
      { json: () => ({ success: true, data: [] }), ok: true },
      { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true },
      { json: () => ({ success: true }), ok: true },
      {
        json: () => ({
          success: true,
          data: [
            {
              id: 'box-new',
              label: 'New Box',
              slug: 'new-slug',
              isActive: true,
              _count: { messages: 0 },
              hasUnread: false,
              notify: true,
              hasPassword: false,
              createdAt: '2024-01-01T00:00:00Z',
              lastMessageAt: null,
            },
          ],
        }),
        ok: true,
      },
    ])
    render(React.createElement(DashboardPage))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Box name')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Box name'), { target: { value: 'New Box' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByText('New Box')).toBeInTheDocument()
    })
  })

  it('copies drop link to clipboard', async () => {
    mockFetch({ json: () => mockBoxesData, ok: true })
    render(React.createElement(DashboardPage))
    await waitFor(() => expect(screen.getByText('Inbox')).toBeInTheDocument())

    const copyButtons = screen.getAllByLabelText('Copy drop link')
    fireEvent.click(copyButtons[0])
    const clipboardMock = vi.mocked(navigator.clipboard.writeText)
    expect(clipboardMock).toHaveBeenCalled()
  })

  it('polls boxes every 30 seconds', async () => {
    vi.useFakeTimers()
    const fetchSpy = mockFetch({ json: () => ({ success: true, data: [] }), ok: true })
    render(React.createElement(DashboardPage))
    expect(fetchSpy).toHaveBeenCalledWith('/api/boxes')

    fetchSpy.mockClear()
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/boxes')

    vi.useRealTimers()
  })

  it('cleans up polling on unmount', async () => {
    vi.useFakeTimers()
    mockFetch({ json: () => ({ success: true, data: [] }), ok: true })
    const { unmount } = render(React.createElement(DashboardPage))
    const fetchSpy = vi.mocked(globalThis.fetch)

    unmount()
    fetchSpy.mockClear()
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(fetchSpy).not.toHaveBeenCalled()

    vi.useRealTimers()
  })

  it('sends label-only PATCH when only label changes in edit dialog', async () => {
    const fetchSpy = mockFetch([
      { json: () => mockBoxesData, ok: true },
      { json: () => ({ success: true, data: { csrfToken: 'csrf' } }), ok: true },
      { json: () => ({ success: true }), ok: true },
      { json: () => mockBoxesData, ok: true },
    ])

    render(React.createElement(DashboardPage))
    await waitFor(() => expect(screen.getByText('Inbox')).toBeInTheDocument())

    const editButtons = screen.getAllByLabelText('Edit box')
    fireEvent.click(editButtons[0])
    await waitFor(() => expect(screen.getByText('Edit Box')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Updated Inbox' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      const patchCall = fetchSpy.mock.calls.find(
        (call) => String(call[0]).includes('/api/boxes/') && call[1]?.method === 'PATCH',
      )
      expect(patchCall).toBeTruthy()
      if (patchCall) {
        const body = JSON.parse(patchCall[1]?.body as string)
        expect(body.label).toBe('Updated Inbox')
        expect(body.greeting).toBeUndefined()
        expect(body.notify).toBeUndefined()
      }
    })
  })

  it('shows rotate dialog on rotate button click', async () => {
    mockFetch({ json: () => mockBoxesData, ok: true })
    render(React.createElement(DashboardPage))
    await waitFor(() => expect(screen.getByText('Inbox')).toBeInTheDocument())

    const rotateButtons = screen.getAllByLabelText('Rotate drop link')
    fireEvent.click(rotateButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Rotate Drop Link')).toBeInTheDocument()
    })
  })
})
