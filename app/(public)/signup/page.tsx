'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCsrfToken } from '@/lib/use-csrf'

export default function SignupPage() {
  const router = useRouter()
  const csrfToken = useCsrfToken('signup')
  const [step, setStep] = useState<'form' | 'recovery' | 'confirm' | 'done'>('form')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const pwKdfSalt = crypto.randomBytes(16)
      const authSalt = crypto.randomBytes(16)
      const recKdfSalt = crypto.randomBytes(16)

      const masterKey = crypto.deriveMasterKey(password, pwKdfSalt)
      const { authKey, kekPw } = crypto.splitMasterKey(masterKey)

      const keypair = crypto.generateKeypair()

      const code = crypto.generateRecoveryCode()
      const kekRec = crypto.deriveRecoveryKey(code, recKdfSalt)

      const encPrivPw = crypto.wrapPrivateKey(keypair.privateKey, kekPw)
      const encPrivRec = crypto.wrapPrivateKey(keypair.privateKey, kekRec)

      const authVerifier = crypto.computeAuthVerifier(authKey, authSalt)

      sessionStorage.setItem('signup:username', username)
      sessionStorage.setItem('signup:authVerifier', crypto.toBase64(authVerifier))
      sessionStorage.setItem('signup:authSalt', crypto.toBase64(authSalt))
      sessionStorage.setItem('signup:publicKey', crypto.toBase64(keypair.publicKey))
      sessionStorage.setItem('signup:encPrivPw', crypto.toBase64(encPrivPw.ciphertext))
      sessionStorage.setItem('signup:pwNonce', crypto.toBase64(encPrivPw.nonce))
      sessionStorage.setItem('signup:pwKdfSalt', crypto.toBase64(pwKdfSalt))
      sessionStorage.setItem('signup:encPrivRec', crypto.toBase64(encPrivRec.ciphertext))
      sessionStorage.setItem('signup:recNonce', crypto.toBase64(encPrivRec.nonce))
      sessionStorage.setItem('signup:recKdfSalt', crypto.toBase64(recKdfSalt))

      setRecoveryCode(code)
      setStep('recovery')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Crypto setup failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (confirmCode !== recoveryCode) {
      setError('Recovery code does not match. Please re-enter it carefully.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: sessionStorage.getItem('signup:username'),
          csrfToken,
          authVerifier: sessionStorage.getItem('signup:authVerifier'),
          authSalt: sessionStorage.getItem('signup:authSalt'),
          publicKey: sessionStorage.getItem('signup:publicKey'),
          encPrivPw: sessionStorage.getItem('signup:encPrivPw'),
          pwNonce: sessionStorage.getItem('signup:pwNonce'),
          pwKdfSalt: sessionStorage.getItem('signup:pwKdfSalt'),
          encPrivRec: sessionStorage.getItem('signup:encPrivRec'),
          recNonce: sessionStorage.getItem('signup:recNonce'),
          recKdfSalt: sessionStorage.getItem('signup:recKdfSalt'),
        }),
      })

      const data = await res.json()
      if (!data.success) throw new Error(data.error)

      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith('signup:')) sessionStorage.removeItem(key)
      }

      setStep('done')
      setTimeout(() => router.push('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'recovery' || step === 'confirm') {
    return (
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader>
          <CardTitle>Save Your Recovery Code</CardTitle>
          <CardDescription>
            This code is the <strong>only</strong> way to recover your account if you
            lose your password. Write it down and keep it safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-amber-50 p-4 text-center dark:bg-amber-950">
            <code className="select-all text-lg font-bold font-mono break-all">
              {recoveryCode}
            </code>
          </div>

          {step === 'recovery' && (
            <Button onClick={() => setStep('confirm')} className="w-full">
              I&apos;ve saved my recovery code
            </Button>
          )}

          {step === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Re-type your recovery code to confirm you&apos;ve saved it:
              </p>
              <Input
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="Enter your recovery code"
                className="font-mono"
                autoComplete="off"
                required
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Creating account...' : 'Create Account'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    )
  }

  if (step === 'done') {
    return (
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader className="text-center">
          <CardTitle>Account Created!</CardTitle>
          <CardDescription>Redirecting to login...</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>
          Your keys are generated in your browser. We never see your password.
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
              minLength={3}
              maxLength={32}
              pattern="^[a-zA-Z0-9_]+$"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Generating keys...' : 'Create Account'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
