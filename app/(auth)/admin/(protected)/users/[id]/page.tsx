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
import { ArrowLeft, Mail, Key, Hash, Calendar, Box, MessageSquare, Fingerprint } from 'lucide-react'

type UserDetail = {
  id: string
  username: string
  role: 'user' | 'admin'
  hasEmail: boolean
  emailVerified: boolean
  notificationsEnabled: boolean
  mfaEmail: boolean
  mfaTotp: boolean
  mfaPasskey: boolean
  keyVersion: number
  tokenVersion: number
  createdAt: string
  boxCount: number
  passkeyCount: number
  messageCount: number
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

function MfaBadge({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'Enabled' : 'Disabled'}</Badge>
    </div>
  )
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [user, setUser] = useState<UserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadUser() {
      try {
        const res = await fetch(`/api/admin/users/${id}`)
        const json = (await res.json()) as ApiResponse<UserDetail>
        if (cancelled) return
        if (res.status === 404) {
          setNotFound(true)
        } else if (json.success) {
          setUser(json.data)
        } else {
          setError(true)
        }
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadUser()
    return () => {
      cancelled = true
    }
  }, [id])

  const performAction = useCallback(
    async (action: string) => {
      setActionLoading(action)
      try {
        const csrfRes = await fetch('/api/csrf?tag=admin-user-action')
        const csrfData = await csrfRes.json()
        if (!csrfData.success) {
          toast.error('Failed to get security token')
          return
        }

        const res = await fetch(`/api/admin/users/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, csrfToken: csrfData.data.csrfToken }),
        })
        const json = await res.json()
        if (json.success) {
          toast.success(json.data.message)
          const userRes = await fetch(`/api/admin/users/${id}`)
          const userJson = (await userRes.json()) as ApiResponse<UserDetail>
          if (userJson.success) setUser(userJson.data)
        } else {
          toast.error(json.error)
        }
      } catch {
        toast.error('Action failed')
      } finally {
        setActionLoading(null)
        setConfirmOpen(false)
      }
    },
    [id],
  )

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
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-base font-medium">User not found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The user you are looking for does not exist or has been removed.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Error state
  if (error || !user) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Users
        </Link>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-base font-medium text-destructive">Failed to load user</p>
            <p className="mt-1 text-sm text-muted-foreground">
              An error occurred while fetching user data. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const memberSince = new Date(user.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const isBusy = actionLoading !== null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Users
      </Link>

      {/* User Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <InfoRow label="Username" value={user.username} />
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-muted-foreground">Role</span>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role}
            </Badge>
          </div>
          <InfoRow label="Member since" value={memberSince} icon={Calendar} />
          <InfoRow label="Key Version" value={user.keyVersion} icon={Key} />
          <InfoRow label="Token Version" value={user.tokenVersion} icon={Hash} />
        </CardContent>
      </Card>

      {/* Security Card */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <div className="flex items-center justify-between py-1.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              Email
            </span>
            <div className="flex items-center gap-1.5">
              <Badge variant={user.hasEmail ? 'default' : 'secondary'}>
                {user.hasEmail ? 'Set' : 'Not set'}
              </Badge>
              {user.hasEmail && (
                <Badge variant={user.emailVerified ? 'default' : 'outline'}>
                  {user.emailVerified ? 'Verified' : 'Unverified'}
                </Badge>
              )}
            </div>
          </div>
          <MfaBadge enabled={user.mfaTotp} label="TOTP" />
          <MfaBadge enabled={user.mfaPasskey} label="Passkey" />
          <MfaBadge enabled={user.mfaEmail} label="Email MFA" />
          <InfoRow
            label="Notifications"
            value={user.notificationsEnabled ? 'Enabled' : 'Disabled'}
          />
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle>Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <InfoRow label="PO Boxes" value={user.boxCount} icon={Box} />
          <InfoRow label="Messages" value={user.messageCount} icon={MessageSquare} />
          <InfoRow label="Passkeys" value={user.passkeyCount} icon={Fingerprint} />
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {user.role === 'user' && (
            <Button onClick={() => performAction('promote')} disabled={isBusy}>
              {actionLoading === 'promote' ? 'Promoting...' : 'Promote to Admin'}
            </Button>
          )}
          {user.role === 'admin' && (
            <Button
              variant="outline"
              onClick={() => performAction('demote')}
              disabled={isBusy}
            >
              {actionLoading === 'demote' ? 'Demoting...' : 'Demote to User'}
            </Button>
          )}
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button variant="destructive" disabled={isBusy} />}>
              {actionLoading === 'force_logout' ? 'Logging out...' : 'Force Logout'}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Force Logout</DialogTitle>
                <DialogDescription>
                  This will invalidate all active sessions for{' '}
                  <strong>{user.username}</strong>. They will be required to log in again.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => performAction('force_logout')}
                  disabled={isBusy}
                >
                  {actionLoading === 'force_logout' ? 'Logging out...' : 'Confirm Force Logout'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
