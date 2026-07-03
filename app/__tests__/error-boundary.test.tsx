// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '@/app/error'

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 202 })),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const DEFAULT_RESET = vi.fn()

function renderError(error: Error, reset: () => void = DEFAULT_RESET) {
  return render(<ErrorBoundary error={error} reset={reset} />)
}

// ─── Case 1: Renders recovery UI ───────────────────────────────────────

it('renders the recovery UI with heading and both buttons', () => {
  renderError(new Error('test'))
  expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
})

// ─── Case 2: "Try again" calls reset ───────────────────────────────────

it('calls reset when "Try again" is clicked', () => {
  const reset = vi.fn()
  renderError(new Error('test'), reset)
  fireEvent.click(screen.getByRole('button', { name: /try again/i }))
  expect(reset).toHaveBeenCalledTimes(1)
})

// ─── Case 3: "Reload page" calls window.location.reload ────────────────

it('calls window.location.reload when "Reload page" is clicked', () => {
  const reload = vi.fn()
  const win = window
  const originalLocation = win.location
  Object.defineProperty(win, 'location', {
    value: { ...originalLocation, reload },
    writable: true,
    configurable: true,
  })
  renderError(new Error('test'))
  fireEvent.click(screen.getByRole('button', { name: /reload page/i }))
  expect(reload).toHaveBeenCalledTimes(1)
  // Restore
  Object.defineProperty(win, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  })
})

// ─── Case 4: POST to /api/report-error on mount ────────────────────────

it('calls fetch /api/report-error exactly once with correct shape', async () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
  vi.stubGlobal('fetch', mockFetch)

  const err = new TypeError('something broke')
  err.stack = 'TypeError: something broke\n    at Comp (app/page.tsx:42:3)\n    at render (app/layout.tsx:10:1)'
  render(<ErrorBoundary error={err} reset={DEFAULT_RESET} />)

  // Wait for useEffect microtasks
  await vi.dynamicImportSettled?.()
  // fetch is called in useEffect, so we need to wait a tick
  await new Promise((r) => setTimeout(r, 10))

  expect(mockFetch).toHaveBeenCalledTimes(1)
  const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit]

  expect(url).toBe('/api/report-error')
  expect(init.method).toBe('POST')
  expect(init.headers).toEqual({ 'Content-Type': 'application/json' })

  const body = JSON.parse(init.body as string)
  expect(body).toHaveProperty('message')
  expect(body).toHaveProperty('code')
  expect(body).toHaveProperty('stackFirstFrame')
  expect(body).toHaveProperty('route')
  expect(body.code).toBe('TypeError')
  // happy-dom default pathname
  expect(body.route).toBe('/')
})

// ─── Case 5: Sanitization — email redacted ─────────────────────────────

it('sanitizes email addresses from the error message before posting', async () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
  vi.stubGlobal('fetch', mockFetch)

  const err = new Error('user alice@example.com caused a crash')
  render(<ErrorBoundary error={err} reset={DEFAULT_RESET} />)

  await vi.dynamicImportSettled?.()
  await new Promise((r) => setTimeout(r, 10))

  expect(mockFetch).toHaveBeenCalledTimes(1)
  const body = JSON.parse((mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string)
  expect(body.message).not.toMatch(/@/)
  expect(body.message).toContain('[redacted]')
})

// ─── Case 6: Error change → re-fetch ───────────────────────────────────

it('calls fetch again when the error prop changes', async () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 202 }))
  vi.stubGlobal('fetch', mockFetch)

  const err1 = new Error('first')
  const { rerender } = render(<ErrorBoundary error={err1} reset={DEFAULT_RESET} />)

  await vi.dynamicImportSettled?.()
  await new Promise((r) => setTimeout(r, 10))

  expect(mockFetch).toHaveBeenCalledTimes(1)

  const err2 = new Error('second')
  rerender(<ErrorBoundary error={err2} reset={DEFAULT_RESET} />)

  await vi.dynamicImportSettled?.()
  await new Promise((r) => setTimeout(r, 10))

  expect(mockFetch).toHaveBeenCalledTimes(2)
})

// ─── Case 7: Fetch rejection does not crash the component ──────────────

it('does not crash when fetch rejects', async () => {
  const mockFetch = vi.fn().mockRejectedValue(new Error('network down'))
  vi.stubGlobal('fetch', mockFetch)

  // Should not throw
  expect(() => {
    render(<ErrorBoundary error={new Error('test')} reset={DEFAULT_RESET} />)
  }).not.toThrow()

  await vi.dynamicImportSettled?.()
  await new Promise((r) => setTimeout(r, 10))

  // Component still renders heading (did not crash)
  expect(screen.getByText('Something went wrong')).toBeInTheDocument()
})
