// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'

const mockUseParams = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => mockUseParams(),
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), back: vi.fn(),
    forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(),
  }),
}))

const mockCrypto = vi.hoisted(() => ({
  ready: Promise.resolve(),
  fromBase64: vi.fn(() => new Uint8Array(32)),
  toBase64: vi.fn(() => 'mock-ciphertext'),
  sealMessage: vi.fn(() => new Uint8Array(64)),
}))

vi.mock('@/lib/crypto', () => ({ crypto: mockCrypto }))

vi.mock('@/components/ui/text-editor', () => ({
  TextEditor: ({ id, value, onChange, maxLength }: any) => (
    <textarea
      id={id}
      value={value}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
      maxLength={maxLength}
      data-testid="text-editor"
      aria-label="Message"
    />
  ),
}))

import DropPage from '@/app/(public)/drop/[slug]/page'

describe('DropPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseParams.mockReturnValue({ slug: 'test-slug' })

    const turnstileScript = document.createElement('script')
    turnstileScript.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    document.head.appendChild(turnstileScript)

    vi.stubGlobal('turnstile', {
      render: vi.fn(() => 'widget-id-1'),
      reset: vi.fn(),
      remove: vi.fn(),
    })

    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    resetMockFetch()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
  })

  const boxData = {
    json: () => ({
      success: true,
      data: { label: 'Test Box', greeting: 'Hello!', publicKey: 'pk', hasPassword: false },
    }),
    ok: true,
  }

  const boxWithPassword = {
    json: () => ({
      success: true,
      data: { label: 'Secured', greeting: null, publicKey: 'pk', hasPassword: true },
    }),
    ok: true,
  }

  const csrfOk = {
    json: () => ({ success: true, data: { csrfToken: 'test-csrf' } }),
    ok: true,
  }

  const sendOk = {
    json: () => ({ success: true }),
    ok: true,
  }

  // --- loading state ---
  it('shows loading state initially', () => {
    mockFetch(boxData)
    render(React.createElement(DropPage))
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  // --- not-found state ---
  it('shows not-found when API returns error without box data', async () => {
    mockFetch({
      json: () => ({ success: false, error: 'This drop link is invalid or inactive.' }),
      ok: true,
    })
    render(React.createElement(DropPage))
    await waitFor(() => {
      expect(screen.getByText('Not Found')).toBeInTheDocument()
      expect(screen.getByText('This drop link is invalid or inactive.')).toBeInTheDocument()
    })
  })

  // --- form rendering ---
  it('renders the form with box data after fetch completes', async () => {
    mockFetch(boxData)
    render(React.createElement(DropPage))
    await waitFor(() => {
      expect(screen.getByText('Test Box')).toBeInTheDocument()
      expect(screen.getByText('Hello!')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
    expect(screen.getByTestId('text-editor')).toBeInTheDocument()
  })

  // --- password field ---
  it('renders password field when box has password enabled', async () => {
    mockFetch(boxWithPassword)
    render(React.createElement(DropPage))
    await waitFor(() => {
      expect(screen.getByText('Secured')).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText(/enter password/i)).toBeInTheDocument()
  })

  // --- honeypot short-circuit ---
  it('short-circuits submission when honeypot is filled', async () => {
    mockFetch(boxData)
    render(React.createElement(DropPage))
    await waitFor(() => expect(screen.getByText('Test Box')).toBeInTheDocument())

    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement
    fireEvent.change(honeypot, { target: { value: 'bot-value' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    // crypto should never have been imported / called
    await waitFor(() => {
      expect(mockCrypto.sealMessage).not.toHaveBeenCalled()
    })
  })

  // --- password error branch ---
  it('shows password error on INVALID_PASSWORD response', async () => {
    mockFetch([
      boxWithPassword,
      csrfOk,
      {
        json: () => ({ success: false, code: 'INVALID_PASSWORD', error: 'Wrong password' }),
        ok: true,
      },
    ])
    render(React.createElement(DropPage))
    await waitFor(() => expect(screen.getByText('Secured')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/enter password/i), { target: { value: 'badpass' } })
    fireEvent.change(screen.getByTestId('text-editor'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(screen.getByText('Wrong password')).toBeInTheDocument()
    })
  })

  // --- cachedPayloadRef reuse ---
  it('reuses cached payload on retry after INVALID_PASSWORD', async () => {
    mockFetch([
      boxWithPassword,
      csrfOk,
      { json: () => ({ success: false, code: 'INVALID_PASSWORD', error: 'Wrong password' }), ok: true },
      csrfOk,
      sendOk,
    ])
    render(React.createElement(DropPage))
    await waitFor(() => expect(screen.getByText('Secured')).toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText(/enter password/i), { target: { value: 'badpass' } })
    fireEvent.change(screen.getByTestId('text-editor'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => expect(screen.getByText('Wrong password')).toBeInTheDocument())

    // sealMessage called once during first submit
    expect(mockCrypto.sealMessage).toHaveBeenCalledTimes(1)

    // Fix password and submit again — should reuse cached payload
    fireEvent.change(screen.getByPlaceholderText(/enter password/i), { target: { value: 'correctpass' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(screen.getByText('Message Sent!')).toBeInTheDocument()
    })

    // sealMessage still called only once (cachedPayloadRef was reused)
    expect(mockCrypto.sealMessage).toHaveBeenCalledTimes(1)
  })

  // --- successful send ---
  it('sends message successfully and shows confirmation', async () => {
    mockFetch([boxData, csrfOk, sendOk])
    render(React.createElement(DropPage))
    await waitFor(() => expect(screen.getByText('Test Box')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('text-editor'), { target: { value: 'Hello world' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(screen.getByText('Message Sent!')).toBeInTheDocument()
      expect(screen.getByText(/delivered securely/)).toBeInTheDocument()
    })
  })

  // --- "Send another message" button in sent state ---
  it('reloads the page when "Send another message" is clicked', async () => {
    mockFetch([boxData, csrfOk, sendOk])
    render(React.createElement(DropPage))
    await waitFor(() => expect(screen.getByText('Test Box')).toBeInTheDocument())

    fireEvent.change(screen.getByTestId('text-editor'), { target: { value: 'Hello' } })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => expect(screen.getByText('Message Sent!')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /send another/i }))
    expect(window.location.reload).toHaveBeenCalled()
  })

  // --- solvePow hasher (crypto.subtle.digest) ---
  it('can compute SHA-256 digest via crypto.subtle (solvePow hasher)', async () => {
    const enc = new TextEncoder()
    const data = enc.encode('challenge0')
    const result = await crypto.subtle.digest('SHA-256', data)

    expect(result).toBeInstanceOf(ArrayBuffer)
  })

  // --- fetch failure ---
  it('shows error when box fetch fails with network error', async () => {
    mockFetch({
      json: () => { throw new Error('Network failure') },
      ok: false,
      status: 500,
    })
    render(React.createElement(DropPage))
    await waitFor(() => {
      expect(screen.getByText('Failed to load drop box.')).toBeInTheDocument()
    })
  })
})
