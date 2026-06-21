'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

      // Step 1: Get recovery data from server
      const startRes = await fetch('/api/auth/recovery-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const startData = await startRes.json()
      if (!startData.success) {
        throw new Error('Invalid username or recovery code')
      }

      // Step 2: Derive KEK_rec and unwrap private key
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

      // Step 3: Derive new master key from new password
      const pwKdfSalt = crypto.randomBytes(16)
      const authSalt = crypto.randomBytes(16)
      const masterKey = crypto.deriveMasterKey(newPassword, pwKdfSalt)
      const { authKey, kekPw } = crypto.splitMasterKey(masterKey)

      // Step 4: Re-wrap private key under new KEK_pw
      const encPrivPw = crypto.wrapPrivateKey(privateKey, kekPw)

      // Step 5: Compute new auth verifier
      const authVerifier = crypto.computeAuthVerifier(authKey, authSalt)

      // Step 6: POST new credentials to server
      const completeRes = await fetch('/api/auth/recovery-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          newAuthVerifier: crypto.toBase64(authVerifier),
          newAuthSalt: crypto.toBase64(authSalt),
          newEncPrivPw: crypto.toBase64(encPrivPw.ciphertext),
          newPwKdfSalt: crypto.toBase64(pwKdfSalt),
          newPwNonce: crypto.toBase64(encPrivPw.nonce),
        }),
      })
      const completeData = await completeRes.json()
      if (!completeData.success) {
        throw new Error(completeData.error)
      }

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
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Password Updated!</h1>
          <p className="text-gray-600">You can now sign in with your new password.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">Recover Account</h1>

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
            <label className="block text-sm font-medium mb-1">Recovery Code</label>
            <input
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 font-mono"
              autoComplete="off"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
            {loading ? 'Recovering...' : 'Recover Account'}
          </button>
        </form>
      </div>
    </div>
  )
}
