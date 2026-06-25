'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function AdminPromoteForm() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [csrfToken, setCsrfToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [csrfLoading, setCsrfLoading] = useState(true)

  useEffect(() => {
    async function loadCsrf() {
      try {
        const res = await fetch('/api/csrf?tag=admin-promote')
        const data = await res.json()
        if (data.success) {
          setCsrfToken(data.data.csrfToken)
        }
      } catch {
        toast.error('Failed to load security token. Please refresh.')
      } finally {
        setCsrfLoading(false)
      }
    }
    loadCsrf()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) {
      toast.error('Please enter the promotion token')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/admin/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(data.data.message)
        router.push('/admin')
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to submit promotion request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Enter Promotion Token</CardTitle>
        <CardDescription>
          Enter the admin promotion token provided by your server administrator to gain
          administrative access.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="promote-token">Promotion Token</Label>
            <Input
              id="promote-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter the admin promotion token..."
              disabled={loading || csrfLoading}
              required
              autoComplete="off"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={loading || csrfLoading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Promoting...' : 'Promote to Admin'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
