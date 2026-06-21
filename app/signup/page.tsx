'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SignupPage() {
  const router = useRouter()
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

      // Store all derived data in sessionStorage for the API call
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

      if (!data.success) {
        throw new Error(data.error)
      }

      // Clear session storage
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
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-2xl font-bold text-center">Save Your Recovery Code</h1>

          <p className="text-sm text-gray-600 text-center">
            This code is the <strong>only</strong> way to recover your account if you
            lose your password. Write it down and keep it safe.
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
            <code className="text-lg font-mono font-bold break-all select-all">
              {recoveryCode}
            </code>
          </div>

          {step === 'recovery' && (
            <button
              onClick={() => setStep('confirm')}
              className="w-full rounded-lg bg-black py-2 text-white hover:bg-gray-800"
            >
              I&apos;ve saved my recovery code
            </button>
          )}

          {step === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">
                Re-type your recovery code to confirm you&apos;ve saved it:
              </p>
              <input
                type="text"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="Enter your recovery code"
                className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
                autoComplete="off"
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Account Created!</h1>
          <p className="text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">Create Account</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              minLength={3}
              maxLength={32}
              pattern="^[a-zA-Z0-9_]+$"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
              minLength={8}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Generating keys...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
