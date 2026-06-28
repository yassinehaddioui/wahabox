'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Copy, Lock } from 'lucide-react'

type SentMessage = {
  id: string
  createdAt: string
  readAt: string | null
  isDestroyed: boolean
  autoDestruct: boolean
  hasPassword: boolean
  receiverEmail: string | null
}

export function SentMessagesList() {
  const [messages, setMessages] = useState<SentMessage[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/secure-messages')
      const data = await res.json()
      if (data.success) setMessages(data.data)
    } catch {
      // silently fail — not critical UI
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => fetchMessages())
    return () => cancelAnimationFrame(raf)
  }, [fetchMessages])

  function copyLink(id: string) {
    const base = `${window.location.origin}/read/${id}`
    navigator.clipboard.writeText(base)
    toast.success('Link copied (without decryption key)')
  }

  if (loading) return null

  if (messages.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sent Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No messages sent yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sent Messages ({messages.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.map((msg) => {
          let status: {
            label: string
            variant: 'default' | 'secondary' | 'destructive' | 'outline'
          }
          if (msg.isDestroyed) {
            status = { label: 'Destroyed', variant: 'destructive' }
          } else if (msg.readAt) {
            status = { label: 'Read', variant: 'default' }
          } else {
            status = { label: 'Pending', variant: 'secondary' }
          }

          return (
            <div
              key={msg.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant={
                      status.variant === 'default'
                        ? 'default'
                        : status.variant === 'destructive'
                          ? 'destructive'
                          : 'secondary'
                    }
                    className="text-[10px] px-1.5 py-0"
                  >
                    {status.label}
                  </Badge>
                  {msg.hasPassword && <Lock className="h-3 w-3 text-amber-500" />}
                  {msg.autoDestruct && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      auto-destruct
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(msg.createdAt).toLocaleString()}
                  {msg.readAt && !msg.isDestroyed && (
                    <> · Read {new Date(msg.readAt).toLocaleString()}</>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => copyLink(msg.id)}
                title="Copy link (without decryption key)"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
