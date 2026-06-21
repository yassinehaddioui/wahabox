'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'

type PoBox = {
  id: string
  label: string
  slug: string
  isActive: boolean
  expiresAt: string | null
  maxMessages: number | null
  notify: boolean
  createdAt: string
  _count: { messages: number }
}

export default function DashboardPage() {
  const router = useRouter()
  const [boxes, setBoxes] = useState<PoBox[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchBoxes = useCallback(async () => {
    try {
      const res = await fetch('/api/boxes')
      const data = await res.json()
      if (data.success) {
        setBoxes(data.data)
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to load boxes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBoxes()
  }, [fetchBoxes])

  async function createBox(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
      })
      const data = await res.json()
      if (data.success) {
        setNewLabel('')
        await fetchBoxes()
      } else {
        setError(data.error)
      }
    } catch {
      setError('Failed to create box')
    }
  }

  async function toggleBox(box: PoBox) {
    const res = await fetch(`/api/boxes/${box.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !box.isActive }),
    })
    const data = await res.json()
    if (data.success) await fetchBoxes()
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <h1 className="text-2xl font-bold">My PO Boxes</h1>

      <form onSubmit={createBox} className="flex gap-2">
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New box name"
          className="flex-1 rounded-lg border px-3 py-2"
          maxLength={128}
          required
        />
        <button
          type="submit"
          className="rounded-lg bg-black px-4 py-2 text-white hover:bg-gray-800"
        >
          Create
        </button>
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-4">
        {boxes.map((box) => (
          <div key={box.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{box.label}</h2>
              <div className="flex gap-2 items-center">
                <span className={`text-xs px-2 py-0.5 rounded ${box.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {box.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs text-gray-500">{box._count.messages} messages</span>
                <button
                  onClick={() => toggleBox(box)}
                  className="text-xs underline text-gray-600 hover:text-gray-900"
                >
                  {box.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 break-all">
              Drop link: <code className="bg-gray-100 px-1 rounded">/drop/{box.slug}</code>
            </p>
          </div>
        ))}

        {boxes.length === 0 && (
          <p className="text-gray-500 text-center py-8">
            No PO boxes yet. Create one above to get started.
          </p>
        )}
      </div>
    </div>
  )
}
