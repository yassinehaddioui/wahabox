'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Search, ChevronLeft, ChevronRight, Lock, X } from 'lucide-react'

type Box = {
  id: string
  label: string
  slug: string
  isActive: boolean
  ownerId: string
  ownerUsername: string
  messageCount: number
  hasPassword: boolean
  createdAt: string
}

type BoxesResponse = Box & { total?: never } & {
  boxes: Box[]
  total: number
  page: number
  limit: number
  totalPages: number
}

async function fetchCsrfToken(tag: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/csrf?tag=${encodeURIComponent(tag)}`)
    const json = (await res.json()) as { success: boolean; data?: { csrfToken: string } }
    return json.success && json.data?.csrfToken ? json.data.csrfToken : null
  } catch {
    return null
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="rounded-lg border">
        <div className="divide-y divide-hairline">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-4" />
              <Skeleton className="ml-auto h-8 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AdminBoxesPage() {
  const [boxes, setBoxes] = useState<Box[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Box | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchBoxes = useCallback(async (q: string, active: string, p: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (active) params.set('isActive', active)
      params.set('page', String(p))
      params.set('limit', '20')
      const res = await fetch(`/api/admin/boxes?${params}`, { signal: controller.signal })
      const json = await res.json()
      if (!controller.signal.aborted) {
        if (json.success && json.data) {
          const d = json.data as { boxes: Box[]; total: number; page: number; totalPages: number }
          setBoxes(d.boxes)
          setTotalPages(d.totalPages)
          setPage(d.page)
        } else {
          setError(true)
        }
      }
    } catch (err) {
      if (!controller.signal.aborted && (err as Error).name !== 'AbortError') setError(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => { setPage(1); fetchBoxes(searchQuery, activeFilter, 1) }, 300)
    return () => clearTimeout(debounceTimer.current)
  }, [searchQuery, activeFilter, fetchBoxes])

  function goPage(newPage: number) {
    clearTimeout(debounceTimer.current)
    setPage(newPage)
    fetchBoxes(searchQuery, activeFilter, newPage)
  }

  async function handleToggleActive(box: Box) {
    setActionLoading(box.id)
    try {
      const csrfToken = await fetchCsrfToken('admin-box-action')
      if (!csrfToken) { toast.error('Failed to get security token'); return }
      const res = await fetch(`/api/admin/boxes/${box.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !box.isActive, csrfToken }),
      })
      const json = await res.json()
      if (json.success) { toast.success(json.data.isActive ? 'Box activated' : 'Box deactivated'); fetchBoxes(searchQuery, activeFilter, page) }
      else toast.error(json.error ?? 'Action failed')
    } catch { toast.error('Action failed') }
    finally { setActionLoading(null) }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setActionLoading(deleteTarget.id)
    try {
      const csrfToken = await fetchCsrfToken('admin-box-delete')
      if (!csrfToken) { toast.error('Failed to get security token'); return }
      const res = await fetch(`/api/admin/boxes/${deleteTarget.id}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Box deleted')
        setDeleteDialogOpen(false)
        setDeleteTarget(null)
        setDeleteConfirmText('')
        fetchBoxes(searchQuery, activeFilter, page)
      } else toast.error(json.error ?? 'Delete failed')
    } catch { toast.error('Delete failed') }
    finally { setActionLoading(null) }
  }

  function openDeleteDialog(box: Box) { setDeleteTarget(box); setDeleteConfirmText(''); setDeleteDialogOpen(true) }
  function closeDeleteDialog() { setDeleteDialogOpen(false); setDeleteTarget(null); setDeleteConfirmText('') }

  if (error && boxes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-12">
        <X className="mb-2 h-6 w-6 text-destructive" />
        <p className="text-sm font-medium text-destructive">Failed to load boxes</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => fetchBoxes(searchQuery, activeFilter, page)}>Retry</Button>
      </div>
    )
  }

  if (loading && boxes.length === 0) return <TableSkeleton />

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by label or owner..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" aria-label="Search boxes" />
        </div>
        <Select value={activeFilter || 'all'} onValueChange={(v) => setActiveFilter((v ?? '') === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="w-36" aria-label="Filter by status"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {boxes.length === 0 ? (
        <div className="rounded-lg border px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No boxes found.</p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Messages</TableHead>
                  <TableHead className="text-center">Password</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {boxes.map((box) => (
                  <TableRow key={box.id}>
                    <TableCell className="font-medium">{box.label}</TableCell>
                    <TableCell className="text-muted-foreground">{box.ownerUsername}</TableCell>
                    <TableCell><Badge variant={box.isActive ? 'default' : 'secondary'}>{box.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{box.messageCount}</TableCell>
                    <TableCell className="text-center">
                      {box.hasPassword
                        ? <Lock className="mx-auto h-4 w-4 text-muted-foreground" aria-label="Password protected" />
                        : <span className="text-xs text-muted-foreground">&mdash;</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{new Date(box.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Button variant="outline" size="sm" disabled={actionLoading === box.id} onClick={() => handleToggleActive(box)} aria-label={box.isActive ? 'Deactivate' : 'Activate'}>
                          {actionLoading === box.id ? '...' : box.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button variant="destructive" size="sm" disabled={actionLoading === box.id} onClick={() => openDeleteDialog(box)} aria-label="Delete">Delete</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground tabular-nums">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => goPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft className="mr-1 h-4 w-4" />Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => goPage(page + 1)} aria-label="Next page">
                  Next<ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Box</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteTarget?.label}</strong> and all its messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Type <span className="font-mono font-semibold">DELETE</span> to confirm.</p>
            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="Type DELETE to confirm" aria-label="Type DELETE to confirm" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDeleteDialog}>Cancel</Button>
            <Button variant="destructive" disabled={deleteConfirmText !== 'DELETE' || actionLoading !== null} onClick={handleDelete}>
              {actionLoading ? 'Deleting...' : 'Delete Box'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
