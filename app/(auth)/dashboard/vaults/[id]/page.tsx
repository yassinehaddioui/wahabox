'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, ChevronDown, ChevronRight, Pencil, Trash2, Plus, Lock } from 'lucide-react'
import { Markdown } from '@/components/ui/markdown'
import { MdEditor } from '@/components/ui/md-editor'
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


type VaultItem = {
  id: string
  ciphertextTitle: string
  ciphertextBody: string
  createdAt: string
  updatedAt: string
}

type DecryptedItem = {
  title: string
  body: string
}

async function fetchCsrfToken(tag: string): Promise<string | null> {
  const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
  const data = await res.json()
  return data.success ? data.data.csrfToken : null
}

export default function VaultDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [items, setItems] = useState<VaultItem[]>([])
  const [loading, setLoading] = useState(true)
  const [vaultLabel, setVaultLabel] = useState('Vault')
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [creating, setCreating] = useState(false)
  const [editItem, setEditItem] = useState<VaultItem | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [decryptedMap, setDecryptedMap] = useState<Map<string, DecryptedItem>>(new Map())
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set())
  const [needsPassword, setNeedsPassword] = useState(false)
  const [vaultPassword, setVaultPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [vaultHasPassword, setVaultHasPassword] = useState(false)
  const [unlocked, setUnlocked] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        // Load vault metadata to check hasPassword
        const vaultsRes = await fetch('/api/vaults')
        const vaultsData = await vaultsRes.json()
        let hasPassword = false
        if (vaultsData.success) {
          const vault = vaultsData.data.find(
            (v: { id: string; label: string; hasPassword: boolean }) => v.id === id,
          )
          if (vault) {
            setVaultLabel(vault.label)
            hasPassword = vault.hasPassword
            setVaultHasPassword(vault.hasPassword)
          }
        }

        // Check sessionStorage for cached password
        const cachedPassword = sessionStorage.getItem(`vault:${id}:password`)

        if (hasPassword && !cachedPassword) {
          setNeedsPassword(true)
          return
        }

        // Load items with optional password header
        const headers: Record<string, string> = {}
        if (cachedPassword) {
          headers['X-Vault-Password'] = cachedPassword
        }

        const itemsRes = await fetch(`/api/vaults/${id}/items`, { headers })

        if (itemsRes.status === 401) {
          // Wrong password or expired — clear cache and show prompt
          sessionStorage.removeItem(`vault:${id}:password`)
          setNeedsPassword(true)
          setPasswordError('Invalid password. Please try again.')
          return
        }

        const itemsData = await itemsRes.json()
        if (itemsData.success) {
          const fetchedItems: VaultItem[] = itemsData.data
          setItems(fetchedItems)
          setUnlocked(true)
          // Auto-decrypt all items on load
          const { crypto } = await import('@/lib/crypto')
          await crypto.ready
          const keys = getSessionKeys()
          if (keys) {
            const decrypted = new Map<string, DecryptedItem>()
            for (const item of fetchedItems) {
              try {
                const result = crypto.decryptVaultItem(
                  crypto.fromBase64(item.ciphertextTitle),
                  crypto.fromBase64(item.ciphertextBody),
                  crypto.fromBase64(keys.publicKey),
                  crypto.fromBase64(keys.privateKey),
                )
                decrypted.set(item.id, result)
              } catch {}
            }
            setDecryptedMap(decrypted)
          }
        }
      } catch {
        toast.error('Failed to load vault data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    const title = newTitle.trim() || 'Untitled'
    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready
      const keys = getSessionKeys()
      if (!keys) {
        toast.error('Encryption keys not found. Please refresh or sign in again.')
        return
      }

      const result = crypto.encryptVaultItem(
        title,
        newBody,
        crypto.fromBase64(keys.publicKey),
      )
      const csrfToken = await fetchCsrfToken('create-vault-item')
      const res = await fetch(`/api/vaults/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertextTitle: crypto.toBase64(result.ciphertextTitle),
          ciphertextBody: crypto.toBase64(result.ciphertextBody),
          csrfToken,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Item created')
        const createdItem: VaultItem = data.data
        setNewTitle('')
        setNewBody('')
        setItems((prev) => [createdItem, ...prev])
        setDecryptedMap((prev) => new Map(prev).set(createdItem.id, {
          title,
          body: newBody,
        }))
      } else {
        toast.error(data.error ?? 'Failed to create item')
      }
    } catch {
      toast.error('Failed to create item')
    } finally {
      setCreating(false)
    }
  }

  function handleToggleItem(item: VaultItem) {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(item.id)) next.delete(item.id)
      else next.add(item.id)
      return next
    })
  }

  function startEdit(item: VaultItem) {
    const decrypted = decryptedMap.get(item.id)
    if (!decrypted) return
    setEditItem(item)
    setEditTitle(decrypted.title)
    setEditBody(decrypted.body)
  }

  async function handleEditSave() {
    if (!editItem) return
    setSaving(true)
    const title = editTitle.trim() || 'Untitled'
    try {
      const { crypto } = await import('@/lib/crypto')
      await crypto.ready
      const keys = getSessionKeys()
      if (!keys) {
        toast.error('Encryption keys not found. Please refresh or sign in again.')
        return
      }

      const result = crypto.encryptVaultItem(
        title,
        editBody,
        crypto.fromBase64(keys.publicKey),
      )
      const csrfToken = await fetchCsrfToken('edit-vault-item')
      const res = await fetch(`/api/vaults/${id}/items/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ciphertextTitle: crypto.toBase64(result.ciphertextTitle),
          ciphertextBody: crypto.toBase64(result.ciphertextBody),
          csrfToken,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Item updated')
        setItems((prev) =>
          prev.map((i) =>
            i.id === editItem.id
              ? {
                  ...i,
                  ciphertextTitle: crypto.toBase64(result.ciphertextTitle),
                  ciphertextBody: crypto.toBase64(result.ciphertextBody),
                  updatedAt: new Date().toISOString(),
                }
              : i,
          ),
        )
        setDecryptedMap((prev) => {
          const next = new Map(prev)
          next.set(editItem.id, { title, body: editBody })
          return next
        })
        setEditItem(null)
      } else {
        toast.error(data.error ?? 'Failed to update item')
      }
    } catch {
      toast.error('Failed to update item')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const csrfToken = await fetchCsrfToken('delete-vault-item')
      const res = await fetch(`/api/vaults/${id}/items/${deleteTarget}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Item deleted')
        setItems((prev) => prev.filter((i) => i.id !== deleteTarget))
        setDecryptedMap((prev) => {
          const next = new Map(prev)
          next.delete(deleteTarget)
          return next
        })
      } else {
        toast.error(data.error ?? 'Failed to delete item')
      }
    } catch {
      toast.error('Failed to delete item')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function handleUnlock() {
    if (!vaultPassword.trim()) return
    setPasswordError('')

    try {
      const headers: Record<string, string> = {
        'X-Vault-Password': vaultPassword,
      }
      const res = await fetch(`/api/vaults/${id}/items`, { headers })

      if (res.status === 429) {
        setPasswordError('Too many attempts. Please try again later.')
        return
      }

      if (res.status === 401) {
        setPasswordError('Invalid password')
        return
      }

      const data = await res.json()
      if (data.success) {
        sessionStorage.setItem(`vault:${id}:password`, vaultPassword)
        setNeedsPassword(false)
        setUnlocked(true)

        const fetchedItems: VaultItem[] = data.data
        setItems(fetchedItems)

        const { crypto } = await import('@/lib/crypto')
        await crypto.ready
        const keys = getSessionKeys()
        if (keys) {
          const decrypted = new Map<string, DecryptedItem>()
          for (const item of fetchedItems) {
            try {
              const result = crypto.decryptVaultItem(
                crypto.fromBase64(item.ciphertextTitle),
                crypto.fromBase64(item.ciphertextBody),
                crypto.fromBase64(keys.publicKey),
                crypto.fromBase64(keys.privateKey),
              )
              decrypted.set(item.id, result)
            } catch {}
          }
          setDecryptedMap(decrypted)
        }
      }
    } catch {
      setPasswordError('Failed to verify password')
    }
  }

  return (
    <div className="w-full space-y-6">
      <Dialog open={needsPassword} onOpenChange={(open) => {
        if (!open) {
          setNeedsPassword(false)
          router.back()
        }
      }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Vault password required</DialogTitle>
            <DialogDescription>
              This vault is password-protected. Enter the password to view its contents.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vault-password">Password</Label>
              <Input
                id="vault-password"
                type="password"
                value={vaultPassword}
                onChange={(e) => {
                  setVaultPassword(e.target.value)
                  setPasswordError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUnlock()
                }}
                autoFocus
                maxLength={128}
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNeedsPassword(false)
              router.back()
            }}>
              Go back
            </Button>
            <Button onClick={handleUnlock} disabled={!vaultPassword.trim()}>
              Unlock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {vaultHasPassword && unlocked && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              sessionStorage.removeItem(`vault:${id}:password`)
              setUnlocked(false)
              setVaultPassword('')
              setPasswordError('')
              setNeedsPassword(true)
              setDecryptedMap(new Map())
            }}
            title="Lock vault"
          >
            <Lock className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{vaultLabel}</h1>
          {!loading && (
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Card className="bg-canvas-soft">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No items yet. Create one below.
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[600px] overflow-y-auto space-y-3 rounded-lg border p-3">
          {items.map((item) => {
            const decrypted = decryptedMap.get(item.id)
            const isEditing = editItem?.id === item.id

            return (
              <Card key={item.id}>
                <CardHeader
                  className="bg-muted -mt-(--card-spacing) py-2.5 cursor-pointer"
                  onClick={() => handleToggleItem(item)}
                >
                  <CardTitle className="text-sm font-medium flex items-center gap-1">
                    {expandedSet.has(item.id) ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    {decrypted?.title ?? 'Encrypted item'}
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </CardDescription>
                  <CardAction>
                    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      {decrypted && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startEdit(item)}
                          aria-label="Edit item"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleteTarget(item.id)}
                        className="text-destructive hover:text-destructive"
                        aria-label="Delete item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardAction>
                </CardHeader>
                {isEditing && (
                  <CardContent className="space-y-3 pt-0">
                    <div className="space-y-2">
                      <Label htmlFor="edit-title">Title</Label>
                      <Input
                        id="edit-title"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={256}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-body">Body</Label>
                      <MdEditor
                        id="edit-body"
                        value={editBody}
                        onChange={setEditBody}
                        maxLength={50000}
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleEditSave}
                        disabled={saving}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditItem(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                )}
                {expandedSet.has(item.id) && !isEditing && (
                  <CardContent className="pt-0">
                    <Markdown>{decrypted!.body}</Markdown>
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add Item</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="space-y-3">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Item title"
              maxLength={256}
            />
            <MdEditor
              id="new-body"
              value={newBody}
              onChange={setNewBody}
              maxLength={50000}
            />
            <Button type="submit" disabled={creating}>
              <Plus className="h-4 w-4" />
              {creating ? 'Creating...' : 'Create'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete item</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this item? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
