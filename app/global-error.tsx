'use client'

import { useEffect } from 'react'
import { sanitizeStringClient } from '@/lib/reporter/sanitize-client'

/**
 * Next 16 root-layout error boundary.
 *
 * Rendered when the root `app/layout.tsx` throws — replaces the layout entirely,
 * so it MUST provide its own `<html><body>` wrapper.
 *
 * Reports the error to `POST /api/report-error` (fire-and-forget); a failed
 * report never breaks the recovery UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const message = sanitizeStringClient(error.message || 'unknown error')
    const code = sanitizeStringClient(error.name || 'Error').slice(0, 64)
    const stackFirstFrame = sanitizeStringClient(
      (error.stack ?? '').split('\n')[1]?.trim() ?? '',
    ).slice(0, 512)

    void fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        code,
        stackFirstFrame,
        route: window.location.pathname,
      }),
    }).catch(() => {
      // Fire-and-forget: a failed report must never crash the recovery UI.
    })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: '#0a0a0b',
          color: '#e4e4e7',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            gap: '1.25rem',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                margin: '0 0 0.5rem 0',
              }}
            >
              Application error
            </h1>
            <p
              style={{
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: '#a1a1aa',
                margin: 0,
              }}
            >
              An unexpected error occurred. The application cannot continue.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={reset}
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                border: 'none',
                cursor: 'pointer',
                background: '#2563eb',
                color: '#fff',
              }}
            >
              Try again
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                borderRadius: '0.375rem',
                border: '1px solid #3f3f46',
                cursor: 'pointer',
                background: 'transparent',
                color: '#e4e4e7',
              }}
            >
              Reload page
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
