'use client'

import { useState } from 'react'
import sodium from 'libsodium-wrappers-sumo'
import bcrypt from 'bcryptjs'
import { TextEditor } from '@/components/ui/text-editor'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Copy, Check } from 'lucide-react'

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function SecureMessageForm() {
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [autoDestruct, setAutoDestruct] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ id: string; readUrl: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!message.trim()) {
      toast.error('Message is required')
      return
    }
    if (message.length > 50000) {
      toast.error('Message must be under 50,000 characters')
      return
    }
    if (email && !isValidEmail(email)) {
      toast.error('Invalid email address')
      return
    }

    const startDateTime = startDate && startTime
      ? `${startDate}T${startTime}`
      : startDate || undefined
    const endDateTime = endDate && endTime
      ? `${endDate}T${endTime}`
      : endDate || undefined

    if (startDateTime && endDateTime && endDateTime <= startDateTime) {
      toast.error('End date must be after start date')
      return
    }

    setSubmitting(true)
    setResult(null)

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const plainBytes = new TextEncoder().encode(message)

      // 1. Generate key and nonce for message encryption
      const key = sodium.crypto_secretbox_keygen()
      const msgNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)

      // 2. Encrypt the plaintext
      const ciphertext = sodium.crypto_secretbox_easy(plainBytes, msgNonce, key)

      // 3. Build urlFragment and optional password fields
      let urlFragment: string
      let passwordSalt: string | undefined
      let passwordHash: string | undefined

      if (password) {
        // Password-protected: derive wrapping key, wrap the message key
        const pwSalt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
        const pwBytes = new TextEncoder().encode(password.normalize('NFKC'))

        const wrappingKey = sodium.crypto_pwhash(
          32,
          pwBytes,
          pwSalt,
          3,
          256 * 1024 * 1024,
          sodium.crypto_pwhash_ALG_ARGON2ID13,
        )

        const wrapNonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
        const wrappedKey = sodium.crypto_secretbox_easy(key, wrapNonce, wrappingKey)

        // Concatenate wrappedKey + wrapNonce for the URL fragment
        const combined = new Uint8Array(wrappedKey.length + wrapNonce.length)
        combined.set(wrappedKey, 0)
        combined.set(wrapNonce, wrappedKey.length)
        urlFragment = sodium.to_base64(combined, sodium.base64_variants.URLSAFE_NO_PADDING)

        passwordSalt = sodium.to_base64(pwSalt, sodium.base64_variants.ORIGINAL)
        passwordHash = await bcrypt.hash(password, 12)
      } else {
        // No password: the key itself goes in the URL fragment
        urlFragment = sodium.to_base64(key, sodium.base64_variants.URLSAFE_NO_PADDING)
      }

      // 4. Fetch CSRF token
      const csrfRes = await fetch('/api/csrf?tag=create-secure-message')
      const csrfData = await csrfRes.json()
      const csrfToken = csrfData.success ? csrfData.data.csrfToken : null

      // 5. POST to the API
      const payload: Record<string, unknown> = {
        ciphertext: sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL),
        msgNonce: sodium.to_base64(msgNonce, sodium.base64_variants.ORIGINAL),
        urlFragment,
        autoDestruct,
        csrfToken,
      }

      if (passwordHash) payload.passwordHash = passwordHash
      if (passwordSalt) payload.passwordSalt = passwordSalt
      if (email) payload.receiverEmail = email
      if (startDateTime) payload.startDate = new Date(startDateTime).toISOString()
      if (endDateTime) payload.endDate = new Date(endDateTime).toISOString()

      const res = await fetch('/api/secure-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error ?? 'Failed to create secure message')
      }

      setResult({ id: data.data.id, readUrl: data.data.readUrl })
      toast.success('Message encrypted and saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyReadUrl() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${result.readUrl}`)
      setCopied(true)
      toast.success('Read URL copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy URL')
    }
  }

  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Message Created</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Your message has been encrypted and saved. Share this link with the recipient:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded-sm border bg-muted px-3 py-2 font-mono text-sm">
              {result.readUrl}
            </code>
            <Button variant="outline" size="icon-sm" onClick={copyReadUrl} aria-label="Copy read URL">
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <Button variant="outline" onClick={() => { setResult(null); setMessage(''); setEmail(''); setPassword(''); setStartDate(''); setStartTime(''); setEndDate(''); setEndTime(''); setAutoDestruct(false) }}>
            Send Another
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="message">Message</Label>
        <TextEditor
          id="message"
          value={message}
          onChange={setMessage}
          maxLength={50000}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="email">Receiver email (optional)</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="recipient@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password (optional)</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Protect with a password"
            maxLength={128}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="start-date">Start date (optional)</Label>
          <div className="flex gap-2">
            <input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 flex-1 min-w-0 rounded-sm border border-input bg-card px-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            />
            <input
              id="start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-10 w-28 min-w-0 rounded-sm border border-input bg-card px-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="end-date">End date (optional)</Label>
          <div className="flex gap-2">
            <input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 flex-1 min-w-0 rounded-sm border border-input bg-card px-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            />
            <input
              id="end-time"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-10 w-28 min-w-0 rounded-sm border border-input bg-card px-3 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border px-4 py-3">
        <div className="min-w-0 flex-1">
          <Label htmlFor="autoDestruct" className="text-sm font-medium cursor-pointer">
            Auto-destruct
          </Label>
          <p className="text-xs text-muted-foreground">
            Message will be deleted after the first read.
          </p>
        </div>
        <Switch
          id="autoDestruct"
          checked={autoDestruct}
          onCheckedChange={setAutoDestruct}
        />
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Encrypting...' : 'Create Encrypted Message'}
      </Button>
    </form>
  )
}
