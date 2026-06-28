'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { formatUtcDate } from '@/lib/utils'
import sodium from 'libsodium-wrappers-sumo'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Markdown } from '@/components/ui/markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { FileQuestion, Clock, Hourglass, BadgeCheck, BadgeAlert } from 'lucide-react'

type Metadata = {
  hasPassword: boolean
  passwordSalt: string | null
  msgNonce: string
  startDate: string | null
  endDate: string | null
  isDestroyed: boolean
  autoDestruct: boolean
  signature: string | null
  senderPublicKeySign: string | null
  readAt: string | null
}

export default function ReadPage() {
  const { id } = useParams<{ id: string }>()
  const [meta, setMeta] = useState<Metadata | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [revealing, setRevealing] = useState(false)
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [dateError, setDateError] = useState('')
  const [countdown, setCountdown] = useState('')
  const [signatureState, setSignatureState] = useState<'verified' | 'invalid' | 'unsigned' | null>(null)

  // Fetch metadata on mount
  useEffect(() => {
    fetch(`/api/secure-messages/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setMeta(data.data)
        } else {
          if (data.code === 'NOT_FOUND') setError('This message no longer exists or has been destroyed.')
          else setError(data.error)
        }
      })
      .catch(() => setError('Failed to load message.'))
      .finally(() => setLoading(false))
  }, [id])

  // Date check
  useEffect(() => {
    if (!meta) return
    const now = new Date()
    if (meta.startDate && new Date(meta.startDate) > now) {
      requestAnimationFrame(() => setDateError('This message is not available yet.'))
    } else if (meta.endDate && new Date(meta.endDate) < now) {
      requestAnimationFrame(() => setDateError('This message has expired.'))
    }
  }, [meta])

  useEffect(() => {
    if (!meta?.startDate) return
    const target = new Date(meta.startDate).getTime()

    function update() {
      const now = Date.now()
      const diff = target - now
      if (diff <= 0) {
        setCountdown('')
        setDateError('')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      const parts: string[] = []
      if (days > 0) parts.push(`${days}d`)
      if (days > 0 || hours > 0) parts.push(`${hours}h`)
      parts.push(`${minutes}m`)
      parts.push(`${seconds}s`)
      setCountdown(parts.join(' '))
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [meta])

  const handleReveal = useCallback(async () => {
    setRevealing(true)
    setPasswordError('')
    setError('')

    try {
      await sodium.ready

      // Extract token from URL fragment
      const fragment = window.location.hash.slice(1) // remove the leading #
      if (!fragment) {
        setError('Invalid link — decryption key not found.')
        setRevealing(false)
        return
      }

      const fragmentBytes = sodium.from_base64(fragment, sodium.base64_variants.URLSAFE_NO_PADDING)

      let key: Uint8Array

      if (meta?.hasPassword) {
        // Password-protected: fragment contains wrappedKey || wrapNonce
        if (!password) {
          setPasswordError('Password required')
          setRevealing(false)
          return
        }
        if (!meta.passwordSalt) {
          setError('Invalid message format — missing password salt.')
          setRevealing(false)
          return
        }

        const wrappedKey = fragmentBytes.slice(0, 32 + 16) // 32B key + 16B MAC = 48B
        const wrapNonce = fragmentBytes.slice(48, 48 + 24) // 24B nonce

        // Derive wrapping key from password
        const pwSalt = sodium.from_base64(meta.passwordSalt, sodium.base64_variants.ORIGINAL)
        const pwBytes = new TextEncoder().encode(password.normalize('NFKC'))
        const wrappingKey = sodium.crypto_pwhash(
          32,
          pwBytes,
          pwSalt,
          3,
          256 * 1024 * 1024,
          sodium.crypto_pwhash_ALG_ARGON2ID13,
        )

        // Unwrap the real key
        try {
          key = sodium.crypto_secretbox_open_easy(wrappedKey, wrapNonce, wrappingKey)
        } catch {
          setPasswordError('Wrong password — could not decrypt the message key.')
          setRevealing(false)
          return
        }
      } else {
        // No password: fragment IS the key (32 bytes)
        key = fragmentBytes.slice(0, 32)
      }

      // Parse msgNonce from metadata
      const msgNonce = sodium.from_base64(meta!.msgNonce, sodium.base64_variants.ORIGINAL)

      // Fetch ciphertext from server
      const revealRes = await fetch(`/api/secure-messages/${id}/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(password ? { password } : {}),
      })
      const revealData = await revealRes.json()
      if (!revealData.success) {
        if (revealData.code === 'MESSAGE_NOT_AVAILABLE') {
          setDateError(revealData.error)
        } else {
          setError(revealData.error)
        }
        setRevealing(false)
        return
      }

      if (meta?.signature && meta?.senderPublicKeySign) {
        const { crypto } = await import('@/lib/crypto')
        await crypto.ready
        const messageToSign = revealData.data.ciphertext + '|' + sodium.to_base64(
          sodium.from_base64(meta!.msgNonce, sodium.base64_variants.ORIGINAL),
          sodium.base64_variants.ORIGINAL
        )
        try {
          const valid = crypto.verifyDetached(
            new TextEncoder().encode(messageToSign),
            crypto.fromBase64(meta.signature),
            crypto.fromBase64(meta.senderPublicKeySign)
          )
          setSignatureState(valid ? 'verified' : 'invalid')
        } catch {
          setSignatureState('invalid')
        }
      } else {
        setSignatureState('unsigned')
      }

      // Decrypt
      const ciphertext = sodium.from_base64(revealData.data.ciphertext, sodium.base64_variants.ORIGINAL)
      const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, msgNonce, key)
      setPlaintext(new TextDecoder().decode(decrypted))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decrypt message')
    } finally {
      setRevealing(false)
    }
  }, [id, meta, password])

  if (loading) {
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader className="text-center">
          <CardTitle><Skeleton className="h-6 w-48 mx-auto" /></CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-40 mx-auto" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="w-full max-w-4xl bg-canvas-soft">
        <CardHeader className="text-center">
          <FileQuestion className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
          <CardTitle>Not Found</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (dateError && !plaintext) {
    const isFuture = meta?.startDate && new Date(meta.startDate) > new Date()
    return (
      <Card className="w-full max-w-4xl bg-canvas-soft">
        <CardHeader className="text-center">
          {isFuture ? (
            <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          ) : (
            <Hourglass className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          )}
          <CardTitle>{isFuture ? 'Message Not Available Yet' : 'Unavailable'}</CardTitle>
          <CardDescription>
            {isFuture
              ? `This message will be available on ${formatUtcDate(meta!.startDate!)}.`
              : dateError}
          </CardDescription>
          {isFuture && countdown && (
            <p className="text-2xl font-mono font-semibold mt-3 tabular-nums">{countdown}</p>
          )}
        </CardHeader>
      </Card>
    )
  }

  if (plaintext) {
    return (
      <Card className="w-full max-w-4xl">
        <CardHeader>
          <CardTitle>Encrypted Message</CardTitle>
          <CardDescription>
            {meta?.autoDestruct ? 'This message has been destroyed after reading.' : 'Decrypted message'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {signatureState && signatureState !== 'unsigned' && (
            <div className="flex items-center gap-1 mb-3">
              {signatureState === 'verified' ? (
                <BadgeCheck className="h-4 w-4 text-emerald-500" />
              ) : (
                <BadgeAlert className="h-4 w-4 text-destructive" />
              )}
              <span className={`text-xs font-medium ${
                signatureState === 'verified' ? 'text-emerald-600' : 'text-destructive'
              }`}>
                {signatureState === 'verified' ? 'Signed' : 'Invalid Signature'}
              </span>
            </div>
          )}
          <Markdown>{plaintext}</Markdown>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader className="text-center">
        <CardTitle>Encrypted Message</CardTitle>
        <CardDescription>
          You have received an encrypted message.{' '}
          {meta?.autoDestruct && 'It will be destroyed after you view it.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {meta?.hasPassword && (
          <div className="space-y-2">
            <Label htmlFor="read-password">Password</Label>
            <Input
              id="read-password"
              type="password"
              placeholder="Enter password to decrypt"
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
        {!meta?.hasPassword && !dateError && (
          <p className="text-sm text-muted-foreground text-center">
            Click below to view the message.
          </p>
        )}
        <Button
          onClick={handleReveal}
          disabled={revealing || (meta?.hasPassword && !password) || !!dateError}
          className="w-full"
        >
          {revealing ? 'Decrypting...' : 'View Message'}
        </Button>
      </CardContent>
    </Card>
  )
}
