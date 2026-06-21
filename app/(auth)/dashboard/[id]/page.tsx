'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

type Message = {
  id: string
  ciphertext: string
  isRead: boolean
  createdAt: string
  plaintext?: string
}

export default function MessagesPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [decrypted, setDecrypted] = useState<Set<string>>(new Set())

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/boxes/${id}/messages`)
      const data = await res.json()
      if (data.success) {
        setMessages(data.data)
      }
    } catch {
      toast.error('Failed to load messages')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchMessages() }, [fetchMessages])

  async function decryptMessage(msg: Message) {
    if (msg.plaintext) {
      setDecrypted((prev) => {
        const next = new Set(prev)
        next.delete(msg.id)
        return next
      })
      return
    }

    setDecrypted((prev) => new Set(prev).add(msg.id))

    try {
      const { crypto } = await import('@/lib/crypto')
      const privateKey = sessionStorage.getItem('session:privateKey')
      const publicKey = sessionStorage.getItem('session:publicKey')

      if (!privateKey || !publicKey) {
        toast.error('Session expired, please re-login')
        router.push('/login')
        return
      }

      const plaintext = crypto.openMessage(
        crypto.fromBase64(msg.ciphertext),
        crypto.fromBase64(publicKey),
        crypto.fromBase64(privateKey),
      )

      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, plaintext } : m)),
      )

      if (!msg.isRead) {
        await fetch(`/api/messages/${msg.id}`, { method: 'PATCH' })
      }
    } catch {
      toast.error('Failed to decrypt message')
    } finally {
      setDecrypted((prev) => {
        const next = new Set(prev)
        next.delete(msg.id)
        return next
      })
    }
  }

  async function deleteMessage(msgId: string) {
    const res = await fetch(`/api/messages/${msgId}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.success) {
      setMessages((prev) => prev.filter((m) => m.id !== msgId))
      toast.success('Message deleted')
    } else {
      toast.error('Failed to delete message')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Messages</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No messages yet.
          </CardContent>
        </Card>
      ) : (
        messages.map((msg) => (
          <Card key={msg.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span>
                  {new Date(msg.createdAt).toLocaleString()}
                  {!msg.isRead && (
                    <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      New
                    </span>
                  )}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => decryptMessage(msg)}
                    disabled={decrypted.has(msg.id)}
                  >
                    {msg.plaintext ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMessage(msg.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    Delete
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            {msg.plaintext && (
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{msg.plaintext}</p>
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  )
}
