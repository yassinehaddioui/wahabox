'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Mail, Pencil, Copy, RefreshCw, WandSparkles, Lock } from 'lucide-react'

async function fetchCsrfToken(tag: string): Promise<string | null> {
  const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
  const data = await res.json()
  return data.success ? data.data.csrfToken : null
}

type PoBox = {
  id: string
  label: string
  greeting: string | null
  slug: string
  isActive: boolean
  expiresAt: string | null
  maxMessages: number | null
  notify: boolean
  hasPassword: boolean
  createdAt: string
  _count: { messages: number }
  hasUnread: boolean
}

export default function DashboardPage() {
  const router = useRouter()
  const [boxes, setBoxes] = useState<PoBox[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [editBox, setEditBox] = useState<PoBox | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editGreeting, setEditGreeting] = useState('')
  const [editNotify, setEditNotify] = useState(true)
  const [editPassword, setEditPassword] = useState('')
  const [editPasswordTouched, setEditPasswordTouched] = useState(false)
  const [rotateBox, setRotateBox] = useState<PoBox | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [now, setNow] = useState(Date.now())
  const [autoDecryptMap, setAutoDecryptMap] = useState<Record<string, boolean>>({})

  const fetchBoxes = useCallback(async () => {
    try {
      const res = await fetch('/api/boxes')
      const data = await res.json()
      if (data.success) {
        setBoxes(data.data)
        setLastUpdated(new Date())
      }
    } catch {
      toast.error('Failed to load boxes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBoxes() }, [fetchBoxes])

  const AUTO_DECRYPT_KEY = 'wahabox:autoDecrypt'

  const toggleAutoDecrypt = useCallback((boxId: string) => {
    setAutoDecryptMap((prev) => {
      const next = !prev[boxId]
      try {
        const stored = localStorage.getItem(AUTO_DECRYPT_KEY)
        const ids: string[] = stored ? JSON.parse(stored) : []
        const updated = next
          ? [...new Set([...ids, boxId])]
          : ids.filter((i: string) => i !== boxId)
        localStorage.setItem(AUTO_DECRYPT_KEY, JSON.stringify(updated))
      } catch {}
      return { ...prev, [boxId]: next }
    })
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTO_DECRYPT_KEY)
      const ids: string[] = stored ? JSON.parse(stored) : []
      const map: Record<string, boolean> = {}
      for (const box of boxes) {
        map[box.id] = ids.includes(box.id)
      }
      setAutoDecryptMap((prev) => {
        const merged = { ...prev }
        for (const box of boxes) {
          if (!(box.id in merged)) merged[box.id] = map[box.id]
        }
        return merged
      })
    } catch {}
  }, [boxes])

  useEffect(() => {
    const interval = setInterval(fetchBoxes, 30_000)
    return () => clearInterval(interval)
  }, [fetchBoxes])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  async function createBox(e: React.FormEvent) {
    e.preventDefault()
    try {
      const csrfToken = await fetchCsrfToken('create-box')
      const res = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        setNewLabel('')
        toast.success('PO Box created')
        await fetchBoxes()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to create box')
    }
  }

  async function toggleActive(box: PoBox) {
    const csrfToken = await fetchCsrfToken('edit-box')
    const res = await fetch(`/api/boxes/${box.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !box.isActive, csrfToken }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(box.isActive ? 'Box deactivated' : 'Box activated')
      await fetchBoxes()
    } else {
      toast.error(data.error)
    }
  }

  async function removePassword() {
    if (!editBox) return
    const csrfToken = await fetchCsrfToken('edit-box')
    const res = await fetch(`/api/boxes/${editBox.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: null, csrfToken }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Password removed')
      setEditBox(null)
      setEditPasswordTouched(false)
      await fetchBoxes()
    } else {
      toast.error(data.error)
    }
  }

  async function updateBox() {
    if (!editBox || !editLabel.trim()) return
    const body: Record<string, unknown> = { label: editLabel }
    if (editGreeting !== (editBox.greeting ?? '')) {
      body.greeting = editGreeting || null
    }
    if (editNotify !== editBox.notify) {
      body.notify = editNotify
    }
    if (editPasswordTouched) {
      body.password = editPassword || null
    }
    const csrfToken = await fetchCsrfToken('edit-box')
    body.csrfToken = csrfToken
    const res = await fetch(`/api/boxes/${editBox.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Box updated')
      setEditBox(null)
      setEditPasswordTouched(false)
      await fetchBoxes()
    } else {
      toast.error(data.error)
    }
  }

  async function rotateSlug() {
    if (!rotateBox) return
    const csrfToken = await fetchCsrfToken('edit-box')
    const res = await fetch(`/api/boxes/${rotateBox.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rotateSlug: true, csrfToken }),
    })
    const data = await res.json()
    if (data.success) {
      const newLink = `${window.location.origin}/drop/${data.data.slug}`
      navigator.clipboard.writeText(newLink)
      toast.success('Link rotated & copied to clipboard')
      setRotateBox(null)
      await fetchBoxes()
    } else {
      toast.error(data.error)
    }
  }

  function copyDropLink(slug: string) {
    navigator.clipboard.writeText(`${window.location.origin}/drop/${slug}`)
    toast.success('Drop link copied')
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boxes</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage your encrypted drop boxes.
        </p>
        {lastUpdated && (
          <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Updated {Math.floor((now - lastUpdated.getTime()) / 1000)}s ago
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create New Box</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createBox} className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Box name"
              maxLength={128}
              required
            />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : boxes.length === 0 ? (
        <Card className="bg-canvas-soft">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No PO boxes yet. Create one above to get started.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Box</TableHead>
                <TableHead className="hidden sm:table-cell">Drop Link</TableHead>
                <TableHead className="text-center">Messages</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boxes.map((box) => (
                <TableRow key={box.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {box.hasUnread && (
                        <span className="flex h-2 w-2 rounded-full bg-primary" />
                      )}
                      {box.hasPassword && (
                        <Tooltip>
                          <TooltipTrigger render={<Lock className="h-3 w-3 text-amber-500 shrink-0" />} />
                          <TooltipContent>Password protected</TooltipContent>
                        </Tooltip>
                      )}
                      <Link href={`/dashboard/${box.id}`} className="hover:underline">
                        {box.label}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <a href={`/drop/${box.slug}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted-foreground hover:underline">
                      /drop/{box.slug}
                    </a>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className={box.hasUnread ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                      {box._count.messages}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={box.isActive}
                      onCheckedChange={() => toggleActive(box)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip>
                        <TooltipTrigger render={<Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => copyDropLink(box.slug)}
                          aria-label="Copy drop link"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>} />
                        <TooltipContent>Copy drop link</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={<Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toggleAutoDecrypt(box.id)}
                          aria-label="Toggle auto-decrypt"
                          className={autoDecryptMap[box.id] ? 'text-primary' : ''}
                        >
                          <WandSparkles className="h-3.5 w-3.5" />
                        </Button>} />
                        <TooltipContent>Auto-decrypt</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger render={<Button
                          variant={box.hasUnread ? 'default' : 'ghost'}
                          size="icon-sm"
                          onClick={() => router.push(`/dashboard/${box.id}`)}
                          aria-label="View messages"
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Button>} />
                        <TooltipContent>View messages</TooltipContent>
                      </Tooltip>
                      <Dialog open={rotateBox?.id === box.id} onOpenChange={(open: boolean) => {
                        if (open) setRotateBox(box)
                        else setRotateBox(null)
                      }}>
                        <Tooltip>
                          <TooltipTrigger render={<DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Rotate drop link" />}>
                            <RefreshCw className="h-3.5 w-3.5" />
                          </DialogTrigger>} />
                          <TooltipContent>Rotate drop link</TooltipContent>
                        </Tooltip>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Rotate Drop Link</DialogTitle>
                          <DialogDescription>
                            This will generate a new sharing link for <strong>{box.label}</strong>.
                            The old link will stop working immediately.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setRotateBox(null)}>
                            Cancel
                          </Button>
                          <Button onClick={rotateSlug}>
                            Rotate & Copy Link
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                      <Dialog open={editBox?.id === box.id} onOpenChange={(open: boolean) => {
                        if (open) {
                          setEditBox(box)
                          setEditLabel(box.label)
                          setEditGreeting(box.greeting ?? '')
                          setEditNotify(box.notify)
                          setEditPassword('')
                          setEditPasswordTouched(false)
                        } else {
                          setEditBox(null)
                          setEditPasswordTouched(false)
                        }
                      }}>
                        <Tooltip>
                          <TooltipTrigger render={<DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Edit box" />}>
                            <Pencil className="h-3.5 w-3.5" />
                          </DialogTrigger>} />
                          <TooltipContent>Edit box</TooltipContent>
                        </Tooltip>
                        <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Box</DialogTitle>
                          <DialogDescription>
                            Customize the label and greeting message for this PO box.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="edit-label">Label</Label>
                            <Input
                              id="edit-label"
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              maxLength={128}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-greeting">Greeting (optional)</Label>
                            <Textarea
                              id="edit-greeting"
                              value={editGreeting}
                              onChange={(e) => setEditGreeting(e.target.value)}
                              placeholder="Send an encrypted message to this PO Box. Your message is encrypted in your browser before being sent."
                              className="min-h-20"
                              maxLength={500}
                            />
                            <p className="text-xs text-muted-foreground">
                              This message is shown to people who open your drop link. Leave blank to use the default.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="edit-password">
                              {editBox?.hasPassword ? 'Change password' : 'Set a password (optional)'}
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                id="edit-password"
                                type="password"
                                placeholder={editBox?.hasPassword ? 'Leave blank to keep current' : 'Require a password to send messages'}
                                value={editPassword}
                                onChange={(e) => { setEditPassword(e.target.value); setEditPasswordTouched(true) }}
                                maxLength={128}
                              />
                              {editBox?.hasPassword && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="shrink-0"
                                  onClick={removePassword}
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <Label htmlFor="edit-notify" className="text-sm font-medium cursor-pointer">
                              Notify on new messages
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Receive email notifications when this box gets a new message.
                            </p>
                          </div>
                          <Switch
                            id="edit-notify"
                            checked={editNotify}
                            onCheckedChange={setEditNotify}
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => { setEditBox(null); setEditPasswordTouched(false) }}>
                            Cancel
                          </Button>
                          <Button onClick={updateBox}>Save</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
