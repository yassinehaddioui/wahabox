'use client'

import { useState, useEffect } from 'react'

export function useCsrfToken(tag: string): string | null {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data.csrfToken) {
          setToken(data.data.csrfToken)
        }
      })
      .catch(() => {})
  }, [tag])

  return token
}
