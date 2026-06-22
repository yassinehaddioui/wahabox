'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CheckCircle, XCircle, Loader2, Shield, Smartphone, Key, Copy, Trash2, KeyRound, RefreshCw } from 'lucide-react'
import { clearSessionKeys, getSessionKeys } from '@/lib/session-keys'

const RESEND_COOLDOWN_S = 30

type EmailStatus = {
  hasEmail: boolean
  isVerified: boolean
  maskedEmail?: string
  notificationsEnabled: boolean
}

type MfaStatus = {
  mfaEmail: boolean
  mfaTotp: boolean
  mfaPasskey: boolean
  hasRecoveryCodes: boolean
  hasVerifiedEmail: boolean
  hasEmail: boolean
}

type Passkey = {
  id: string
  deviceName: string | null
  createdAt: string
  lastUsedAt: string | null
}

type TotpSetup = {
  uri: string
  secret: string
}

async function fetchCsrfToken(tag: string): Promise<string | null> {
  const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
  const data = await res.json()
  return data.success ? data.data.csrfToken : null
}

export default function SettingsPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<EmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [sendCooldown, setSendCooldown] = useState(0)

  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null)
  const [mfaLoading, setMfaLoading] = useState(true)
  const [mfaActionLoading, setMfaActionLoading] = useState<string | null>(null)

  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)

  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [passkeyDeviceName, setPasskeyDeviceName] = useState('')
  const [registeringPasskey, setRegisteringPasskey] = useState(false)

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [recoveryStatus, setRecoveryStatus] = useState<{ createdAt: string | null } | null>(null)
  const [recoveryLoading, setRecoveryLoading] = useState(true)
  const [regeneratingRecovery, setRegeneratingRecovery] = useState(false)
  const [accountRecoveryCode, setAccountRecoveryCode] = useState<string | null>(null)

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

  const fetchMfaStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/account/mfa')
      const data = await res.json()
      if (data.success) setMfaStatus(data.data)
    } catch {
      toast.error('Failed to load MFA settings')
    } finally {
      setMfaLoading(false)
    }
  }, [])

  const fetchPasskeys = useCallback(async () => {
    try {
      const res = await fetch('/api/account/mfa/passkeys')
      const data = await res.json()
      if (data.success) setPasskeys(data.data)
    } catch {}
  }, [])

  const fetchRecoveryStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/account/recovery-status')
      const data = await res.json()
      if (data.success) setRecoveryStatus(data.data)
    } catch {
      toast.error('Failed to load recovery key status')
    } finally {
      setRecoveryLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])
  useEffect(() => { fetchMfaStatus() }, [fetchMfaStatus])
  useEffect(() => { fetchPasskeys() }, [fetchPasskeys])
  useEffect(() => { fetchRecoveryStatus() }, [fetchRecoveryStatus])

  useEffect(() => {
    if (sendCooldown <= 0) return
    const timer = setInterval(() => setSendCooldown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [sendCooldown])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!email.includes('@')) {
      toast.error('Invalid email address')
      return
    }

    setSaving(true)
    try {
      const csrfToken = await fetchCsrfToken('email-set')
      const res = await fetch('/api/account/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.data.message)
        setEmail('')
        setSendCooldown(RESEND_COOLDOWN_S)
        await fetchStatus()
      } else {
        if (data.error?.startsWith('Wait ')) {
          const match = data.error.match(/Wait (\d+)s/)
          if (match) setSendCooldown(parseInt(match[1], 10))
        }
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
      const csrfToken = await fetchCsrfToken('email-resend')
      const res = await fetch('/api/account/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.data.message)
        setSendCooldown(RESEND_COOLDOWN_S)
      } else {
        if (data.error?.startsWith('Wait ')) {
          const match = data.error.match(/Wait (\d+)s/)
          if (match) setSendCooldown(parseInt(match[1], 10))
        }
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
      const csrfToken = await fetchCsrfToken('email-delete')
      const res = await fetch('/api/account/email', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      })
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

  async function handleToggleNotifications(enabled: boolean) {
    setToggling(true)
    try {
      const csrfToken = await fetchCsrfToken('email-notifications')
      const res = await fetch('/api/account/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationsEnabled: enabled, csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        setStatus((prev) => prev ? { ...prev, notificationsEnabled: enabled } : prev)
        toast.success(enabled ? 'Notifications enabled' : 'Notifications disabled')
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to update setting')
    } finally {
      setToggling(false)
    }
  }

  async function handleMfaAction(method: string, action: string, extra?: Record<string, unknown>) {
    setMfaActionLoading(`${method}:${action}`)
    try {
      const res = await fetch('/api/account/mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, action, ...extra }),
      })
      const data = await res.json()

      if (data.success) {
        if (action === 'setup' && method === 'totp') {
          setTotpSetup({ uri: data.data.uri, secret: data.data.secret })
        } else if (action === 'confirm' && method === 'totp') {
          setTotpSetup(null)
          setTotpCode('')
          setRecoveryCodes(data.data.recoveryCodes)
          await fetchMfaStatus()
        } else if (action === 'enable' || action === 'disable') {
          await fetchMfaStatus()
          if (method === 'passkey') await fetchPasskeys()
        }
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to update MFA setting')
    } finally {
      setMfaActionLoading(null)
    }
  }

  async function handleRegenRecovery() {
    setMfaActionLoading('recovery')
    try {
      const res = await fetch('/api/account/mfa/recovery', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setRecoveryCodes(data.data.recoveryCodes)
        await fetchMfaStatus()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to generate recovery codes')
    } finally {
      setMfaActionLoading(null)
    }
  }

  async function handleRegisterPasskey() {
    setRegisteringPasskey(true)
    try {
      const res = await fetch('/api/account/mfa/passkeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup' }),
      })
      const data = await res.json()

      if (!data.success) {
        toast.error(data.error)
        return
      }

      const { startRegistration } = await import('@simplewebauthn/browser')
      const attResult = await startRegistration({ optionsJSON: data.data })

      const confirmRes = await fetch('/api/account/mfa/passkeys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          attestation: attResult,
          deviceName: passkeyDeviceName || undefined,
        }),
      })
      const confirmData = await confirmRes.json()

      if (confirmData.success) {
        toast.success('Passkey registered')
        setPasskeyDeviceName('')
        await fetchPasskeys()
        await fetchMfaStatus()
      } else {
        toast.error(confirmData.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Passkey registration failed')
    } finally {
      setRegisteringPasskey(false)
    }
  }

  async function handleRemovePasskey(id: string) {
    try {
      const res = await fetch(`/api/account/mfa/passkeys/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        toast.success('Passkey removed')
        await fetchPasskeys()
        await fetchMfaStatus()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to remove passkey')
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }

    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters')
      return
    }

    setChangingPassword(true)
    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const saltRes = await fetch('/api/account/password')
      const saltData = await saltRes.json()
      if (!saltData.success) throw new Error('Failed to load account data')

      const { authSalt, pwKdfSalt, encPrivPw, pwNonce } = saltData.data

      const oldPwKdfSalt = crypto.fromBase64(pwKdfSalt)
      const oldAuthSalt = crypto.fromBase64(authSalt)

      const oldMasterKey = crypto.deriveMasterKey(currentPassword, oldPwKdfSalt)
      const { authKey, kekPw } = crypto.splitMasterKey(oldMasterKey)
      const currentAuthVerifier = crypto.computeAuthVerifier(authKey, oldAuthSalt)

      const oldEncPrivPw = crypto.fromBase64(encPrivPw)
      const oldPwNonce = crypto.fromBase64(pwNonce)
      let privateKey: Uint8Array
      try {
        privateKey = crypto.unwrapPrivateKey(oldEncPrivPw, oldPwNonce, kekPw)
      } catch {
        throw new Error('Failed to decrypt with current password')
      }

      const newPwKdfSalt = crypto.randomBytes(16)
      const newAuthSalt = crypto.randomBytes(16)
      const newMasterKey = crypto.deriveMasterKey(newPassword, newPwKdfSalt)
      const { authKey: newAuthKey, kekPw: newKekPw } = crypto.splitMasterKey(newMasterKey)
      const newEncPrivPw = crypto.wrapPrivateKey(privateKey, newKekPw)
      const newAuthVerifier = crypto.computeAuthVerifier(newAuthKey, newAuthSalt)

      const csrfToken = await fetchCsrfToken('password-change')

      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentAuthVerifier: crypto.toBase64(currentAuthVerifier),
          newAuthVerifier: crypto.toBase64(newAuthVerifier),
          newAuthSalt: crypto.toBase64(newAuthSalt),
          newEncPrivPw: crypto.toBase64(newEncPrivPw.ciphertext),
          newPwKdfSalt: crypto.toBase64(newPwKdfSalt),
          newPwNonce: crypto.toBase64(newEncPrivPw.nonce),
          csrfToken,
        }),
      })
      const data = await res.json()

      if (data.success) {
        toast.success(data.data.message)
        clearSessionKeys()
        router.push('/login')
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleRegenRecoveryKey() {
    setRegeneratingRecovery(true)
    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const keys = getSessionKeys()
      if (!keys?.privateKey) {
        toast.error('Encryption keys not found. Please refresh the page or sign in again.')
        return
      }

      const newCode = crypto.generateRecoveryCode()
      const newRecKdfSalt = crypto.randomBytes(16)
      const kekRec = crypto.deriveRecoveryKey(newCode, newRecKdfSalt)
      const wrapped = crypto.wrapPrivateKey(crypto.fromBase64(keys.privateKey), kekRec)

      const csrfToken = await fetchCsrfToken('regen-recovery')
      const res = await fetch('/api/auth/regen-recovery', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          encPrivRec: crypto.toBase64(wrapped.ciphertext),
          recKdfSalt: crypto.toBase64(newRecKdfSalt),
          recNonce: crypto.toBase64(wrapped.nonce),
          csrfToken: csrfToken ?? '',
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAccountRecoveryCode(newCode)
        await fetchRecoveryStatus()
      } else {
        toast.error(data.error)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate recovery key')
    } finally {
      setRegeneratingRecovery(false)
    }
  }

  function copyCodes() {
    if (!recoveryCodes) return
    navigator.clipboard.writeText(recoveryCodes.join('\n'))
    toast.success('Recovery codes copied')
  }

  function copyAccountRecoveryCode() {
    if (!accountRecoveryCode) return
    navigator.clipboard.writeText(accountRecoveryCode)
    toast.success('Recovery key copied')
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
                      {status.isVerified ? 'Verified' : 'Not verified. Check your inbox.'}
                    </p>
                  </div>
                  {status.isVerified ? (
                    <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
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

              {status?.hasEmail && status.isVerified && (
                <div className="flex items-center justify-between rounded-lg border bg-canvas-soft px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="notif-toggle" className="text-sm font-medium cursor-pointer">
                      Message notifications
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {status.notificationsEnabled
                        ? 'You will be notified when a box receives a new message.'
                        : 'You will not receive email notifications.'}
                    </p>
                  </div>
                  <Switch
                    id="notif-toggle"
                    checked={status.notificationsEnabled}
                    onCheckedChange={handleToggleNotifications}
                    disabled={toggling}
                  />
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
                <Button type="submit" disabled={saving || sendCooldown > 0}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  {sendCooldown > 0 ? `${status?.hasEmail ? 'Update' : 'Save'} (${sendCooldown}s)` : (status?.hasEmail ? 'Update' : 'Save')}
                </Button>
              </form>

              {status?.hasEmail && (
                <div className="flex gap-2">
                  {!status.isVerified && (
                    <Button variant="outline" onClick={handleResend} disabled={resending || sendCooldown > 0} className="flex-1">
                      {resending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                      {sendCooldown > 0 ? `Resend (${sendCooldown}s)` : 'Resend Verification'}
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Password</CardTitle>
          </div>
          <CardDescription>
            Change your account password. You&apos;ll need your current password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={changingPassword}>
              {changingPassword && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Change Password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Password Recovery Key</CardTitle>
          </div>
          <CardDescription>
            If you forget your password, you can use your recovery key to regain access to your account.
            Generating a new key will invalidate the old one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recoveryLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border bg-canvas-soft px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  Last generated{' '}
                  {(() => {
                    if (!recoveryStatus?.createdAt) return 'at account creation'
                    const days = Math.floor((Date.now() - new Date(recoveryStatus.createdAt).getTime()) / 86400000)
                    return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
                  })()}
                  {recoveryStatus?.createdAt && (
                    <>
                      {' · '}
                      {new Date(recoveryStatus.createdAt).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short' })}
                    </>
                  )}
                </p>
              </div>
              <Button
                onClick={handleRegenRecoveryKey}
                disabled={regeneratingRecovery}
                variant="outline"
              >
                {regeneratingRecovery && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Regenerate Recovery Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Multi-Factor Authentication</CardTitle>
          </div>
          <CardDescription>
            Add extra layers of security to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {mfaLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <>
              {/* Email 2FA */}
              <MfaSection
                icon={<Smartphone className="h-4 w-4" />}
                title="Email 2FA"
                description="Receive a 6-digit code at your verified email during login."
                enabled={mfaStatus?.mfaEmail ?? false}
                available={mfaStatus?.hasVerifiedEmail ?? false}
                unavailableReason="Verify your email first"
                loading={mfaActionLoading}
                onEnable={() => handleMfaAction('email', 'enable')}
                onDisable={() => handleMfaAction('email', 'disable')}
              />

              {/* TOTP */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Authenticator App</p>
                      <p className="text-xs text-muted-foreground">
                        {mfaStatus?.mfaTotp
                          ? 'TOTP is enabled.'
                          : 'Use an app like Google Authenticator to generate codes.'}
                      </p>
                    </div>
                  </div>
                  {mfaStatus?.mfaTotp ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Enabled</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMfaAction('totp', 'disable')}
                        disabled={mfaActionLoading === 'totp:disable'}
                      >
                        {mfaActionLoading === 'totp:disable' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Disable
                      </Button>
                    </div>
                  ) : totpSetup ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTotpSetup(null)}
                    >
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMfaAction('totp', 'setup')}
                      disabled={mfaActionLoading === 'totp:setup'}
                    >
                      {mfaActionLoading === 'totp:setup' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                      Setup
                    </Button>
                  )}
                </div>

                {totpSetup && (
                  <div className="rounded-lg border bg-canvas-soft p-4 space-y-3">
                    <div className="flex flex-col items-center gap-3">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpSetup.uri)}`}
                        alt="TOTP QR Code"
                        className="rounded-lg border bg-white p-2"
                        width={180}
                        height={180}
                      />
                      <p className="font-mono text-xs text-muted-foreground break-all select-all">
                        {totpSetup.secret}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="font-mono text-lg tracking-widest text-center"
                        autoComplete="one-time-code"
                      />
                      <Button
                        onClick={() => handleMfaAction('totp', 'confirm', { code: totpCode })}
                        disabled={totpCode.length !== 6 || mfaActionLoading === 'totp:confirm'}
                      >
                        {mfaActionLoading === 'totp:confirm' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                        Confirm
                      </Button>
                    </div>
                  </div>
                )}

                {mfaStatus?.mfaTotp && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenRecovery}
                    disabled={mfaActionLoading === 'recovery'}
                    className="text-muted-foreground"
                  >
                    Regenerate Recovery Codes
                  </Button>
                )}
              </div>

              {/* Passkeys */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <svg className="h-4 w-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <circle cx="8" cy="14" r="2" />
                      <path d="M8 14h8" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium">Passkeys</p>
                      <p className="text-xs text-muted-foreground">
                        {passkeys.length > 0
                          ? `${passkeys.length} passkey${passkeys.length !== 1 ? 's' : ''} registered.`
                          : 'Use biometrics or a security key to verify your identity.'}
                      </p>
                    </div>
                  </div>
                  {mfaStatus?.mfaPasskey && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMfaAction('passkey', 'disable')}
                      disabled={mfaActionLoading === 'passkey:disable'}
                    >
                      Disable All
                    </Button>
                  )}
                </div>

                {passkeys.length > 0 && (
                  <div className="space-y-2">
                    {passkeys.map((pk) => (
                      <div key={pk.id} className="flex items-center justify-between rounded-lg border bg-canvas-soft px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{pk.deviceName ?? 'Unknown device'}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(pk.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemovePasskey(pk.id)}
                          className="text-destructive hover:text-destructive shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <Input
                    value={passkeyDeviceName}
                    onChange={(e) => setPasskeyDeviceName(e.target.value)}
                    placeholder="Device name (optional)"
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={handleRegisterPasskey}
                    disabled={registeringPasskey}
                    className="shrink-0"
                  >
                    {registeringPasskey && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                    Add Passkey
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={recoveryCodes !== null} onOpenChange={() => setRecoveryCodes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recovery Codes</DialogTitle>
            <DialogDescription>
              Save these codes in a secure place. Each code can be used once to bypass MFA.
              They are only shown now and cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-canvas-soft p-4">
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes?.map((code, i) => (
                <code key={i} className="font-mono text-sm bg-muted/50 px-2 py-1 rounded text-center">
                  {code}
                </code>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyCodes} className="gap-1">
              <Copy className="h-4 w-4" />
              Copy All
            </Button>
            <Button onClick={() => setRecoveryCodes(null)}>
              I&apos;ve saved my codes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accountRecoveryCode !== null} onOpenChange={() => setAccountRecoveryCode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Recovery Key</DialogTitle>
            <DialogDescription>
              Save this key in a secure place. You&apos;ll need it to recover your account if you forget your password.
              It is only shown now and cannot be retrieved later.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-canvas-soft p-4">
            <code className="block font-mono text-lg text-center tracking-widest">
              {accountRecoveryCode}
            </code>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyAccountRecoveryCode} className="gap-1">
              <Copy className="h-4 w-4" />
              Copy
            </Button>
            <Button onClick={() => setAccountRecoveryCode(null)}>
              I&apos;ve saved my key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MfaSection({
  icon,
  title,
  description,
  enabled,
  available,
  unavailableReason,
  loading,
  onEnable,
  onDisable,
}: {
  icon: React.ReactNode
  title: string
  description: string
  enabled: boolean
  available: boolean
  unavailableReason: string
  loading: string | null
  onEnable: () => void
  onDisable: () => void
}) {
  if (enabled) {
    return (
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">Enabled</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onDisable}
            disabled={loading !== null}
          >
            {loading?.includes(title.toLowerCase()) && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
            Disable
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">
            {available ? description : unavailableReason}
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onEnable}
        disabled={!available || loading !== null}
        className="shrink-0"
      >
        {loading?.includes(title.toLowerCase()) && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        Enable
      </Button>
    </div>
  )
}
