'use client'

import { useEffect } from 'react'
import { clearSessionKeys } from '@/lib/session-keys'

export function FetchInterceptor() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async function guardedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ) {
      const response = await originalFetch(input, init)

      if (response.status === 401) {
        try {
          const cloned = response.clone()
          const body = await cloned.json()
          if (body?.code === 'UNAUTHORIZED') {
            clearSessionKeys()
            try {
              await originalFetch('/api/auth/logout', { method: 'POST' })
            } catch {
              // Logout is best-effort — proceed with redirect regardless
            }
            window.location.href = '/login'
          }
        } catch {
          // Response body was not JSON — skip interception silently
        }
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
