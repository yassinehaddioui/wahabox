'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
  const [loading, setLoading] = useState(true)
  const [editBox, setEditBox] = useState<PoBox | null>(null)
  const [editLabel, setEditLabel] = useState('')

  const fetchBoxes = useCallback(async () => {
    try {
      const res = await fetch('/api/boxes')
      const data = await res.json()
      if (data.success) setBoxes(data.data)
    } catch {
      toast.error('Failed to load boxes')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchBoxes() }, [fetchBoxes])

  async function createBox(e: React.FormEvent) {
    e.preventDefault()
    try {
      const res = await fetch('/api/boxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel }),
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
    const res = await fetch(`/api/boxes/${box.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !box.isActive }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success(box.isActive ? 'Box deactivated' : 'Box activated')
      await fetchBoxes()
    }
  }

  async function updateLabel() {
    if (!editBox || !editLabel.trim()) return
    const res = await fetch(`/api/boxes/${editBox.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: editLabel }),
    })
    const data = await res.json()
    if (data.success) {
      toast.success('Box renamed')
      setEditBox(null)
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My PO Boxes</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage your encrypted drop boxes.
        </p>
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
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
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
                    {box.label}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <button
                      onClick={() => copyDropLink(box.slug)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
                    >
                      /drop/{box.slug}
                    </button>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {box._count.messages}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={box.isActive}
                      onCheckedChange={() => toggleActive(box)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/dashboard/${box.id}`)}
                      >
                        Messages
                      </Button>
                      <Dialog open={editBox?.id === box.id} onOpenChange={(open: boolean) => {
                        if (!open) setEditBox(null)
                      }}>
                        <DialogTrigger render={<Button variant="ghost" size="sm" />}>
                          Rename
                        </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Rename Box</DialogTitle>
                          <DialogDescription>
                            Change the label for this PO box.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-2">
                          <Label htmlFor="edit-label">Label</Label>
                          <Input
                            id="edit-label"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            maxLength={128}
                          />
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setEditBox(null)}>
                            Cancel
                          </Button>
                          <Button onClick={updateLabel}>Save</Button>
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
