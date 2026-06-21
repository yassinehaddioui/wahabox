'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useCsrfToken } from '@/lib/use-csrf'

export default function LoginPage() {
  const router = useRouter()
  const csrfToken = useCsrfToken('login')
  const [checking, setChecking] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/boxes')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) router.replace('/dashboard')
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [router])

  if (checking) {
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const saltRes = await fetch('/api/auth/salts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const saltData = await saltRes.json()
      if (!saltData.success) throw new Error('Invalid credentials')

      const pwKdfSalt = crypto.fromBase64(saltData.data.pwKdfSalt)
      const authSalt = crypto.fromBase64(saltData.data.authSalt)

      const masterKey = crypto.deriveMasterKey(password, pwKdfSalt)
      const { authKey } = crypto.splitMasterKey(masterKey)
      const authVerifier = crypto.computeAuthVerifier(authKey, authSalt)

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          csrfToken,
          authVerifier: crypto.toBase64(authVerifier),
        }),
      })
      const loginData = await loginRes.json()
      if (!loginData.success) throw new Error('Invalid credentials')

      const encPrivPw = crypto.fromBase64(loginData.data.encPrivPw)
      const pwNonce = crypto.fromBase64(loginData.data.pwNonce)
      const { kekPw } = crypto.splitMasterKey(masterKey)
      const privateKey = crypto.unwrapPrivateKey(encPrivPw, pwNonce, kekPw)

      sessionStorage.setItem('session:privateKey', crypto.toBase64(privateKey))
      sessionStorage.setItem('session:publicKey', loginData.data.publicKey)

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md bg-canvas-soft">
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your credentials to access your PO boxes.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>
        <div className="flex justify-between text-sm">
          <Button variant="link" size="sm" render={<Link href="/signup" className="text-muted-foreground" />}>
            Create an account
          </Button>
          <Button variant="link" size="sm" render={<Link href="/recover" className="text-muted-foreground" />}>
            Recover account
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
