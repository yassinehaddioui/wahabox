// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockUseParams = vi.fn()
const mockBack = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({
    back: mockBack,
    push: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/session-keys', () => ({
  getSessionKeys: vi.fn(() => ({ publicKey: 'test-pub', privateKey: 'test-priv' })),
}))

const mockCrypto = vi.hoisted(() => ({
  ready: Promise.resolve(),
  fromBase64: vi.fn(() => new Uint8Array(32)),
  openMessage: vi.fn(() => 'Decrypted content'),
}))

vi.mock('@/lib/crypto', () => ({ crypto: mockCrypto }))

vi.mock('@/components/ui/markdown', () => ({
  Markdown: ({ children }: { children: React.ReactNode }) => <div data-testid="markdown">{children}</div>,
}))

vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={className} data-testid="skeleton" />,
}))

import MessagesPage from '@/app/(auth)/dashboard/boxes/[id]/page'

const AUTO_DECRYPT_KEY = 'wahabox:autoDecrypt'
let localStorageStore: Record<string, string> = {}

const mockMessage = (overrides = {}) => ({
  id: 'msg-1',
  ciphertext: 'base64-cipher',
  readAt: null,
  createdAt: '2024-06-15T10:30:00.000Z',
  ...overrides,
})

const mockReadMessage = () => mockMessage({ id: 'msg-2', readAt: '2024-06-15T12:00:00.000Z' })
const mockDecryptedMessage = () =>
  mockMessage({ id: 'msg-3', readAt: '2024-06-15T12:00:00.000Z', plaintext: 'Hello' })

describe('MessagesPage', () => {
  let createObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ id: 'box-1' })
    mockBack.mockClear()

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

    createObjectURL = vi.fn(() => 'blob:mock')
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const emptyMessages = {
    json: () => ({ success: true, data: [] }),
    ok: true,
  }

  const twoMessages = {
    json: () => ({
      success: true,
      data: [mockMessage(), mockReadMessage()],
    }),
    ok: true,
  }

  // --- loading state ---
  it('shows skeleton loading state', () => {
    mockFetch(emptyMessages)
    render(React.createElement(MessagesPage))
    const skeletons = screen.getAllByTestId('skeleton')
    expect(skeletons.length).toBeGreaterThanOrEqual(3)
  })

  // --- empty messages ---
  it('shows empty state when no messages exist', async () => {
    mockFetch(emptyMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('No messages yet.')).toBeInTheDocument()
    })
  })

  // --- message list rendering ---
  it('renders messages after fetch', async () => {
    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
      expect(screen.getByText('(1 new)')).toBeInTheDocument()
      expect(screen.getByText('NEW')).toBeInTheDocument()
    })
  })

  it('renders one message with singular count', async () => {
    mockFetch({
      json: () => ({ success: true, data: [mockReadMessage()] }),
      ok: true,
    })
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('1 message')).toBeInTheDocument()
    })
  })

  // --- decrypt -> marks as read ---
  it('marks a message as read when decrypted for the first time', async () => {
    const fetchStub = mockFetch([twoMessages, { json: () => ({ success: true }), ok: true }])
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    const decryptButtons = screen.getAllByLabelText('Decrypt message')
    fireEvent.click(decryptButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('markdown')).toBeInTheDocument()
    })

    const patchCall = fetchStub.mock.calls.find(
      (call) => String(call[0]).includes('/api/messages/msg-1') && call[1]?.method === 'PATCH',
    )
    expect(patchCall).toBeTruthy()
  })

  // --- auto-decrypt ---
  it('auto-decrypts unread messages when auto-decrypt is on', async () => {
    localStorageStore[AUTO_DECRYPT_KEY] = JSON.stringify(['box-1'])

    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))

    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(mockCrypto.openMessage).toHaveBeenCalled()
    })
  })

  // --- delete confirmation ---
  it('opens delete confirmation dialog and deletes the message', async () => {
    const fetchStub = mockFetch([twoMessages, { json: () => ({ success: true }), ok: true }])
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByLabelText('Delete message')
    fireEvent.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.getByText('Delete message')).toBeInTheDocument()
      expect(screen.getByText(/cannot be undone/)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      const deleteCall = fetchStub.mock.calls.find(
        (call) => String(call[0]).includes('/api/messages/msg-1') && call[1]?.method === 'DELETE',
      )
      expect(deleteCall).toBeTruthy()
    })
  })

  it('closes delete dialog on cancel', async () => {
    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByLabelText('Delete message')[0])
    await waitFor(() => {
      expect(screen.getByText('Delete message')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => {
      expect(screen.queryByText('Delete message')).not.toBeInTheDocument()
    })
  })

  // --- Blob download ---
  it('downloads decrypted message as markdown file', async () => {
    const decrypted = mockDecryptedMessage()
    mockFetch({
      json: () => ({ success: true, data: [decrypted] }),
      ok: true,
    })
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('1 message')).toBeInTheDocument()
    })

    const downloadButton = screen.getByLabelText('Download as markdown')
    expect(downloadButton).not.toBeDisabled()

    fireEvent.click(downloadButton)

    expect(createObjectURL).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text/markdown;charset=utf-8' }),
    )
  })

  it('disables download button for non-decrypted messages', async () => {
    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    const downloadButtons = screen.getAllByLabelText('Download as markdown')
    downloadButtons.forEach((btn) => {
      expect(btn).toBeDisabled()
    })
  })

  // --- fetch failure ---
  it('shows toast on fetch failure', async () => {
    const { toast } = await import('sonner')
    mockFetch({
      json: () => {
        throw new Error('Network error')
      },
      ok: false,
    })
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to load messages')
    })
  })

  // --- decrypt failure ---
  it('shows toast when decryption fails', async () => {
    const { toast } = await import('sonner')
    mockCrypto.openMessage.mockImplementationOnce(() => {
      throw new Error('Decrypt fail')
    })

    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    const decryptButtons = screen.getAllByLabelText('Decrypt message')
    fireEvent.click(decryptButtons[0])
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to decrypt message')
    })
  })

  // --- missing session keys ---
  it('shows toast when session keys are missing during decrypt', async () => {
    const { toast } = await import('sonner')
    const { getSessionKeys } = await import('@/lib/session-keys')
    vi.mocked(getSessionKeys).mockReturnValueOnce(null)

    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    const decryptButtons = screen.getAllByLabelText('Decrypt message')
    fireEvent.click(decryptButtons[0])
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Encryption keys not found. Please refresh the page or sign in again.',
      )
    })
  })

  // --- toggle auto-decrypt ---
  it('toggles auto-decrypt preference via switch', async () => {
    mockFetch(twoMessages)
    render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })

    const autoDecryptSwitch = screen.getByRole('switch', { name: /auto-decrypt/i })
    expect(autoDecryptSwitch).toBeInTheDocument()

    fireEvent.click(autoDecryptSwitch)
    expect(JSON.parse(localStorageStore[AUTO_DECRYPT_KEY] ?? '[]')).toContain('box-1')

    fireEvent.click(autoDecryptSwitch)
    expect(JSON.parse(localStorageStore[AUTO_DECRYPT_KEY] ?? '[]')).not.toContain('box-1')
  })

  // --- back button ---
  it('navigates back when arrow-left button is clicked', async () => {
    mockFetch(emptyMessages)
    const { container } = render(React.createElement(MessagesPage))
    await waitFor(() => {
      expect(screen.getByText('No messages yet.')).toBeInTheDocument()
    })

    const backButton = container.querySelector('button svg')?.closest('button')
    expect(backButton).not.toBeNull()
    fireEvent.click(backButton!)
    expect(mockBack).toHaveBeenCalled()
  })
})
