'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TurnstileWidget } from '@/components/turnstile-widget'
import { CheckCircle, Loader2 } from 'lucide-react'

async function fetchCsrfToken(tag: string): Promise<string | null> {
  const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
  const data = await res.json()
  return data.success ? data.data.csrfToken : null
}

type Step = 'login' | 'mfa' | 'recovery'

type MfaState = {
  mfaToken: string
  methods: string[]
  verified: Set<string>
  emailSent: boolean
  emailCooldown: number
  loading: Record<string, boolean>
  error: Record<string, string>
}

export default function LoginPage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [step, setStep] = useState<Step>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const masterKeyRef = useRef<Uint8Array | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [needsTurnstile, setNeedsTurnstile] = useState(false)

  const [mfa, setMfa] = useState<MfaState>({
    mfaToken: '',
    methods: [],
    verified: new Set(),
    emailSent: false,
    emailCooldown: 0,
    loading: {},
    error: {},
  })

  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryLoading, setRecoveryLoading] = useState(false)

  useEffect(() => {
    fetch('/api/boxes')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) router.replace('/dashboard')
      })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [router])

  useEffect(() => {
    if (mfa.emailCooldown <= 0) return
    const timer = setInterval(() => {
      setMfa((prev) => ({
        ...prev,
        emailCooldown: Math.max(0, prev.emailCooldown - 1),
      }))
    }, 1000)
    return () => clearInterval(timer)
  }, [mfa.emailCooldown])

  if (checking) {
    return null
  }

  async function finishLogin(mk: Uint8Array, loginData: { encPrivPw: string; pwNonce: string; publicKey: string }) {
    const { crypto } = await import('@/lib/crypto')
    await crypto.ready

    const encPrivPw = crypto.fromBase64(loginData.encPrivPw)
    const pwNonce = crypto.fromBase64(loginData.pwNonce)
    const { kekPw } = crypto.splitMasterKey(mk)
    const privateKey = crypto.unwrapPrivateKey(encPrivPw, pwNonce, kekPw)

    sessionStorage.setItem('session:privateKey', crypto.toBase64(privateKey))
    sessionStorage.setItem('session:publicKey', loginData.publicKey)

    router.push('/dashboard')
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

      const mk = crypto.deriveMasterKey(password, pwKdfSalt)
      masterKeyRef.current = mk

      const { authKey } = crypto.splitMasterKey(mk)
      const authVerifier = crypto.computeAuthVerifier(authKey, authSalt)

      const csrfToken = await fetchCsrfToken('login')

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          csrfToken,
          turnstileToken: turnstileToken,
          authVerifier: crypto.toBase64(authVerifier),
        }),
      })
      const loginData = await loginRes.json()

      if (!loginData.success) {
        if (loginData.code === 'MFA_REQUIRED') {
          setMfa((prev) => ({
            ...prev,
            mfaToken: loginData.mfaToken,
            methods: loginData.methods,
          }))

          if (loginData.methods.includes('email')) {
            sendEmailCode(loginData.mfaToken)
          }

          setStep('mfa')
          return
        }
        throw new Error(loginData.error ?? 'Invalid credentials')
      }

      await finishLogin(mk, loginData.data)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      setError(message)
      if (message.includes('CAPTCHA')) {
        setNeedsTurnstile(true)
        setTurnstileToken(null)
      }
    } finally {
      setLoading(false)
    }
  }

  async function sendEmailCode(mfaToken: string) {
    setMfa((prev) => ({
      ...prev,
      loading: { ...prev.loading, email: true },
    }))

    try {
      await fetch('/api/auth/mfa/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken }),
      })
      setMfa((prev) => ({
        ...prev,
        emailSent: true,
        emailCooldown: 60,
      }))
    } catch {
      setMfa((prev) => ({
        ...prev,
        error: { ...prev.error, email: 'Failed to send code' },
      }))
    } finally {
      setMfa((prev) => ({
        ...prev,
        loading: { ...prev.loading, email: false },
      }))
    }
  }

  async function verifyMethod(code: string) {
    const method = 'totp'
    setMfa((prev) => ({
      ...prev,
      loading: { ...prev.loading, [method]: true },
      error: { ...prev.error, [method]: '' },
    }))

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: mfa.mfaToken, method, code }),
      })
      const data = await res.json()

      if (data.success) {
        if (data.data.mfaComplete) {
          await finishLogin(masterKeyRef.current!, data.data)
          return
        }
        setMfa((prev) => ({
          ...prev,
          verified: new Set([...prev.verified, method]),
        }))
      } else if (data.code === 'MFA_REQUIRED') {
        setMfa((prev) => ({
          ...prev,
          verified: new Set(data.verified),
        }))
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setMfa((prev) => ({
        ...prev,
        error: { ...prev.error, [method]: err instanceof Error ? err.message : 'Verification failed' },
      }))
    } finally {
      setMfa((prev) => ({
        ...prev,
        loading: { ...prev.loading, [method]: false },
      }))
    }
  }

  async function verifyEmailCode(code: string) {
    const method = 'email'
    setMfa((prev) => ({
      ...prev,
      loading: { ...prev.loading, [method]: true },
      error: { ...prev.error, [method]: '' },
    }))

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: mfa.mfaToken, method, code }),
      })
      const data = await res.json()

      if (data.success) {
        if (data.data.mfaComplete) {
          await finishLogin(masterKeyRef.current!, data.data)
          return
        }
        setMfa((prev) => ({
          ...prev,
          verified: new Set([...prev.verified, method]),
        }))
      } else if (data.code === 'MFA_REQUIRED') {
        setMfa((prev) => ({
          ...prev,
          verified: new Set(data.verified),
        }))
      } else {
        throw new Error(data.error)
      }
    } catch (err) {
      setMfa((prev) => ({
        ...prev,
        error: { ...prev.error, [method]: err instanceof Error ? err.message : 'Verification failed' },
      }))
    } finally {
      setMfa((prev) => ({
        ...prev,
        loading: { ...prev.loading, [method]: false },
      }))
    }
  }

  async function verifyPasskey() {
    const method = 'passkey'
    setMfa((prev) => ({
      ...prev,
      loading: { ...prev.loading, [method]: true },
      error: { ...prev.error, [method]: '' },
    }))

    try {
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: mfa.mfaToken, method, code: null }),
      })
      const data = await res.json()

      if (data.success && data.data.passkeyOptions) {
        const { startAuthentication } = await import('@simplewebauthn/browser')
        try {
          const authResult = await startAuthentication({ optionsJSON: data.data.passkeyOptions })

          const verifyRes = await fetch('/api/auth/mfa/verify', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mfaToken: mfa.mfaToken, assertion: authResult }),
          })
          const verifyData = await verifyRes.json()

          if (verifyData.success) {
            if (verifyData.data.mfaComplete) {
              await finishLogin(masterKeyRef.current!, verifyData.data)
              return
            }
            setMfa((prev) => ({
              ...prev,
              verified: new Set([...prev.verified, method]),
            }))
          } else {
            throw new Error(verifyData.error)
          }
        } catch (err) {
          throw new Error(err instanceof Error ? err.message : 'Passkey authentication failed')
        }
      } else {
        throw new Error(data.error ?? 'Passkey challenge failed')
      }
    } catch (err) {
      setMfa((prev) => ({
        ...prev,
        error: { ...prev.error, [method]: err instanceof Error ? err.message : 'Passkey verification failed' },
      }))
    } finally {
      setMfa((prev) => ({
        ...prev,
        loading: { ...prev.loading, [method]: false },
      }))
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault()
    setRecoveryLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/mfa/recover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken: mfa.mfaToken, recoveryCode }),
      })
      const data = await res.json()

      if (data.success) {
        await finishLogin(masterKeyRef.current!, data.data)
      } else {
        setError(data.error ?? 'Invalid recovery code')
      }
    } catch {
      setError('Recovery failed')
    } finally {
      setRecoveryLoading(false)
    }
  }

  if (step === 'recovery') {
    return (
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader>
          <CardTitle>Recovery Code</CardTitle>
          <CardDescription>Enter one of your MFA recovery codes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleRecoverySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="recovery-code">Recovery Code</Label>
              <Input
                id="recovery-code"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                required
                autoComplete="off"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep('mfa')}>
                Back
              </Button>
              <Button type="submit" disabled={recoveryLoading} className="flex-1">
                {recoveryLoading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    )
  }

  if (step === 'mfa') {
    const allVerified = mfa.methods.every((m) => mfa.verified.has(m))

    return (
      <Card className="w-full max-w-md bg-canvas-soft">
        <CardHeader>
          <CardTitle>Verify Your Identity</CardTitle>
          <CardDescription>
            Your account requires additional verification.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {mfa.methods.includes('email') && (
            <MfaMethodBlock
              label="Email Code"
              description="A 6-digit code has been sent to your email."
              verified={mfa.verified.has('email')}
              loading={mfa.loading.email}
              error={mfa.error.email}
              onVerify={verifyEmailCode}
              onResend={() => sendEmailCode(mfa.mfaToken)}
              cooldown={mfa.emailCooldown}
              inputType="code"
            />
          )}

          {mfa.methods.includes('totp') && (
            <MfaMethodBlock
              label="Authenticator Code"
              description="Enter the 6-digit code from your authenticator app."
              verified={mfa.verified.has('totp')}
              loading={mfa.loading.totp}
              error={mfa.error.totp}
              onVerify={verifyMethod}
              inputType="code"
            />
          )}

          {mfa.methods.includes('passkey') && (
            <MfaMethodBlock
              label="Passkey"
              description="Verify your identity with a registered passkey."
              verified={mfa.verified.has('passkey')}
              loading={mfa.loading.passkey}
              error={mfa.error.passkey}
              onVerify={verifyPasskey}
              inputType="button"
            />
          )}

          {allVerified && (
            <p className="text-sm text-center text-muted-foreground">Signing in...</p>
          )}

          <div className="pt-2">
            <Button
              variant="link"
              size="sm"
              onClick={() => setStep('recovery')}
              className="w-full text-muted-foreground"
            >
              Use a recovery code instead
            </Button>
          </div>
        </CardContent>
      </Card>
    )
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
          {needsTurnstile && (
            <TurnstileWidget
              onVerify={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />
          )}
          <Button type="submit" disabled={loading || (needsTurnstile && !turnstileToken)} className="w-full">
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

function MfaMethodBlock({
  label,
  description,
  verified,
  loading,
  error,
  onVerify,
  onResend,
  cooldown,
  inputType,
}: {
  label: string
  description: string
  verified: boolean
  loading: boolean
  error: string
  onVerify: (code: string) => void
  onResend?: () => void
  cooldown?: number
  inputType: 'code' | 'button'
}) {
  const [code, setCode] = useState('')

  if (verified) {
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-canvas-soft px-4 py-3">
        <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">Verified</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      {inputType === 'code' ? (
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="font-mono text-lg tracking-widest text-center"
            autoComplete="one-time-code"
          />
          <Button
            onClick={() => onVerify(code)}
            disabled={loading || code.length !== 6}
          >
            {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Verify
          </Button>
        </div>
      ) : (
        <Button
          onClick={() => onVerify('')}
          disabled={loading}
          className="w-full"
          variant="outline"
        >
          {loading && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Verify with Passkey
        </Button>
      )}
      {onResend && (
        <p className="text-xs">
          {cooldown && cooldown > 0 ? (
            <span className="text-muted-foreground">Resend in {cooldown}s</span>
          ) : (
            <button
              type="button"
              onClick={onResend}
              className="text-primary hover:underline"
            >
              Resend code
            </button>
          )}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
