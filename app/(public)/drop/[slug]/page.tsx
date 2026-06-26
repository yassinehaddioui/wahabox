'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { TURNSTILE_PROOF_COOKIE, isTurnstileClientEnabled } from '@/lib/turnstile-constants'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextEditor } from '@/components/ui/text-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type BoxInfo = {
  label: string
  greeting: string | null
  publicKey: string
  hasPassword: boolean
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string
      reset: (widgetId: string) => void
      remove: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

export default function DropPage() {
  const { slug } = useParams<{ slug: string }>()
  const [box, setBox] = useState<BoxInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const hasSiteKey = isTurnstileClientEnabled()
  const [hasProof, setHasProof] = useState(() => {
    if (typeof document === 'undefined') return false
    return document.cookie.split(';').some((c) => c.trim().startsWith(`${TURNSTILE_PROOF_COOKIE}=`))
  })
  const cachedPayloadRef = useRef<{
    ciphertext: string
    csrfToken: string | null
    turnstileToken: string | null
  } | null>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)

  useEffect(() => {
    cachedPayloadRef.current = null
  }, [message])

  useEffect(() => {
    fetch(`/api/drop/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setBox(data.data)
        else setError('This drop link is invalid or inactive.')
      })
      .catch(() => setError('Failed to load drop box.'))
      .finally(() => setLoading(false))
  }, [slug])

  const renderTurnstile = useCallback(() => {
    if (!turnstileRef.current || !window.turnstile) return
    if (turnstileWidgetId.current) {
      window.turnstile.reset(turnstileWidgetId.current)
      return
    }
    turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY!,
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => setTurnstileToken(null),
    })
  }, [])

  useEffect(() => {
    if (loading) return
    if (hasProof) return
    if (!hasSiteKey) return

    const existingScript = document.querySelector('script[src*="turnstile"]')
    if (existingScript) {
      if (window.turnstile) {
        renderTurnstile()
      } else {
        const orig = window.onTurnstileLoad
        window.onTurnstileLoad = () => {
          orig?.()
          renderTurnstile()
        }
      }
      return
    }

    window.onTurnstileLoad = () => {
      renderTurnstile()
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
    script.async = true
    script.defer = true
    document.head.appendChild(script)

    return () => {
      if (turnstileWidgetId.current) {
        window.turnstile?.remove(turnstileWidgetId.current)
        turnstileWidgetId.current = null
      }
      delete window.onTurnstileLoad
    }
  }, [loading, renderTurnstile, hasProof, hasSiteKey])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (honeypotRef.current?.value) return

    setSending(true)
    setError('')
    setPasswordError('')

    try {
      let ciphertext: string

      if (cachedPayloadRef.current) {
        ciphertext = cachedPayloadRef.current.ciphertext
      } else {
        const { crypto } = await import('@/lib/crypto')
        await crypto.ready

        const publicKey = crypto.fromBase64(box!.publicKey)
        const raw = crypto.sealMessage(message, publicKey)
        ciphertext = crypto.toBase64(raw)
      }

      const csrfRes = await fetch(`/api/csrf?tag=${encodeURIComponent(slug)}`)
      const csrfData = await csrfRes.json()
      const csrfToken = csrfData.success ? csrfData.data.csrfToken : null

      cachedPayloadRef.current = { ciphertext, csrfToken, turnstileToken: turnstileToken }

      const payload: Record<string, unknown> = {
        ciphertext,
        csrfToken,
        honeypot: '',
      }

      if (turnstileToken) {
        payload.turnstileToken = turnstileToken
      }

      if (box!.hasPassword && password) {
        payload.password = password
      }

      const res = await fetch(`/api/drop/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.success) {
        if (data.code === 'INVALID_PASSWORD') {
          setPasswordError(data.error)
          return
        }
        throw new Error(data.error)
      }
      setSent(true)
      cachedPayloadRef.current = null
    } catch (err) {
      cachedPayloadRef.current = null
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      if (
        !hasProof &&
        document.cookie.split(';').some((c) => c.trim().startsWith(`${TURNSTILE_PROOF_COOKIE}=`))
      ) {
        setHasProof(true)
      }
      setSending(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  if (error && !box) {
    return (
      <Card className="w-full max-w-4xl bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Not Found</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (sent) {
    return (
      <Card className="w-full max-w-4xl bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Message Sent!</CardTitle>
          <CardDescription>Your message has been delivered securely.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <Button onClick={() => window.location.reload()} variant="outline">
            Send another message
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle>{box!.label}</CardTitle>
        <CardDescription>
          {box!.greeting ||
            'Send an encrypted message to this PO Box. Your message is encrypted in your browser before being sent.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {box!.hasPassword && (
            <div className="space-y-1.5">
              <Input
                type="password"
                placeholder="Enter password to send a message"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setPasswordError('')
                }}
                className={passwordError ? 'border-destructive' : ''}
              />
              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            </div>
          )}
          <div className="space-y-2">
            <TextEditor id="message" value={message} onChange={setMessage} maxLength={50000} />
          </div>
          {!hasProof && hasSiteKey && <div ref={turnstileRef} className="flex justify-center" />}
          <input
            ref={honeypotRef}
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="absolute -left-[9999px] -top-[9999px]"
            aria-hidden="true"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={sending || (box!.hasPassword && !password)}
            className="w-full"
          >
            {sending ? 'Encrypting & Sending...' : 'Send Message'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
