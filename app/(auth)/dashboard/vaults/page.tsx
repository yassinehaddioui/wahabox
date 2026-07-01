'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Package, Pencil, Trash2 } from 'lucide-react'

async function fetchCsrfToken(tag: string): Promise<string | null> {
  const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
  const data = await res.json()
  return data.success ? data.data.csrfToken : null
}

type Vault = {
  id: string
  label: string
  itemCount: number
  createdAt: string
  updatedAt: string
}

export default function VaultsPage() {
  const router = useRouter()
  const [vaults, setVaults] = useState<Vault[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [editVault, setEditVault] = useState<Vault | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [deleteConfirmVault, setDeleteConfirmVault] = useState<Vault | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const fetchVaults = useCallback(async () => {
    try {
      const res = await fetch('/api/vaults')
      const data = await res.json()
      if (data.success) {
        setVaults(data.data)
        setLastUpdated(new Date())
      }
    } catch {
      toast.error('Failed to load vaults')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchVaults()
  }, [fetchVaults])

  useEffect(() => {
    const interval = setInterval(fetchVaults, 30_000)
    return () => clearInterval(interval)
  }, [fetchVaults])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  async function createVault(e: React.FormEvent) {
    e.preventDefault()
    try {
      const csrfToken = await fetchCsrfToken('create-vault')
      const res = await fetch('/api/vaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        setNewLabel('')
        toast.success('Vault created')
        await fetchVaults()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to create vault')
    }
  }

  async function updateVault() {
    if (!editVault || !editLabel.trim()) return
    try {
      const csrfToken = await fetchCsrfToken('edit-vault')
      const res = await fetch(`/api/vaults/${editVault.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel, csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Vault updated')
        setEditVault(null)
        await fetchVaults()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to update vault')
    }
  }

  async function deleteVault() {
    if (!deleteConfirmVault) return
    setDeleting(true)
    try {
      const csrfToken = await fetchCsrfToken('delete-vault')
      const res = await fetch(`/api/vaults/${deleteConfirmVault.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Vault deleted')
        setDeleteConfirmVault(null)
        setDeleteConfirmText('')
        setEditVault(null)
        await fetchVaults()
      } else {
        toast.error(data.error)
      }
    } catch {
      toast.error('Failed to delete vault')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vaults</h1>
        <p className="text-sm text-muted-foreground">
          Securely store your encrypted passwords, notes, and secrets.
        </p>
        {lastUpdated && (
          <p className="mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Updated {Math.floor((now - lastUpdated.getTime()) / 1000)}s ago
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : vaults.length === 0 ? (
        <Card className="bg-canvas-soft">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No vaults yet. Create one below.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {vaults.map((vault) => (
            <Card key={vault.id} size="sm">
              <CardContent className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/vaults/${vault.id}`}
                    className="inline-flex items-center gap-2 font-medium min-w-0 hover:underline truncate"
                  >
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{vault.label}</span>
                  </Link>
                  <Badge variant="secondary" className="shrink-0 text-xs">
                    {vault.itemCount}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Created {new Date(vault.createdAt).toLocaleDateString()}</span>
                  <span>Updated {new Date(vault.updatedAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
              <CardFooter className="flex items-center justify-end gap-0.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => router.push(`/dashboard/vaults/${vault.id}`)}
                        aria-label="View vault"
                      >
                        <Package className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent>View vault</TooltipContent>
                </Tooltip>
                <Dialog
                  open={editVault?.id === vault.id}
                  onOpenChange={(open: boolean) => {
                    if (open) {
                      setEditVault(vault)
                      setEditLabel(vault.label)
                    } else {
                      setEditVault(null)
                    }
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <DialogTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label="Edit vault" />}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </DialogTrigger>
                      }
                    />
                    <TooltipContent>Edit vault</TooltipContent>
                  </Tooltip>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Edit Vault</DialogTitle>
                      <DialogDescription>Rename this vault.</DialogDescription>
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
                    </div>
                    <DialogFooter className="sm:justify-between">
                      <Button
                        variant="destructive"
                        onClick={() => {
                          setDeleteConfirmVault(editVault)
                          setDeleteConfirmText('')
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete vault
                      </Button>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setEditVault(null)}>
                          Cancel
                        </Button>
                        <Button onClick={updateVault}>Save</Button>
                      </div>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setDeleteConfirmVault(vault)
                          setDeleteConfirmText('')
                        }}
                        aria-label="Delete vault"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    }
                  />
                  <TooltipContent>Delete vault</TooltipContent>
                </Tooltip>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create New Vault</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createVault} className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Vault name"
              maxLength={128}
              required
            />
            <Button type="submit">Create</Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={deleteConfirmVault !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmVault(null)
            setDeleteConfirmText('')
          }
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete vault</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteConfirmVault?.label}</strong> and all{' '}
              {deleteConfirmVault?.itemCount ?? 0} item
              {(deleteConfirmVault?.itemCount ?? 0) !== 1 ? 's' : ''} associated with it. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-confirm">
              Type <span className="font-mono font-semibold text-destructive">DELETE</span> to
              confirm
            </Label>
            <Input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteConfirmVault(null)
                setDeleteConfirmText('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteVault}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete forever'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
