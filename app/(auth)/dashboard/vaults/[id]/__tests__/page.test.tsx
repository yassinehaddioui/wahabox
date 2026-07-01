// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: mockBack,
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ id: 'vault-1' }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Mock crypto module
const mockEncryptVaultItem = vi.fn()
const mockDecryptVaultItem = vi.fn()
const mockFromBase64 = vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]))
const mockToBase64 = vi.fn().mockReturnValue('base64-encoded')

// Store per-call arguments for verification
let lastEncryptCall: { title: string; body: string } = { title: '', body: '' }

vi.mock('@/lib/crypto', () => ({
  crypto: {
    ready: Promise.resolve(),
    encryptVaultItem: (...args: unknown[]) => {
      lastEncryptCall = {
        title: args[0] as string,
        body: args[1] as string,
      }
      return mockEncryptVaultItem(...args)
    },
    decryptVaultItem: mockDecryptVaultItem,
    fromBase64: (s: string) => mockFromBase64(s),
    toBase64: (b: Uint8Array) => mockToBase64(b),
  },
}))

vi.mock('@/lib/session-keys', () => ({
  getSessionKeys: vi.fn(() => ({
    publicKey: 'pub-key',
    privateKey: 'priv-key',
    privateKeySign: null,
    publicKeySign: null,
  })),
}))

vi.mock('@/components/ui/md-editor', () => ({
  MdEditor: ({
    id,
    value,
    onChange,
  }: {
    id?: string
    value: string
    onChange: (v: string) => void
    maxLength?: number
    className?: string
  }) =>
    React.createElement('textarea', {
      id,
      value,
      onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
      placeholder: 'Markdown body...',
      'data-testid': id,
    }),
}))

const vaultItemsData = [
  {
    id: 'item-1',
    ciphertextTitle: 'enc-title-1',
    ciphertextBody: 'enc-body-1',
    createdAt: '2024-06-01T12:00:00Z',
    updatedAt: '2024-06-01T12:00:00Z',
  },
  {
    id: 'item-2',
    ciphertextTitle: 'enc-title-2',
    ciphertextBody: 'enc-body-2',
    createdAt: '2024-06-02T15:30:00Z',
    updatedAt: '2024-06-02T15:30:00Z',
  },
]

const vaultsListData = [
  { id: 'vault-1', label: 'My Vault', itemCount: 2 },
  { id: 'vault-2', label: 'Other Vault', itemCount: 0 },
]

import VaultDetailPage from '@/app/(auth)/dashboard/vaults/[id]/page'

describe('VaultDetailPage', () => {
  beforeEach(() => {
    mockBack.mockClear()
    lastEncryptCall = { title: '', body: '' }
    mockEncryptVaultItem.mockClear()
    mockEncryptVaultItem.mockReturnValue({
      ciphertextTitle: new Uint8Array([4, 5, 6]),
      ciphertextBody: new Uint8Array([7, 8, 9]),
    })
    mockDecryptVaultItem.mockClear()
    mockDecryptVaultItem.mockReturnValue({
      title: 'Decrypted Title',
      body: '# Hello Markdown',
    })
    mockFromBase64.mockClear()
    mockToBase64.mockClear()
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
  })

  it('shows loading skeletons initially', () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: [] }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    const skeletons = document.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows empty state when no items', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: [] }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getByText(/No items yet/)).toBeInTheDocument()
    })
  })

  it('renders vault label and items after fetch', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getByText('My Vault')).toBeInTheDocument()
      expect(screen.getByText('2 items')).toBeInTheDocument()
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })
  })

  it('back button calls router.back()', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: [] }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.queryByText(/No items yet/)).toBeInTheDocument()
    })
    const backButton = screen.getByRole('button', { name: '' }) // ArrowLeft icon button
    // Find it more precisely
    const buttons = screen.getAllByRole('button')
    const arrowBtn = buttons.find(
      (b) => b.querySelector('svg.lucide-arrow-left') !== null,
    )
    if (arrowBtn) fireEvent.click(arrowBtn)
    expect(mockBack).toHaveBeenCalled()
  })

  it('creates an item: encrypts title and body, POSTs ciphertexts', async () => {
    const fetchSpy = mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: [] }), ok: true },
      // CSRF token for create-vault-item
      {
        json: () => ({ success: true, data: { csrfToken: 'csrf-1' } }),
        ok: true,
      },
      // POST to create item
      { json: () => ({ success: true, data: { id: 'new-item' } }), ok: true, status: 201 },
      // Refresh items after create
      {
        json: () => ({
          success: true,
          data: [
            {
              id: 'new-item',
              ciphertextTitle: 'new-enc-title',
              ciphertextBody: 'new-enc-body',
              createdAt: '2024-06-03T00:00:00Z',
              updatedAt: '2024-06-03T00:00:00Z',
            },
          ],
        }),
        ok: true,
      },
    ])

    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Item title')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('Item title'), {
      target: { value: 'My Secret Note' },
    })
    fireEvent.change(screen.getByTestId('new-body'), {
      target: { value: '# Top Secret\n\nThis is encrypted.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(lastEncryptCall.title).toBe('My Secret Note')
      expect(lastEncryptCall.body).toBe('# Top Secret\n\nThis is encrypted.')
    })

    // Verify POST was called with correct body
    const postCall = fetchSpy.mock.calls.find(
      (call) =>
        String(call[0]).includes('/api/vaults/vault-1/items') &&
        call[1]?.method === 'POST',
    )
    expect(postCall).toBeTruthy()
    if (postCall) {
      const body = JSON.parse(postCall[1]!.body as string)
      expect(body.csrfToken).toBe('csrf-1')
      expect(body.ciphertextTitle).toBe('base64-encoded')
      expect(body.ciphertextBody).toBe('base64-encoded')
    }
  })

  it('expands item body on header click', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })

    // Click the card header to expand
    const headers = screen.getAllByText('Decrypted Title')
    fireEvent.click(headers[0])

    await waitFor(() => {
      expect(screen.getByText('Hello Markdown')).toBeInTheDocument()
    })
  })

  it('collapses item body on second header click', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })

    // Expand
    const headers = screen.getAllByText('Decrypted Title')
    fireEvent.click(headers[0])
    await waitFor(() => {
      expect(screen.getByText('Hello Markdown')).toBeInTheDocument()
    })

    // Collapse
    fireEvent.click(headers[0])
    await waitFor(() => {
      expect(screen.queryByText('Hello Markdown')).not.toBeInTheDocument()
    })
  })

  it('edit item: pre-fills form, saves with PATCH', async () => {
    const fetchSpy = mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
      // CSRF for edit-vault-item
      {
        json: () => ({ success: true, data: { csrfToken: 'csrf-2' } }),
        ok: true,
      },
      // PATCH response
      {
        json: () => ({
          success: true,
          data: {
            id: 'item-1',
            ciphertextTitle: 'updated-enc-title',
            ciphertextBody: 'updated-enc-body',
          },
        }),
        ok: true,
      },
    ])

    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })

    // Expand first item
    fireEvent.click(screen.getAllByText('Decrypted Title')[0])
    await waitFor(() => {
      expect(screen.getByText('Hello Markdown')).toBeInTheDocument()
    })

    // Click edit
    const editButtons = screen.getAllByLabelText('Edit item')
    fireEvent.click(editButtons[0])
    await waitFor(() => {
      expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe(
        'Decrypted Title',
      )
      expect((screen.getByTestId('edit-body') as HTMLTextAreaElement).value).toBe(
        '# Hello Markdown',
      )
    })

    // Change title and save
    fireEvent.change(screen.getByLabelText('Title'), {
      target: { value: 'Updated Title' },
    })
    fireEvent.click(screen.getByText('Save'))

    await waitFor(() => {
      expect(lastEncryptCall.title).toBe('Updated Title')
      expect(lastEncryptCall.body).toBe('# Hello Markdown')
    })

    // Verify PATCH call
    const patchCall = fetchSpy.mock.calls.find(
      (call) =>
        String(call[0]).includes('/api/vaults/vault-1/items/item-1') &&
        call[1]?.method === 'PATCH',
    )
    expect(patchCall).toBeTruthy()
    if (patchCall) {
      const body = JSON.parse(patchCall[1]!.body as string)
      expect(body.csrfToken).toBe('csrf-2')
    }
  })

  it('cancel edit closes form without saving', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })

    // Expand first item
    fireEvent.click(screen.getAllByText('Decrypted Title')[0])
    await waitFor(() => {
      expect(screen.getByText('Hello Markdown')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByLabelText('Edit item')[0])
    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toBeInTheDocument()
    })

    // Cancel
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(screen.queryByLabelText('Title')).not.toBeInTheDocument()
    })
  })

  it('deletes item with confirmation dialog', async () => {
    const fetchSpy = mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
      // CSRF for delete-vault-item
      {
        json: () => ({ success: true, data: { csrfToken: 'csrf-3' } }),
        ok: true,
      },
      // DELETE response
      { json: () => ({ success: true }), ok: true },
    ])

    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })

    // Click delete on first item
    const deleteButtons = screen.getAllByLabelText('Delete item')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Delete item')).toBeInTheDocument()
    })

    // Click confirm delete
    const deleteDialogButton = screen.getByRole('button', { name: 'Delete' })
    fireEvent.click(deleteDialogButton)

    await waitFor(() => {
      const delCall = fetchSpy.mock.calls.find(
        (call) =>
          String(call[0]).includes('/api/vaults/vault-1/items/item-1') &&
          call[1]?.method === 'DELETE',
      )
      expect(delCall).toBeTruthy()
      if (delCall) {
        const body = JSON.parse(delCall[1]!.body as string)
        expect(body.csrfToken).toBe('csrf-3')
      }
    })
  })

  it('cancel delete dialog does not remove item', async () => {
    mockFetch([
      { json: () => ({ success: true, data: vaultsListData }), ok: true },
      { json: () => ({ success: true, data: vaultItemsData }), ok: true },
    ])
    render(React.createElement(VaultDetailPage))
    await waitFor(() => {
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })

    // Open delete dialog
    fireEvent.click(screen.getAllByLabelText('Delete item')[0])
    await waitFor(() => {
      expect(screen.getByText('Delete item')).toBeInTheDocument()
    })

    // Cancel
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => {
      expect(screen.queryByText('Delete item')).not.toBeInTheDocument()
      expect(screen.getAllByText('Decrypted Title').length).toBe(2)
    })
  })
})
