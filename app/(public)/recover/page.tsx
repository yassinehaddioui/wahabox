'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCsrfToken } from '@/lib/use-csrf'

export default function RecoverPage() {
  const router = useRouter()
  const csrfToken = useCsrfToken('recovery-start')
  const [username, setUsername] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const startRes = await fetch('/api/auth/recovery-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, csrfToken }),
      })
      const startData = await startRes.json()
      if (!startData.success) throw new Error('Invalid username or recovery code')

      const recKdfSalt = crypto.fromBase64(startData.data.recKdfSalt)
      const kekRec = crypto.deriveRecoveryKey(recoveryCode, recKdfSalt)

      let privateKey: Uint8Array
      try {
        const encPrivRec = crypto.fromBase64(startData.data.encPrivRec)
        const recNonce = crypto.fromBase64(startData.data.recNonce)
        privateKey = crypto.unwrapPrivateKey(encPrivRec, recNonce, kekRec)
      } catch {
        throw new Error('Invalid recovery code')
      }

      const pwKdfSalt = crypto.randomBytes(16)
      const authSalt = crypto.randomBytes(16)
      const masterKey = crypto.deriveMasterKey(newPassword, pwKdfSalt)
      const { authKey, kekPw } = crypto.splitMasterKey(masterKey)
      const encPrivPw = crypto.wrapPrivateKey(privateKey, kekPw)
      const authVerifier = crypto.computeAuthVerifier(authKey, authSalt)

      const completeCsrfRes = await fetch('/api/csrf?tag=recovery-complete')
      const completeCsrfData = await completeCsrfRes.json()
      const completeCsrfToken = completeCsrfData.success ? completeCsrfData.data.csrfToken : null

      const completeRes = await fetch('/api/auth/recovery-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          csrfToken: completeCsrfToken,
          newAuthVerifier: crypto.toBase64(authVerifier),
          newAuthSalt: crypto.toBase64(authSalt),
          newEncPrivPw: crypto.toBase64(encPrivPw.ciphertext),
          newPwKdfSalt: crypto.toBase64(pwKdfSalt),
          newPwNonce: crypto.toBase64(encPrivPw.nonce),
        }),
      })
      const completeData = await completeRes.json()
      if (!completeData.success) throw new Error(completeData.error)

      setDone(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recovery failed')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Password Updated!</CardTitle>
          <CardDescription>You can now sign in with your new password.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Recover Account</CardTitle>
        <CardDescription>
          Use your recovery code to set a new password. Your PO boxes and messages remain intact.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recoveryCode">Recovery Code</Label>
            <Input
              id="recoveryCode"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              className="font-mono"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Recovering...' : 'Recover Account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
