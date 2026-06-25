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
  'admin.box_deactivate': 'Deactivated box',
  'admin.box_activate': 'Activated box',
  'admin.box_delete': 'Deleted box',
}

function getActionBadge(
  action: string,
): { variant: 'default' | 'destructive' | 'secondary'; className?: string } {
  switch (action) {
    case 'admin.promote':
    case 'admin.box_activate':
      return { variant: 'default' }
    case 'admin.demote':
    case 'admin.box_delete':
      return { variant: 'destructive' }
    case 'admin.force_logout':
      return { variant: 'secondary' }
    case 'admin.box_deactivate':
      return {
        variant: 'secondary',
        className:
          'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400',
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
          <SelectItem value="admin.box_deactivate">Deactivated box</SelectItem>
          <SelectItem value="admin.box_activate">Activated box</SelectItem>
          <SelectItem value="admin.box_delete">Deleted box</SelectItem>
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
                        <Badge variant={entry.targetType === 'user' ? 'secondary' : 'outline'}>
                          {entry.targetType === 'user' ? 'User' : 'Box'}
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
