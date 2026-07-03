'use client'

import { useEffect } from 'react'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { sanitizeStringClient } from '@/lib/reporter/sanitize-client'

type ErrorProps = {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    const body = {
      message: sanitizeStringClient(error.message || 'unknown error'),
      code: sanitizeStringClient(error.name || 'Error').slice(0, 64),
      stackFirstFrame: sanitizeStringClient(
        (error.stack ?? '').split('\n')[1]?.trim() ?? '',
      ).slice(0, 512),
      route: window.location.pathname,
    }

    void fetch('/api/report-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {
      // Fire-and-forget — a failed report must never crash the recovery UI
    })
  }, [error])

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            An unexpected error occurred. Please try again or reload the page.
          </p>
        </CardContent>
        <CardFooter className="flex justify-center gap-3">
          <Button variant="default" onClick={reset}>
            Try again
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
