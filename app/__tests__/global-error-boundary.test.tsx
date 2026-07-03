// @vitest-environment happy-dom

/**
 * TDD: app/global-error.tsx — root-layout error boundary.
 *
 * Next 16 contract: global-error MUST render its own <html><body> because
 * it replaces the root layout when that layout throws.
 *
 * Reports to POST /api/report-error via fire-and-forget fetch — a failed
 * report never breaks the recovery UI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
// Import the REAL sanitizer — the file already exists on disk (lib/reporter/sanitize-client.ts)
import { sanitizeStringClient } from '@/lib/reporter/sanitize-client'

import fs from 'node:fs'
import path from 'node:path'

import { fileURLToPath } from 'node:url'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _realSanitizer = sanitizeStringClient // referenced for side-effect-free import

// Lazy import — the component does not exist yet (TDD red phase).
let GlobalError: React.ComponentType<{
  error: Error & { digest?: string }
  reset: () => void
}>

async function loadComponent() {
  const mod = await import('@/app/global-error')
  GlobalError = mod.default
}

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function stubLocation(
  overrides: { pathname?: string; reload?: () => void } = {},
) {
  vi.stubGlobal(
    'location',
    Object.defineProperties(
      { ...window.location },
      Object.getOwnPropertyDescriptors({
        href: `http://localhost:3000${overrides.pathname ?? '/'}`,
        pathname: overrides.pathname ?? '/',
        reload: overrides.reload ?? vi.fn(),
        assign: vi.fn(),
        replace: vi.fn(),
      }),
    ),
  )
}

describe('global-error.tsx (root-layout error boundary)', () => {
  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{"success":true}', { status: 202 })),
    )
    stubLocation({ pathname: '/test-path' })
    await loadComponent()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── DOM structure ────────────────────────────────────────────────────────

  it('source file contains <html><body> JSX (Next 16 global-error contract)', () => {
    const src = fs.readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'global-error.tsx',
      ),
      'utf-8',
    )
    expect(src).toMatch(/<html/)
    expect(src).toMatch(/<body/)
  })

  it('shows "Application error" heading (not "Something went wrong" — differentiated from nested error.tsx)', () => {
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />)

    expect(screen.getByText('Application error')).toBeInTheDocument()
  })

  it('renders "Try again" button', () => {
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
  })

  it('renders "Reload page" button', () => {
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />)

    expect(
      screen.getByRole('button', { name: /reload page/i }),
    ).toBeInTheDocument()
  })

  // ── button behaviour ─────────────────────────────────────────────────────

  it('clicking "Try again" calls the reset prop', async () => {
    const reset = vi.fn()
    render(<GlobalError error={new Error('boom')} reset={reset} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('clicking "Reload page" calls window.location.reload()', async () => {
    const reload = vi.fn()
    stubLocation({ pathname: '/test-path', reload })

    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />)

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /reload page/i }))

    expect(reload).toHaveBeenCalledTimes(1)
  })

  // ── fetch wiring (POST /api/report-error) ───────────────────────────────

  it('on mount, POSTs to /api/report-error exactly once with correct body shape', async () => {
    const err = new Error('test-message')
    err.name = 'TestError'
    err.stack = 'Error: test-message\n    at foo (bar.ts:1)\n    at baz (qux.ts:2)'

    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    // useEffect may fire asynchronously — wait for the fetch call
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/report-error')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })

    const body = JSON.parse(init.body as string)
    expect(body.message).toBe('test-message')
    expect(body.code).toBe('TestError')
    expect(body.route).toBe('/test-path')
    expect(body.stackFirstFrame).toContain('at foo')
  })

  it('sends message/name defaults when error.message is empty', async () => {
    // Error with no message
    const err = new Error()
    err.message = '' // explicit empty
    err.name = ''
    err.stack = undefined

    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.message).toBe('unknown error')
    expect(body.code).toBe('Error')
  })

  // ── sanitization ────────────────────────────────────────────────────────

  it('strips JWT from error message in the fetch body', async () => {
    const err = new Error(
      'token eyJaaaaaaaaaa.aaaaaaaaaa.aaaaaaaaaa expired with code auth_error',
    )

    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    // The JWT-shaped token must be redacted
    expect(body.message).not.toMatch(/eyJ/)
    // Non-sensitive text should remain
    expect(body.message).toContain('expired')
  })

  it('strips email address from error message in the fetch body', async () => {
    const err = new Error('user alice@example.com has invalid input')

    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.message).not.toMatch(/@/)
    expect(body.message).toContain('has invalid input')
  })

  it('strips 32-char hex token from stack first frame', async () => {
    const err = new Error('crash')
    err.stack =
      'Error: crash\n    at session=abc123def456abc123def456abc123de (token.ts:1)'

    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.stackFirstFrame).not.toMatch(/abc123def/)
  })

  // ── resilience ──────────────────────────────────────────────────────────

  it('still renders recovery UI when fetch (transport) rejects', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    )

    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />)

    // The component must NOT crash — recovery UI must be visible
    await vi.waitFor(() => {
      expect(screen.getByText('Application error')).toBeInTheDocument()
    })

    expect(
      screen.getByRole('button', { name: /try again/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /reload page/i }),
    ).toBeInTheDocument()
  })

  it('truncates code to 64 chars', async () => {
    // Use hyphens to avoid matching the base64 sanitizer (which strips
    // 32+ consecutive [A-Za-z0-9+/] chars).
    const longName =
      'VeryLong-Error-Name-ThatExceeds-TheMaximumAllowed-LengthOf-SixtyFourCharsPlus'
    const err = new Error('boom')
    err.name = longName
    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.code.length).toBeLessThanOrEqual(64)
    // Truncation runs after sanitization, so the visible portion comes from the original
    expect(body.code).toBe(longName.slice(0, 64))
  })

  it('truncates stackFirstFrame to 512 chars', async () => {
    const longFrame = 'at '.padEnd(600, 'x')
    const err = new Error('boom')
    err.stack = `Error: boom\n${longFrame}`
    render(<GlobalError error={err} reset={vi.fn()} />)

    const fetchSpy = window.fetch as unknown as ReturnType<typeof vi.fn>
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string)
    expect(body.stackFirstFrame.length).toBeLessThanOrEqual(512)
  })
})
