// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

vi.mock('@/lib/session-keys', () => ({
  clearSessionKeys: vi.fn(),
}))

import { FetchInterceptor } from '@/components/fetch-interceptor'

let mockLocationHref = ''
const mockLocationSetter = vi.fn((href: string) => {
  mockLocationHref = href
})

beforeEach(() => {
  vi.clearAllMocks()
  mockLocationHref = ''
  vi.stubGlobal('fetch', vi.fn())
  Object.defineProperty(window, 'location', {
    value: {
      href: '',
    },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function createJsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status })
}

function createTextResponse(status: number, body: string) {
  return new Response(body, { status })
}

describe('FetchInterceptor', () => {
  it('does NOT intercept non-401 responses', async () => {
    const stub = vi.fn().mockResolvedValue(createJsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', stub)

    render(<FetchInterceptor />)

    const response = await window.fetch('/api/test')
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({ ok: true })
    expect(stub).toHaveBeenCalledWith('/api/test', undefined)
    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).not.toHaveBeenCalled()
  })

  it('intercepts 401 UNAUTHORIZED — clears keys, POSTs logout, redirects', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(401, { code: 'UNAUTHORIZED' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', stub)

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })

    render(<FetchInterceptor />)

    const response = await window.fetch('/api/boxes')
    expect(response.status).toBe(401)

    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).toHaveBeenCalledTimes(1)

    expect(stub).toHaveBeenNthCalledWith(2, '/api/auth/logout', {
      method: 'POST',
    })

    expect(window.location.href).toBe('/login')
  })

  it('does NOT intercept 401 with code MFA_REQUIRED', async () => {
    const stub = vi.fn().mockResolvedValue(
      createJsonResponse(401, { code: 'MFA_REQUIRED' }),
    )
    vi.stubGlobal('fetch', stub)

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })

    render(<FetchInterceptor />)

    const response = await window.fetch('/api/auth/verify-mfa')
    expect(response.status).toBe(401)

    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('does NOT intercept 401 with code INVALID_PASSWORD', async () => {
    const stub = vi.fn().mockResolvedValue(
      createJsonResponse(401, { code: 'INVALID_PASSWORD' }),
    )
    vi.stubGlobal('fetch', stub)

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })

    render(<FetchInterceptor />)

    const response = await window.fetch('/api/auth/login')
    expect(response.status).toBe(401)

    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('restores original fetch on unmount', async () => {
    const stub = vi.fn().mockResolvedValue(createJsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', stub)

    const { unmount } = render(<FetchInterceptor />)

    const guardedFetch = window.fetch
    expect(guardedFetch).not.toBe(stub)

    unmount()

    expect(window.fetch).not.toBe(guardedFetch)
    await window.fetch('/test')
    expect(stub).toHaveBeenCalledWith('/test')
  })

  it('skips interception silently for non-JSON 401 responses', async () => {
    const stub = vi.fn().mockResolvedValue(
      createTextResponse(401, 'Unauthorized'),
    )
    vi.stubGlobal('fetch', stub)

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })

    render(<FetchInterceptor />)

    const response = await window.fetch('/api/test')
    expect(response.status).toBe(401)

    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).not.toHaveBeenCalled()
    expect(window.location.href).toBe('')
  })

  it('still redirects when logout fetch fails', async () => {
    const stub = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse(401, { code: 'UNAUTHORIZED' }))
      .mockRejectedValueOnce(new Error('Network error'))
    vi.stubGlobal('fetch', stub)

    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
      configurable: true,
    })

    render(<FetchInterceptor />)

    const response = await window.fetch('/api/boxes')
    expect(response.status).toBe(401)

    const { clearSessionKeys } = await import('@/lib/session-keys')
    expect(clearSessionKeys).toHaveBeenCalledTimes(1)

    // Logout was attempted
    expect(stub).toHaveBeenNthCalledWith(2, '/api/auth/logout', {
      method: 'POST',
    })

    // Still redirects despite logout failure
    expect(window.location.href).toBe('/login')
  })
})
