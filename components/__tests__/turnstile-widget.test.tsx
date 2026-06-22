// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'

const mockRender = vi.fn(() => 'widget-1')
const mockReset = vi.fn()
const mockRemove = vi.fn()

beforeEach(() => {
  vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
    try {
      return HTMLHeadElement.prototype.appendChild.call(document.head, node)
    } catch {
      return node
    }
  })
})

afterEach(() => {
  delete window.turnstile
  delete window.onTurnstileLoad
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((s) => s.remove())
  vi.restoreAllMocks()
})

import { TurnstileWidget } from '@/components/turnstile-widget'

describe('TurnstileWidget with existing script', () => {
  beforeEach(() => {
    window.turnstile = { render: mockRender, reset: mockReset, remove: mockRemove }
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    document.head.appendChild(s)
  })

  it('renders the container div', () => {
    render(<TurnstileWidget siteKey="test-site-key" onVerify={vi.fn()} />)
    expect(document.querySelector('.flex.justify-center')).toBeInTheDocument()
  })

  it('calls window.turnstile.render with options when turnstile is available', () => {
    render(<TurnstileWidget siteKey="test-site-key" onVerify={vi.fn()} />)
    expect(mockRender).toHaveBeenCalled()
    const [container, options] = mockRender.mock.lastCall
    expect(container).toBeInTheDocument()
    expect(options).toMatchObject({
      sitekey: 'test-site-key',
      callback: expect.any(Function),
      'expired-callback': expect.any(Function),
      'error-callback': expect.any(Function),
    })
  })

  it('does not inject a second script tag when one already exists', () => {
    render(<TurnstileWidget siteKey="test-site-key" onVerify={vi.fn()} />)
    const scripts = document.querySelectorAll('script[src*="turnstile"]')
    expect(scripts.length).toBe(1)
  })

  it('uses callback refs to always call the latest onVerify', () => {
    const onVerify1 = vi.fn()
    const { rerender } = render(<TurnstileWidget siteKey="test-site-key" onVerify={onVerify1} />)
    const onVerify2 = vi.fn()
    rerender(<TurnstileWidget siteKey="test-site-key" onVerify={onVerify2} />)
    mockRender.mock.lastCall[1].callback('test-token')
    expect(onVerify1).not.toHaveBeenCalled()
    expect(onVerify2).toHaveBeenCalledWith('test-token')
  })

  it('calls expired-callback when token expires', () => {
    const onExpire = vi.fn()
    render(<TurnstileWidget siteKey="test-site-key" onVerify={vi.fn()} onExpire={onExpire} />)
    mockRender.mock.lastCall[1]['expired-callback']()
    expect(onExpire).toHaveBeenCalled()
  })

  it('calls error-callback on error', () => {
    const onError = vi.fn()
    render(<TurnstileWidget siteKey="test-site-key" onVerify={vi.fn()} onError={onError} />)
    mockRender.mock.lastCall[1]['error-callback']()
    expect(onError).toHaveBeenCalled()
  })
})

describe('TurnstileWidget with script injection path', () => {
  beforeEach(() => {
    window.turnstile = { render: mockRender, reset: mockReset, remove: mockRemove }
  })

  it('cleans up widget on unmount', () => {
    const { unmount } = render(<TurnstileWidget onVerify={vi.fn()} />)
    window.onTurnstileLoad?.()
    unmount()
    expect(mockRemove).toHaveBeenCalledWith('widget-1')
  })
})
