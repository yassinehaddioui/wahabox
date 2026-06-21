'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      // Step 1: Fetch salts for the username
      const saltRes = await fetch('/api/auth/salts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const saltData = await saltRes.json()
      if (!saltData.success) {
        throw new Error('Invalid credentials')
      }

      const pwKdfSalt = crypto.fromBase64(saltData.data.pwKdfSalt)
      const authSalt = crypto.fromBase64(saltData.data.authSalt)

      // Step 2: Derive master key and compute auth verifier
      const masterKey = crypto.deriveMasterKey(password, pwKdfSalt)
      const { authKey } = crypto.splitMasterKey(masterKey)
      const authVerifier = crypto.computeAuthVerifier(authKey, authSalt)

      // Step 3: POST verifier to login endpoint
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          authVerifier: crypto.toBase64(authVerifier),
        }),
      })
      const loginData = await loginRes.json()
      if (!loginData.success) {
        throw new Error('Invalid credentials')
      }

      // Step 4: Unwrap private key into memory
      const encPrivPw = crypto.fromBase64(loginData.data.encPrivPw)
      const pwNonce = crypto.fromBase64(loginData.data.pwNonce)
      const { kekPw } = crypto.splitMasterKey(masterKey)
      const privateKey = crypto.unwrapPrivateKey(encPrivPw, pwNonce, kekPw)

      // Store in memory (sessionStorage, cleared on tab close or logout)
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
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">Sign In</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border px-3 py-2"
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
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-600">
          <a href="/signup" className="underline">Create an account</a>
        </p>
      </div>
    </div>
  )
}
