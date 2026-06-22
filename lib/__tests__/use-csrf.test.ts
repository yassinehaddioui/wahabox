// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { mockFetch, resetMockFetch } from '@/test/helpers/mock-fetch'
import { useCsrfToken } from '@/lib/use-csrf'

describe('useCsrfToken', () => {
  afterEach(() => {
    resetMockFetch()
  })

  it('fetches token on mount and returns it', async () => {
    mockFetch({
      json: () => ({ success: true, data: { csrfToken: 'token-abc' } }),
    })
    const { result } = renderHook(() => useCsrfToken('form'))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe('token-abc'))
  })

  it('swallows fetch errors without throwing', async () => {
    const fetchStub = mockFetch({
      json: () => {
        throw new Error('Network error')
      },
    })
    const { result } = renderHook(() => useCsrfToken('form'))
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1))
    expect(result.current).toBeNull()
  })

  it('refetches token when tag changes', async () => {
    const fetchStub = mockFetch([
      { json: () => ({ success: true, data: { csrfToken: 'token-1' } }) },
      { json: () => ({ success: true, data: { csrfToken: 'token-2' } }) },
    ])
    const { result, rerender } = renderHook((tag: string) => useCsrfToken(tag), {
      initialProps: 'form',
    })
    await waitFor(() => expect(result.current).toBe('token-1'))
    rerender('api')
    await waitFor(() => expect(result.current).toBe('token-2'))
    expect(fetchStub).toHaveBeenCalledTimes(2)
    expect(fetchStub.mock.calls[0][0]).toBe('/api/csrf?tag=form')
    expect(fetchStub.mock.calls[1][0]).toBe('/api/csrf?tag=api')
  })
})
