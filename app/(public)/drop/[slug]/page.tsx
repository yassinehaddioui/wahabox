'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { TextEditor } from '@/components/ui/text-editor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type BoxInfo = {
  label: string
  greeting: string | null
  publicKey: string
}

const TURNSTILE_SITE_KEY = '1x00000000000000000000AA'

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

async function solvePow(challenge: string, difficulty: number): Promise<string> {
  const enc = new TextEncoder()
  let nonce = 0
  while (true) {
    const data = enc.encode(challenge + nonce)
    const hash = await crypto.subtle.digest('SHA-256', data)
    const bytes = new Uint8Array(hash)
    const bitsNeeded = Math.ceil(difficulty / 4)
    let valid = true
    for (let i = 0; i < bitsNeeded; i++) {
      if (bytes[i] !== 0) { valid = false; break }
    }
    if (valid) return String(nonce)
    nonce++
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
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  const turnstileRef = useRef<HTMLDivElement>(null)
  const turnstileWidgetId = useRef<string | null>(null)

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
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token: string) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      'error-callback': () => setTurnstileToken(null),
    })
  }, [])

  useEffect(() => {
    if (loading) return

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
  }, [loading, renderTurnstile])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (honeypotRef.current?.value) return

    setSending(true)
    setError('')

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const publicKey = crypto.fromBase64(box!.publicKey)
      const ciphertext = crypto.sealMessage(message, publicKey)

      const csrfRes = await fetch(`/api/csrf?tag=${encodeURIComponent(slug)}`)
      const csrfData = await csrfRes.json()
      const csrfToken = csrfData.success ? csrfData.data.csrfToken : null

      const payload: Record<string, unknown> = {
        ciphertext: crypto.toBase64(ciphertext),
        csrfToken,
        honeypot: '',
      }

      if (turnstileToken) {
        payload.turnstileToken = turnstileToken
      }

      const res = await fetch(`/api/drop/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.error)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  if (error && !box) {
    return (
      <Card className="w-full max-w-2xl bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Not Found</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (sent) {
    return (
      <Card className="w-full max-w-2xl bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Message Sent!</CardTitle>
          <CardDescription>
            Your message has been delivered securely.
          </CardDescription>
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
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>{box!.label}</CardTitle>
        <CardDescription>
          {box!.greeting || "Send an encrypted message to this PO Box. Your message is encrypted in your browser before being sent."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
              <TextEditor
                id="message"
                value={message}
                onChange={setMessage}
                maxLength={50000}
              />
          </div>
          <div ref={turnstileRef} className="flex justify-center" />
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
          <Button type="submit" disabled={sending} className="w-full">
            {sending ? 'Encrypting & Sending...' : 'Send Message'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
