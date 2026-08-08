'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { ChevronLeft, ChevronRight, Mail, X } from 'lucide-react'

type Stats = {
  totalSecureMessages: number
  readSecureMessages: number
  secureReadRate: number
  totalMessages: number
  topSecureSenders: { userId: string; username: string; count: number }[]
  topDropBoxes: { boxId: string; label: string; count: number }[]
}

type MessageEntry = {
  id: string
  type: 'secure' | 'box'
  senderUsername: string | null
  targetLabel: string | null
  status: 'pending' | 'read' | 'destroyed'
  createdAt: string
  readAt: string | null
}

type MessagesResponse = {
  entries: MessageEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string }

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-44" />
      </div>
      <div className="rounded-lg border">
        <div className="divide-y divide-hairline">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-36" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </CardContent>
    </Card>
  )
}

export default function AdminMessagesPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [entries, setEntries] = useState<MessageEntry[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [statsFailed, setStatsFailed] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const fetchMessages = useCallback(
    async (type: string, status: string, p: number) => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setError(false)

      try {
        const params = new URLSearchParams()
        if (type) params.set('type', type)
        if (status) params.set('status', status)
        params.set('page', String(p))
        params.set('limit', '50')

        const res = await fetch(`/api/admin/messages?${params.toString()}`, {
          signal: controller.signal,
        })
        const data = (await res.json()) as ApiResponse<MessagesResponse>

        if (!controller.signal.aborted) {
          if (data.success && data.data) {
            setEntries(data.data.entries)
            setTotalPages(data.data.totalPages)
            setPage(data.data.page)
          } else {
            setError(true)
          }
        }
      } catch {
        if (!controller.signal.aborted) {
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
    /* eslint-disable react-hooks/set-state-in-effect */
    Promise.allSettled([
      fetch('/api/admin/stats').then(
        (r) => (r.ok ? (r.json() as Promise<ApiResponse<Stats>>) : Promise.reject(new Error('stats fetch failed'))),
      ).then((result) => {
        if (result.success) setStats(result.data)
      }).catch(() => {
        setStatsFailed(true)
      }),
      fetchMessages(typeFilter, statusFilter, page),
    ])
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleTypeChange(value: string | null) {
    const v = (value ?? '') === 'all' ? '' : (value ?? '')
    setTypeFilter(v)
    setPage(1)
    fetchMessages(v, statusFilter, 1)
  }

  function handleStatusChange(value: string | null) {
    const v = (value ?? '') === 'all' ? '' : (value ?? '')
    setStatusFilter(v)
    setPage(1)
    fetchMessages(typeFilter, v, 1)
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    fetchMessages(typeFilter, statusFilter, newPage)
  }

  // Error state (only when no data to show)
  if (error && entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-12">
        <X className="mb-2 h-6 w-6 text-destructive" />
        <p className="text-sm font-medium text-destructive">Failed to load messages</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => fetchMessages(typeFilter, statusFilter, page)}
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

  const dropMessageTotal = stats?.totalMessages ?? 0

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Mail className="h-4 w-4" />
          Overview
        </h2>
        {loading && !stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Secure Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm tabular-nums">Total {stats.totalSecureMessages}</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  Read {stats.readSecureMessages} ({stats.secureReadRate}%)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Drop Messages</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold tabular-nums">{dropMessageTotal}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Senders</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {stats.topSecureSenders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">(none)</p>
                ) : (
                  stats.topSecureSenders.map((s) => (
                    <div key={s.userId} className="flex items-center justify-between text-xs">
                      <span className="truncate">{s.username}</span>
                      <span className="tabular-nums text-muted-foreground">{s.count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Top Boxes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {stats.topDropBoxes.length === 0 ? (
                  <p className="text-xs text-muted-foreground">(none)</p>
                ) : (
                  stats.topDropBoxes.map((b) => (
                    <div key={b.boxId} className="flex items-center justify-between text-xs">
                      <span className="truncate">{b.label}</span>
                      <span className="tabular-nums text-muted-foreground">{b.count}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : statsFailed ? (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Stats unavailable
            </CardContent>
          </Card>
        ) : null}
      </section>

      {/* Filters */}
      <div className="flex gap-3">
        <Select
          value={typeFilter || 'all'}
          onValueChange={handleTypeChange}
        >
          <SelectTrigger className="w-36" aria-label="Filter by type">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="secure">Secure</SelectItem>
            <SelectItem value="box">PO Box</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || 'all'}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger className="w-44" aria-label="Filter by status">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="read">Read</SelectItem>
            <SelectItem value="destroyed">Destroyed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {entries.length === 0 ? (
        <div className="rounded-lg border px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        </div>
      ) : (
        <>
          {/* Messages table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sender</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Read At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={entry.type === 'secure' ? 'default' : 'secondary'}>
                        {entry.type === 'secure' ? 'Secure' : 'Drop'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.senderUsername ?? 'Anonymous'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.targetLabel ?? '\u2014'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          entry.status === 'pending'
                            ? 'secondary'
                            : entry.status === 'destroyed'
                              ? 'destructive'
                              : 'default'
                        }
                      >
                        {entry.status === 'pending'
                          ? 'Pending'
                          : entry.status === 'read'
                            ? 'Read'
                            : 'Destroyed'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {entry.readAt ? new Date(entry.readAt).toLocaleString() : '\u2014'}
                    </TableCell>
                  </TableRow>
                ))}
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
