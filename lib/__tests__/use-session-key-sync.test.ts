// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSessionKeySync } from '@/lib/use-session-key-sync'
import { PRIVATE_KEY_STORAGE_KEY, PUBLIC_KEY_STORAGE_KEY } from '@/lib/session-keys'

const mockReplace = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mockReplace.mockClear()
})

describe('useSessionKeySync', () => {
  it('copies localStorage keys to sessionStorage on mount when sessionStorage is empty', () => {
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, 'priv-b64')
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, 'pub-b64')

    renderHook(() => useSessionKeySync())

    expect(sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)).toBe('priv-b64')
    expect(sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)).toBe('pub-b64')
  })

  it('does not overwrite existing sessionStorage keys', () => {
    sessionStorage.setItem(PRIVATE_KEY_STORAGE_KEY, 'existing-priv')
    sessionStorage.setItem(PUBLIC_KEY_STORAGE_KEY, 'existing-pub')
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, 'local-priv')
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, 'local-pub')

    renderHook(() => useSessionKeySync())

    expect(sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)).toBe('existing-priv')
    expect(sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)).toBe('existing-pub')
  })

  it('does nothing when neither localStorage nor sessionStorage has keys', () => {
    renderHook(() => useSessionKeySync())

    expect(sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)).toBeNull()
  })

  it('does not copy when localStorage is missing a key', () => {
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, 'priv-b64')

    renderHook(() => useSessionKeySync())

    expect(sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)).toBeNull()
  })

  it('redirects to /login on storage event with newValue=null for private key', () => {
    renderHook(() => useSessionKeySync())

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PRIVATE_KEY_STORAGE_KEY,
          newValue: null,
        }),
      )
    })

    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it('redirects to /login on storage event with newValue=null for public key', () => {
    renderHook(() => useSessionKeySync())

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PUBLIC_KEY_STORAGE_KEY,
          newValue: null,
        }),
      )
    })

    expect(mockReplace).toHaveBeenCalledWith('/login')
  })

  it('does not redirect for storage events with non-null newValue', () => {
    renderHook(() => useSessionKeySync())

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PRIVATE_KEY_STORAGE_KEY,
          newValue: 'new-value',
        }),
      )
    })

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('does not redirect for storage events with unrelated keys', () => {
    renderHook(() => useSessionKeySync())

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'unrelated-key',
          newValue: null,
        }),
      )
    })

    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('clears session keys on storage event with newValue=null', () => {
    sessionStorage.setItem(PRIVATE_KEY_STORAGE_KEY, 'priv-b64')
    sessionStorage.setItem(PUBLIC_KEY_STORAGE_KEY, 'pub-b64')
    localStorage.setItem(PRIVATE_KEY_STORAGE_KEY, 'priv-b64')
    localStorage.setItem(PUBLIC_KEY_STORAGE_KEY, 'pub-b64')

    renderHook(() => useSessionKeySync())

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PRIVATE_KEY_STORAGE_KEY,
          newValue: null,
        }),
      )
    })

    expect(sessionStorage.getItem(PRIVATE_KEY_STORAGE_KEY)).toBeNull()
    expect(sessionStorage.getItem(PUBLIC_KEY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(PRIVATE_KEY_STORAGE_KEY)).toBeNull()
    expect(localStorage.getItem(PUBLIC_KEY_STORAGE_KEY)).toBeNull()
  })

  it('removes the storage event listener on unmount', () => {
    const { unmount } = renderHook(() => useSessionKeySync())

    unmount()

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: PRIVATE_KEY_STORAGE_KEY,
          newValue: null,
        }),
      )
    })

    expect(mockReplace).not.toHaveBeenCalled()
  })
})
