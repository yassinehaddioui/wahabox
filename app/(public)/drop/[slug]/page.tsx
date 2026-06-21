'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type BoxInfo = { label: string; publicKey: string }

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
  const honeypotRef = useRef<HTMLInputElement>(null)

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

      const payload: Record<string, unknown> = {
        ciphertext: crypto.toBase64(ciphertext),
        honeypot: '',
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
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Not Found</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (sent) {
    return (
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Message Sent!</CardTitle>
          <CardDescription>
            Your message has been delivered securely.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{box!.label}</CardTitle>
        <CardDescription>
          Send an encrypted message to this PO Box. Your message is encrypted in your
          browser before being sent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="message">Your Message</Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="min-h-32"
              maxLength={5000}
              required
            />
          </div>
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
