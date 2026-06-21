'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'

type EmailStatus = {
  hasEmail: boolean
  isVerified: boolean
  maskedEmail?: string
}

export default function SettingsPage() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [removing, setRemoving] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/account/email')
      const data = await res.json()
      if (data.success) setStatus(data.data)
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) {
      toast.error('Invalid email address')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/account/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.data.message)
        setEmail('')
        await fetchStatus()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to save email')
    } finally {
      setSaving(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      const res = await fetch('/api/account/email', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        toast.success(data.data.message)
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to resend verification email')
    } finally {
      setResending(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    try {
      const res = await fetch('/api/account/email', { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Email removed')
        await fetchStatus()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to remove email')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="w-full max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your email and notification preferences.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Notifications</CardTitle>
          <CardDescription>
            Receive email notifications when you get a new message.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {status?.hasEmail && (
                <div className="flex items-center gap-3 rounded-lg border bg-canvas-soft px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{status.maskedEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      {status.isVerified ? 'Verified. You will receive notifications.' : 'Not verified. Check your inbox.'}
                    </p>
                  </div>
                  {status.isVerified ? (
                    <Badge variant="secondary">
                      <CheckCircle className="mr-1 h-3 w-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-destructive border-destructive/50">
                      <XCircle className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
              )}

              <form onSubmit={handleSave} className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {status?.hasEmail ? 'Update' : 'Save'}
                </Button>
              </form>

              {status?.hasEmail && (
                <div className="flex gap-2">
                  {!status.isVerified && (
                    <Button variant="outline" onClick={handleResend} disabled={resending} className="flex-1">
                      {resending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      Resend Verification
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleRemove}
                    disabled={removing}
                    className="flex-1 text-destructive hover:text-destructive"
                  >
                    {removing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Remove Email
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
