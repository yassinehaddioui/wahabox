'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, Download, Eye, EyeOff, Trash2 } from 'lucide-react'
import { Markdown } from '@/components/ui/markdown'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getSessionKeys } from '@/lib/session-keys'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const AUTO_DECRYPT_KEY = 'wahabox:autoDecrypt'

type Message = {
  id: string
  ciphertext: string
  readAt: string | null
  createdAt: string
  plaintext?: string
}

export default function MessagesPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [decrypted, setDecrypted] = useState<Set<string>>(new Set())
  const [autoDecrypt, setAutoDecrypt] = useState(() => {
    try {
      const stored =
        typeof window !== 'undefined' ? localStorage.getItem(AUTO_DECRYPT_KEY) : null
      if (stored) {
        const ids: string[] = JSON.parse(stored)
        return ids.includes(id)
      }
    } catch {}
    return false
  })
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  function toggleAutoDecrypt() {
    setAutoDecrypt((prev) => {
      const next = !prev
      try {
        const stored = localStorage.getItem(AUTO_DECRYPT_KEY)
        const ids: string[] = stored ? JSON.parse(stored) : []
        const updated = next ? [...new Set([...ids, id])] : ids.filter((i) => i !== id)
        localStorage.setItem(AUTO_DECRYPT_KEY, JSON.stringify(updated))
      } catch {}
      return next
    })
  }

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMessages()
  }, [fetchMessages])

  async function decryptForce(msg: Message) {
    if (msg.plaintext) return

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready
      const keys = getSessionKeys()

      if (!keys) return

      const plaintext = crypto.openMessage(
        crypto.fromBase64(msg.ciphertext),
        crypto.fromBase64(keys.publicKey),
        crypto.fromBase64(keys.privateKey),
      )

      const wasUnread = !msg.readAt

      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, plaintext } : m)))

      if (wasUnread) {
        await fetch(`/api/messages/${msg.id}`, { method: 'PATCH' }).catch(() => {})
      }
    } catch {}
  }

  useEffect(() => {
    if (!autoDecrypt || loading || messages.length === 0) return
    const unread = messages.filter((m) => !m.plaintext)
    if (unread.length === 0) return
    unread.forEach((m) => {
      decryptForce(m)
    })
  }, [autoDecrypt, messages, loading])

  async function decryptMessage(msg: Message) {
    if (msg.plaintext) {
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, plaintext: undefined } : m)))
      return
    }

    setDecrypted((prev) => new Set(prev).add(msg.id))

    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready
      const keys = getSessionKeys()

      if (!keys) {
        toast.error('Encryption keys not found. Please refresh the page or sign in again.')
        return
      }

      const plaintext = crypto.openMessage(
        crypto.fromBase64(msg.ciphertext),
        crypto.fromBase64(keys.publicKey),
        crypto.fromBase64(keys.privateKey),
      )

      const wasUnread = !msg.readAt

      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, plaintext } : m)))

      if (wasUnread) {
        await fetch(`/api/messages/${msg.id}`, { method: 'PATCH' }).catch(() => {})
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
    setDeleteTarget(null)
  }

  function downloadMessage(msg: Message) {
    if (!msg.plaintext) return
    const blob = new Blob([msg.plaintext], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `message-${new Date(msg.createdAt).toISOString().replace(/[:.]/g, '-')}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const unreadCount = messages.filter((m) => !m.readAt).length

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground">
              {messages.length} message{messages.length !== 1 ? 's' : ''}
              {unreadCount > 0 && <span className="ml-1 text-foreground">({unreadCount} new)</span>}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Switch id="auto-decrypt" checked={autoDecrypt} onCheckedChange={toggleAutoDecrypt} />
          <Label htmlFor="auto-decrypt" className="text-xs text-muted-foreground cursor-pointer">
            Auto-decrypt
          </Label>
          <Badge
            className={cn(
              'text-xs',
              autoDecrypt
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {autoDecrypt ? 'ON' : 'OFF'}
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : messages.length === 0 ? (
        <Card className="bg-canvas-soft">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No messages yet.
          </CardContent>
        </Card>
      ) : (
        messages.map((msg) => (
          <Card key={msg.id} className={cn(!msg.readAt && 'ring-2 ring-amber-400')}>
            <CardHeader className="bg-muted -mt-(--card-spacing) py-2.5">
              <CardTitle className="text-xs font-mono font-normal text-muted-foreground">
                {new Date(msg.createdAt).toLocaleString()}
              </CardTitle>
              {msg.readAt && (
                <CardDescription className="text-xs">
                  Read {new Date(msg.readAt).toLocaleTimeString()}
                </CardDescription>
              )}
              <CardAction>
                <div className="flex items-center gap-0.5">
                  {!msg.readAt && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium mr-1">
                      NEW
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => decryptMessage(msg)}
                    disabled={decrypted.has(msg.id)}
                    aria-label={msg.plaintext ? 'Hide message' : 'Decrypt message'}
                  >
                    {msg.plaintext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => downloadMessage(msg)}
                    disabled={!msg.plaintext}
                    aria-label="Download as markdown"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDeleteTarget(msg.id)}
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete message"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardAction>
            </CardHeader>
            {msg.plaintext && (
              <CardContent className="pt-0">
                <Markdown>{msg.plaintext}</Markdown>
              </CardContent>
            )}
          </Card>
        ))
      )}

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete message</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && deleteMessage(deleteTarget)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
