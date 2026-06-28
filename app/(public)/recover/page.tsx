'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

async function fetchCsrfToken(tag: string): Promise<string | null> {
  const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
  const data = await res.json()
  return data.success ? data.data.csrfToken : null
}

export default function RecoverPage() {
  const router = useRouter()
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

      const csrfToken = await fetchCsrfToken('recovery-start')

      const startRes = await fetch('/api/auth/recovery-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, csrfToken }),
      })
      const startData = await startRes.json()
      if (!startData.success)
        throw new Error(startData.error || 'Invalid username or recovery code')

      const { encPrivRec, recKdfSalt, recNonce, publicKey, sealedChallenge, recoveryToken } =
        startData.data

      const recKdfSaltBytes = crypto.fromBase64(recKdfSalt)
      const kekRec = crypto.deriveRecoveryKey(recoveryCode, recKdfSaltBytes)

      let privateKey: Uint8Array
      try {
        const encPrivRecBytes = crypto.fromBase64(encPrivRec)
        const recNonceBytes = crypto.fromBase64(recNonce)
        privateKey = crypto.unwrapPrivateKey(encPrivRecBytes, recNonceBytes, kekRec)
      } catch {
        throw new Error('Invalid recovery code')
      }

      const publicKeyBytes = crypto.fromBase64(publicKey)
      const sealedBytes = crypto.fromBase64(sealedChallenge)
      let decryptedChallenge: string
      try {
        const decrypted = crypto.openSealed(sealedBytes, publicKeyBytes, privateKey)
        decryptedChallenge = crypto.toBase64(decrypted)
      } catch {
        throw new Error('Recovery code does not match this account')
      }

      const pwKdfSalt = crypto.randomBytes(16)
      const authSalt = crypto.randomBytes(16)
      const masterKey = crypto.deriveMasterKey(newPassword, pwKdfSalt)
      const { authKey, kekPw } = crypto.splitMasterKey(masterKey)
      const encPrivPw = crypto.wrapPrivateKey(privateKey, kekPw)
      const signKeypair = crypto.generateSignKeypair()
      const encPrivSignPwWrap = crypto.wrapPrivateKey(signKeypair.privateKey, kekPw)
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
          recoveryToken,
          decryptedChallenge,
          newAuthVerifier: crypto.toBase64(authVerifier),
          newAuthSalt: crypto.toBase64(authSalt),
          newEncPrivPw: crypto.toBase64(encPrivPw.ciphertext),
          newPwKdfSalt: crypto.toBase64(pwKdfSalt),
          newPwNonce: crypto.toBase64(encPrivPw.nonce),
          newPublicKeySign: crypto.toBase64(signKeypair.publicKey),
          newEncPrivSignPw: crypto.toBase64(encPrivSignPwWrap.ciphertext),
          newSignNoncePw: crypto.toBase64(encPrivSignPwWrap.nonce),
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
