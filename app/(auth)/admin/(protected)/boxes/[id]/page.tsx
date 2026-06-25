'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ExternalLink,
  Hash,
  Calendar,
  Mail,
  Bell,
  BellOff,
  Lock,
  MessageSquare,
  User,
} from 'lucide-react'

type RecentMessage = {
  id: string
  readAt: string | null
  createdAt: string
}

type BoxDetail = {
  id: string
  label: string
  greeting: string | null
  slug: string
  notify: boolean
  isActive: boolean
  expiresAt: string | null
  maxMessages: number
  createdAt: string
  hasPassword: boolean
  ownerUsername: string
  ownerId: string
  messageCount: number
  recentMessages: RecentMessage[]
}

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string }

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
      </CardContent>
    </Card>
  )
}

function InfoRow({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

function StatusBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={enabled ? 'default' : 'secondary'}>
        {enabled ? label : `No ${label.toLowerCase()}`}
      </Badge>
    </div>
  )
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function BoxDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [box, setBox] = useState<BoxDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadBox() {
      try {
        const res = await fetch(`/api/admin/boxes/${id}`)
        const json = (await res.json()) as ApiResponse<BoxDetail>
        if (cancelled) return
        if (res.status === 404) {
          setNotFound(true)
        } else if (json.success) {
          setBox(json.data)
        } else {
          setError(true)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadBox()
    return () => {
      cancelled = true
    }
  }, [id])

  const toggleActive = useCallback(async () => {
    if (!box) return
    setActionLoading('toggle')
    try {
      const csrfRes = await fetch('/api/csrf?tag=admin-box-action')
      const csrfData = await csrfRes.json()
      if (!csrfData.success) {
        toast.error('Failed to get security token')
        return
      }

      const res = await fetch(`/api/admin/boxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isActive: !box.isActive,
          csrfToken: csrfData.data.csrfToken,
        }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success(json.data.isActive ? 'Box activated' : 'Box deactivated')
        const boxRes = await fetch(`/api/admin/boxes/${id}`)
        const boxJson = (await boxRes.json()) as ApiResponse<BoxDetail>
        if (boxJson.success) setBox(boxJson.data)
      } else {
        toast.error(json.error)
      }
    } catch {
      toast.error('Action failed')
    } finally {
      setActionLoading(null)
    }
  }, [id, box])

  const deleteBox = useCallback(async () => {
    setActionLoading('delete')
    try {
      const csrfRes = await fetch('/api/csrf?tag=admin-box-delete')
      const csrfData = await csrfRes.json()
      if (!csrfData.success) {
        toast.error('Failed to get security token')
        return
      }

      const res = await fetch(`/api/admin/boxes/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csrfToken: csrfData.data.csrfToken }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Box deleted')
        window.location.href = '/admin/boxes'
      } else {
        toast.error(json.error)
      }
    } catch {
      toast.error('Delete failed')
    } finally {
      setActionLoading(null)
      setConfirmOpen(false)
    }
  }, [id])

  // Loading state
  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-32" />
        <SkeletonCard />
      </div>
    )
  }

  // Not found state
  if (notFound) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/boxes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Boxes
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-base font-medium">Box not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The box you are looking for does not exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error || !box) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/boxes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Boxes
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-base font-medium text-destructive">Failed to load box</p>
            <p className="mt-1 text-sm text-muted-foreground">
              An error occurred while fetching box data. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const createdDate = formatDate(box.createdAt)
  const expiresDate = formatDate(box.expiresAt)

  const isBusy = actionLoading !== null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/boxes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Boxes
      </Link>

      {/* Box Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Box Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <InfoRow label="Label" value={box.label} />
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Owner
            </span>
            <Link
              href={`/admin/users/${box.ownerId}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              {box.ownerUsername}
            </Link>
          </div>
          <InfoRow label="Slug" value={box.slug} icon={Hash} />
          <InfoRow label="Created" value={createdDate} icon={Calendar} />
          <InfoRow label="Expires" value={expiresDate} icon={Calendar} />
          <InfoRow label="Max Messages" value={box.maxMessages} icon={MessageSquare} />
        </CardContent>
      </Card>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-muted-foreground">Active</span>
            <Badge variant={box.isActive ? 'default' : 'secondary'}>
              {box.isActive ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              Password Protection
            </span>
            <Badge variant={box.hasPassword ? 'default' : 'secondary'}>
              {box.hasPassword ? 'Password Set' : 'No Password'}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {box.notify ? (
                <Bell className="h-3.5 w-3.5" />
              ) : (
                <BellOff className="h-3.5 w-3.5" />
              )}
              Notifications
            </span>
            <Badge variant={box.notify ? 'default' : 'secondary'}>
              {box.notify ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          {box.greeting && (
            <div className="flex items-center justify-between py-1.5">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />
                Greeting
              </span>
              <span className="max-w-[55%] truncate text-right text-sm font-medium">
                {box.greeting}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Messages Card */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Messages</CardTitle>
        </CardHeader>
        <CardContent>
          {box.recentMessages.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No messages yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 font-medium">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {box.recentMessages.map((msg) => (
                    <tr key={msg.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 tabular-nums">
                        {formatDate(msg.createdAt)}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={msg.readAt ? 'secondary' : 'outline'}>
                          {msg.readAt ? 'Read' : 'Unread'}
                        </Badge>
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">
                        {msg.id.slice(0, 12)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* External Link */}
      <Card>
        <CardHeader>
          <CardTitle>Drop Page</CardTitle>
        </CardHeader>
        <CardContent>
          <a
            href={box.slug ? `/drop/${box.slug}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open drop page in new tab
          </a>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={toggleActive} disabled={isBusy}>
            {actionLoading === 'toggle'
              ? box.isActive
                ? 'Deactivating...'
                : 'Activating...'
              : box.isActive
                ? 'Deactivate'
                : 'Activate'}
          </Button>
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button variant="destructive" disabled={isBusy} />}>
              {actionLoading === 'delete' ? 'Deleting...' : 'Delete Box'}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Box</DialogTitle>
                <DialogDescription>
                  This will permanently delete the box <strong>{box.label}</strong> and
                  all of its {box.messageCount} messages. This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={deleteBox}
                  disabled={isBusy}
                >
                  {actionLoading === 'delete' ? 'Deleting...' : 'Confirm Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
