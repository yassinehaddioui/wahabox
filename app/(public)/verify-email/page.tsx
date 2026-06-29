'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

function VerifyContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const router = useRouter()
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => router.push('/login'), 2000)
      return () => clearTimeout(timer)
    }
  }, [state, router])

  useEffect(() => {
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState('error')
      setMessage('No verification token found in the link.')
      return
    }

    fetch('/api/account/email/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((r) => r.json())
      .then((data) => {
        setState(data.success ? 'success' : 'error')
        setMessage(data.data?.message ?? data.error ?? 'Verification failed')
      })
      .catch(() => {
        setState('error')
        setMessage('Failed to verify email. Please try again.')
      })
  }, [token])

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2">
          {state === 'loading' && (
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          )}
          {state === 'success' && <CheckCircle className="h-10 w-10 text-primary" />}
          {state === 'error' && <XCircle className="h-10 w-10 text-destructive" />}
        </div>
        <CardTitle>
          {state === 'loading' && 'Verifying…'}
          {state === 'success' && 'Verified!'}
          {state === 'error' && 'Verification Failed'}
        </CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              </div>
              <CardTitle>Verifying…</CardTitle>
            </CardHeader>
          </Card>
        }
      >
        <VerifyContent />
      </Suspense>
    </div>
  )
}
