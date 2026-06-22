import { describe, it, expect, afterEach } from 'vitest'
import { mockFetch, resetMockFetch } from './mock-fetch'

describe('mockFetch', () => {
  afterEach(() => {
    resetMockFetch()
  })

  it('returns mocked JSON from a single response', async () => {
    mockFetch({ json: () => ({ token: 'abc' }) })
    const res = await fetch('https://example.com')
    const data = await res.json()
    expect(data).toEqual({ token: 'abc' })
  })

  it('returns sequential responses from an array', async () => {
    mockFetch([
      { json: () => ({ step: 1 }) },
      { json: () => ({ step: 2 }) },
    ])
    const first = await (await fetch('https://example.com')).json()
    const second = await (await fetch('https://example.com')).json()
    expect(first).toEqual({ step: 1 })
    expect(second).toEqual({ step: 2 })
  })

  it('reuses the last response for calls beyond the array length', async () => {
    mockFetch([{ json: () => ({ only: true }) }])
    const a = await (await fetch('https://example.com')).json()
    const b = await (await fetch('https://example.com')).json()
    expect(a).toEqual({ only: true })
    expect(b).toEqual({ only: true })
  })

  it('restores the original fetch after resetMockFetch', async () => {
    const original = globalThis.fetch
    mockFetch({ json: () => ({ mocked: true }) })
    expect(globalThis.fetch).not.toBe(original)
    resetMockFetch()
    expect(globalThis.fetch).toBe(original)
  })

  it('defaults ok to true and status to 200', async () => {
    mockFetch({ json: () => ({}) })
    const res = await fetch('https://example.com')
    expect(res.ok).toBe(true)
    expect(res.status).toBe(200)
  })

  it('derives ok from status when ok is omitted', async () => {
    mockFetch({ status: 404, json: () => ({ error: 'not found' }) })
    const res = await fetch('https://example.com')
    expect(res.ok).toBe(false)
    expect(res.status).toBe(404)
  })

  it('exposes the vi.fn mock for call assertions', async () => {
    const stub = mockFetch({ json: () => ({ ok: true }) })
    await fetch('https://example.com/api', { method: 'POST' })
    expect(stub).toHaveBeenCalledTimes(1)
    expect(stub.mock.calls[0][0]).toBe('https://example.com/api')
  })
})
