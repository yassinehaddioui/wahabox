'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

type BoxInfo = {
  label: string
  publicKey: string
}

export default function DropPage() {
  const { slug } = useParams<{ slug: string }>()
  const [box, setBox] = useState<BoxInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  useEffect(() => {
    fetch(`/api/drop/${slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setBox(data.data)
        } else {
          setError('This drop link is invalid or inactive.')
        }
      })
      .catch(() => setError('Failed to load drop box.'))
      .finally(() => setLoading(false))
  }, [slug])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError('')

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready

      const publicKey = crypto.fromBase64(box!.publicKey)
      const ciphertext = crypto.sealMessage(message, publicKey)

      const res = await fetch(`/api/drop/${slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertext: crypto.toBase64(ciphertext),
        }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error)
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  if (error && !box) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">Not Found</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">Message Sent!</h1>
          <p className="text-gray-600">Your message has been delivered securely.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-bold text-center">{box!.label}</h1>
        <p className="text-sm text-gray-600 text-center">
          Send an encrypted message to this PO Box.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Your Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 h-32"
              maxLength={5000}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={sending}
            className="w-full rounded-lg bg-black py-2 text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {sending ? 'Encrypting & Sending...' : 'Send Message'}
          </button>
        </form>
      </div>
    </div>
  )
}
