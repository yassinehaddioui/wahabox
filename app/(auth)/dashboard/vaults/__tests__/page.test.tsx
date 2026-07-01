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

import VaultsPage from '@/app/(auth)/dashboard/vaults/page'

describe('VaultsPage', () => {
  beforeEach(() => {
    mockPush.mockClear()
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const mockVaultsData = {
    success: true,
    data: [
      {
        id: 'vault-1',
        label: 'Personal',
        itemCount: 5,
        createdAt: '2025-01-15T10:00:00Z',
        updatedAt: '2025-06-28T14:30:00Z',
      },
      {
        id: 'vault-2',
        label: 'Work',
        itemCount: 12,
        createdAt: '2025-03-01T08:00:00Z',
        updatedAt: '2025-06-30T09:15:00Z',
      },
    ],
  }

  it('shows loading skeletons initially', () => {
    mockFetch([])
    render(React.createElement(VaultsPage))
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no vaults', async () => {
    mockFetch({ json: () => ({ success: true, data: [] }), ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText(/No vaults yet/)).toBeInTheDocument()
    })
  })

  it('renders vaults after fetch', async () => {
    mockFetch({ json: () => mockVaultsData, ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
      expect(screen.getByText('Work')).toBeInTheDocument()
    })
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows updated timestamp after fetch', async () => {
    mockFetch({ json: () => mockVaultsData, ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText(/ago/)).toBeInTheDocument()
    })
  })

  it('creates a new vault', async () => {
    const fetchSpy = mockFetch([
      { json: () => ({ success: true, data: [] }), ok: true },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-token' } }), ok: true },
      { json: () => ({ success: true, data: { id: 'vault-new', label: 'New Vault', createdAt: '2025-01-01T00:00:00Z' } }), ok: true, status: 201 },
      { json: () => mockVaultsData, ok: true },
    ])
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Vault name')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Vault name'), { target: { value: 'New Vault' } })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      const postCall = fetchSpy.mock.calls.find(
        (call) => String(call[0]) === '/api/vaults' && call[1]?.method === 'POST',
      )
      expect(postCall).toBeTruthy()
      if (postCall) {
        const body = JSON.parse(postCall[1]?.body as string)
        expect(body.label).toBe('New Vault')
        expect(body.csrfToken).toBe('csrf-token')
      }
    })
  })

  it('opens edit dialog and updates a vault', async () => {
    const fetchSpy = mockFetch([
      { json: () => mockVaultsData, ok: true },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-edit' } }), ok: true },
      { json: () => ({ success: true }), ok: true },
      { json: () => mockVaultsData, ok: true },
    ])
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByLabelText('Edit vault')
    fireEvent.click(editButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Edit Vault')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Personal Updated' } })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      const patchCall = fetchSpy.mock.calls.find(
        (call) => String(call[0]).includes('/api/vaults/') && call[1]?.method === 'PATCH',
      )
      expect(patchCall).toBeTruthy()
      if (patchCall) {
        const body = JSON.parse(patchCall[1]?.body as string)
        expect(body.label).toBe('Personal Updated')
        expect(body.csrfToken).toBe('csrf-edit')
      }
    })
  })

  it('deletes a vault with confirmation', async () => {
    const fetchSpy = mockFetch([
      { json: () => mockVaultsData, ok: true },
      { json: () => ({ success: true, data: { csrfToken: 'csrf-delete' } }), ok: true },
      { json: () => ({ success: true, data: { id: 'vault-1' } }), ok: true },
      { json: () => ({ success: true, data: [] }), ok: true },
    ])
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('Delete vault')
    fireEvent.click(deleteButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Delete vault')).toBeInTheDocument()
    })

    const confirmInput = screen.getByLabelText(/Type.*DELETE.*to confirm/)
    fireEvent.change(confirmInput, { target: { value: 'DELETE' } })

    const deleteForeverButton = screen.getByText('Delete forever')
    expect(deleteForeverButton).not.toBeDisabled()
    fireEvent.click(deleteForeverButton)

    await waitFor(() => {
      const deleteCall = fetchSpy.mock.calls.find(
        (call) => String(call[0]).includes('/api/vaults/') && call[1]?.method === 'DELETE',
      )
      expect(deleteCall).toBeTruthy()
      if (deleteCall) {
        const body = JSON.parse(deleteCall[1]?.body as string)
        expect(body.csrfToken).toBe('csrf-delete')
      }
    })
  })

  it('shows delete confirmation dialog with correct counts', async () => {
    mockFetch({ json: () => mockVaultsData, ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Work')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('Delete vault')
    fireEvent.click(deleteButtons[1])
    await waitFor(() => {
      expect(screen.getByText(/12 item/)).toBeInTheDocument()
    })
  })

  it('disable delete forever button until DELETE is typed', async () => {
    mockFetch({ json: () => mockVaultsData, ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('Delete vault')
    fireEvent.click(deleteButtons[0])
    await waitFor(() => {
      expect(screen.getByText('Delete vault')).toBeInTheDocument()
    })

    const deleteButton = screen.getByText('Delete forever')
    expect(deleteButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Type.*DELETE.*to confirm/), {
      target: { value: 'DELET' },
    })
    expect(deleteButton).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Type.*DELETE.*to confirm/), {
      target: { value: 'DELETE' },
    })
    expect(deleteButton).not.toBeDisabled()
  })

  it('navigates to vault detail on card click', async () => {
    mockFetch({ json: () => mockVaultsData, ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const links = screen.getAllByRole('link', { name: /Personal/ })
    expect(links[0]).toHaveAttribute('href', '/dashboard/vaults/vault-1')
  })

  it('navigates to vault detail on view button click', async () => {
    mockFetch({ json: () => mockVaultsData, ok: true })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(screen.getByText('Personal')).toBeInTheDocument()
    })

    const viewButtons = screen.getAllByLabelText('View vault')
    fireEvent.click(viewButtons[0])
    expect(mockPush).toHaveBeenCalledWith('/dashboard/vaults/vault-1')
  })

  it('polls vaults every 30 seconds', async () => {
    vi.useFakeTimers()
    const fetchSpy = mockFetch({ json: () => ({ success: true, data: [] }), ok: true })
    render(React.createElement(VaultsPage))
    expect(fetchSpy).toHaveBeenCalledWith('/api/vaults')

    fetchSpy.mockClear()
    act(() => {
      vi.advanceTimersByTime(30000)
    })
    expect(fetchSpy).toHaveBeenCalledWith('/api/vaults')

    vi.useRealTimers()
  })

  it('handles fetch error gracefully', async () => {
    const { toast } = await import('sonner')
    mockFetch({ ok: false, status: 500 })
    render(React.createElement(VaultsPage))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load vaults')
    })
  })
})
