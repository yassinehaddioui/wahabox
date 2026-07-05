'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

type AuditEntry = {
  id: string
  actorId: string
  actorUsername: string
  action: string
  targetType: string
  targetId: string
  targetLabel: string | null
  metadata: unknown
  ip: string | null
  createdAt: string
}

type AuditLogResponse = {
  entries: AuditEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const ACTION_LABELS: Record<string, string> = {
  'admin.promote': 'Promoted user',
  'admin.demote': 'Demoted user',
  'admin.force_logout': 'Force logged out user',
  'admin.suspend': 'Suspended user',
  'admin.unsuspend': 'Unsuspended user',
  'admin.box_deactivate': 'Deactivated box',
  'admin.box_activate': 'Activated box',
  'admin.box_delete': 'Deleted box',
  'vault.create': 'Created vault',
  'vault.update': 'Updated vault',
  'vault.delete': 'Deleted vault',
  'vault_item.create': 'Created vault item',
  'vault_item.update': 'Updated vault item',
  'vault_item.delete': 'Deleted vault item',
  'auth.signup': 'Account created',
  'auth.login': 'Logged in',
  'auth.logout': 'Logged out',
  'auth.password_change': 'Changed password',
  'box.create': 'Created box',
  'box.update': 'Updated box',
  'box.delete': 'Deleted box',
  'account.email_set': 'Set email',
  'account.email_remove': 'Removed email',
  'account.notifications_toggle': 'Toggled notifications',
  'mfa.email_enable': 'Enabled email 2FA',
  'mfa.email_disable': 'Disabled email 2FA',
  'mfa.totp_confirm': 'Enabled TOTP 2FA',
  'mfa.totp_disable': 'Disabled TOTP 2FA',
  'mfa.passkey_register': 'Registered passkey',
  'mfa.passkey_remove': 'Removed passkey',
  'mfa.recovery_codes_regenerate': 'Regenerated recovery codes',
}

function getActionBadge(
  action: string,
): { variant: 'default' | 'destructive' | 'secondary' | 'outline'; className?: string } {
  switch (action) {
    // Success/green: creation, promote, activate, unsuspend
    case 'admin.promote':
    case 'admin.unsuspend':
    case 'admin.box_activate':
    case 'vault.create':
    case 'vault_item.create':
    case 'auth.signup':
    case 'box.create':
    case 'account.email_set':
    case 'mfa.email_enable':
    case 'mfa.totp_confirm':
    case 'mfa.passkey_register':
      return { variant: 'default' }
    // Destructive/red: deletion, demote, suspend, force_logout
    case 'admin.demote':
    case 'admin.suspend':
    case 'admin.force_logout':
    case 'admin.box_delete':
    case 'vault.delete':
    case 'vault_item.delete':
    case 'auth.logout':
    case 'box.delete':
    case 'account.email_remove':
    case 'mfa.email_disable':
    case 'mfa.totp_disable':
    case 'mfa.passkey_remove':
      return { variant: 'destructive' }
    // Warning/amber: deactivate
    case 'admin.box_deactivate':
      return {
        variant: 'secondary',
        className:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
      }
    // Info/blue: updates
    case 'vault.update':
    case 'vault_item.update':
    case 'auth.login':
    case 'auth.password_change':
    case 'box.update':
    case 'account.notifications_toggle':
    case 'mfa.recovery_codes_regenerate':
      return {
        variant: 'outline',
        className:
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400',
      }
    default:
      return { variant: 'secondary' }
  }
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-44" />
      <div className="rounded-lg border">
        <div className="divide-y divide-hairline">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-5 w-24 rounded-full" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const fetchAuditLog = useCallback(
    async (action: string, p: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(false)
      try {
        const params = new URLSearchParams()
        if (action) params.set('action', action)
        params.set('page', String(p))
        params.set('limit', '50')

        const res = await fetch(`/api/admin/audit-log?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = (await res.json()) as {
          success: boolean
          data?: AuditLogResponse
          error?: string
        }

        if (!controller.signal.aborted) {
          if (data.success && data.data) {
            setEntries(data.data.entries)
            setTotalPages(data.data.totalPages)
            setPage(data.data.page)
          } else {
            setError(true)
          }
        }
      } catch (err) {
        if (!controller.signal.aborted && (err as Error).name !== 'AbortError') {
          setError(true)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAuditLog(actionFilter, page)
  }, [actionFilter, page, fetchAuditLog])

  function handlePageChange(newPage: number) {
    setPage(newPage)
  }

  // Error state (only when no data to show)
  if (error && entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-12">
        <X className="mb-2 h-6 w-6 text-destructive" />
        <p className="text-sm font-medium text-destructive">Failed to load audit log</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => fetchAuditLog(actionFilter, page)}
        >
          Retry
        </Button>
      </div>
    )
  }

  // Loading skeleton on first load
  if (loading && entries.length === 0) {
    return <TableSkeleton />
  }

  return (
    <div className="space-y-4">
      {/* Action filter dropdown */}
      <Select
        value={actionFilter || 'all'}
        onValueChange={(v) => {
          const value = v ?? ''
          setActionFilter(value === 'all' ? '' : value)
          setPage(1)
        }}
      >
        <SelectTrigger className="w-44" aria-label="Filter by action">
          <SelectValue placeholder="All actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All actions</SelectItem>
          <SelectItem value="admin.promote">Promoted user</SelectItem>
          <SelectItem value="admin.demote">Demoted user</SelectItem>
          <SelectItem value="admin.force_logout">Force logged out user</SelectItem>
          <SelectItem value="admin.suspend">Suspended user</SelectItem>
          <SelectItem value="admin.unsuspend">Unsuspended user</SelectItem>
          <SelectItem value="admin.box_deactivate">Deactivated box</SelectItem>
          <SelectItem value="admin.box_activate">Activated box</SelectItem>
          <SelectItem value="admin.box_delete">Deleted box</SelectItem>
          <SelectItem value="vault.create">Created vault</SelectItem>
          <SelectItem value="vault.update">Updated vault</SelectItem>
          <SelectItem value="vault.delete">Deleted vault</SelectItem>
          <SelectItem value="vault_item.create">Created vault item</SelectItem>
          <SelectItem value="vault_item.update">Updated vault item</SelectItem>
          <SelectItem value="vault_item.delete">Deleted vault item</SelectItem>
          <SelectItem value="auth.signup">Account created</SelectItem>
          <SelectItem value="auth.login">Logged in</SelectItem>
          <SelectItem value="auth.logout">Logged out</SelectItem>
          <SelectItem value="auth.password_change">Changed password</SelectItem>
          <SelectItem value="box.create">Created box</SelectItem>
          <SelectItem value="box.update">Updated box</SelectItem>
          <SelectItem value="box.delete">Deleted box</SelectItem>
          <SelectItem value="account.email_set">Set email</SelectItem>
          <SelectItem value="account.email_remove">Removed email</SelectItem>
          <SelectItem value="account.notifications_toggle">Toggled notifications</SelectItem>
          <SelectItem value="mfa.email_enable">Enabled email 2FA</SelectItem>
          <SelectItem value="mfa.email_disable">Disabled email 2FA</SelectItem>
          <SelectItem value="mfa.totp_confirm">Enabled TOTP 2FA</SelectItem>
          <SelectItem value="mfa.totp_disable">Disabled TOTP 2FA</SelectItem>
          <SelectItem value="mfa.passkey_register">Registered passkey</SelectItem>
          <SelectItem value="mfa.passkey_remove">Removed passkey</SelectItem>
          <SelectItem value="mfa.recovery_codes_regenerate">Regenerated recovery codes</SelectItem>
        </SelectContent>
      </Select>

      {/* Empty state */}
      {entries.length === 0 ? (
        <div className="rounded-lg border px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No audit log entries yet.</p>
        </div>
      ) : (
        <>
          {/* Audit log table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const badge = getActionBadge(entry.action)
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-medium">{entry.actorUsername}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className={badge.className}>
                          {ACTION_LABELS[entry.action] || entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.targetLabel || entry.targetId}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          entry.targetType === 'user' ? 'secondary' :
                          entry.targetType === 'box' ? 'outline' :
                          entry.targetType === 'vault' ? 'default' :
                          'secondary'
                        }>
                          {entry.targetType === 'user'
                            ? 'User'
                            : entry.targetType === 'box'
                            ? 'Box'
                            : entry.targetType === 'vault'
                            ? 'Vault'
                            : entry.targetType === 'vault_item'
                            ? 'Vault Item'
                            : entry.targetType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.ip || '\u2014'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => handlePageChange(page - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages || loading}
                  onClick={() => handlePageChange(page + 1)}
                  aria-label="Next page"
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
