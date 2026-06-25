'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
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
import { Search, ChevronLeft, ChevronRight, Smartphone, Key, Mail, X } from 'lucide-react'

type User = {
  id: string
  username: string
  role: string
  hasEmail: boolean
  emailVerified: boolean
  mfaEmail: boolean
  mfaTotp: boolean
  mfaPasskey: boolean
  boxCount: number
  createdAt: string
}

type UsersResponse = {
  users: User[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function MfaIcons({ user }: { user: User }) {
  const hasMfa = user.mfaTotp || user.mfaPasskey || user.mfaEmail
  if (!hasMfa) return <span className="text-xs text-muted-foreground">&mdash;</span>
  return (
    <div className="flex items-center gap-1.5">
      {user.mfaTotp && (
        <Smartphone className="h-3.5 w-3.5 text-muted-foreground" aria-label="TOTP enabled" />
      )}
      {user.mfaPasskey && (
        <Key className="h-3.5 w-3.5 text-muted-foreground" aria-label="Passkey enabled" />
      )}
      {user.mfaEmail && (
        <Mail className="h-3.5 w-3.5 text-muted-foreground" aria-label="Email MFA enabled" />
      )}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="rounded-lg border">
        <div className="divide-y divide-hairline">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-10" />
              <Skeleton className="ml-auto h-4 w-8" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const fetchUsers = useCallback(async (q: string, role: string, p: number) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(false)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (role) params.set('role', role)
      params.set('page', String(p))
      params.set('limit', '20')

      const res = await fetch(`/api/admin/users?${params.toString()}`, {
        signal: controller.signal,
      })
      const data = (await res.json()) as { success: boolean; data?: UsersResponse; error?: string }

      if (!controller.signal.aborted) {
        if (data.success && data.data) {
          setUsers(data.data.users)
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
  }, [])

  // Debounced fetch on search/role filter change — resets to page 1
  useEffect(() => {
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setPage(1)
      fetchUsers(searchQuery, roleFilter, 1)
    }, 300)
    return () => clearTimeout(debounceTimer.current)
  }, [searchQuery, roleFilter, fetchUsers])

  // Direct page navigation (user clicks Previous/Next)
  function handlePageChange(newPage: number) {
    clearTimeout(debounceTimer.current)
    setPage(newPage)
    fetchUsers(searchQuery, roleFilter, newPage)
  }

  // Error state (only when no data to show)
  if (error && users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-12">
        <X className="mb-2 h-6 w-6 text-destructive" />
        <p className="text-sm font-medium text-destructive">Failed to load users</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => fetchUsers(searchQuery, roleFilter, page)}
        >
          Retry
        </Button>
      </div>
    )
  }

  // Loading skeleton on first load
  if (loading && users.length === 0) {
    return <TableSkeleton />
  }

  return (
    <div className="space-y-4">
      {/* Header: search input + role filter */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            aria-label="Search by username"
          />
        </div>
        <Select
          value={roleFilter || 'all'}
          onValueChange={(v) => {
            const value = v ?? ''
            setRoleFilter(value === 'all' ? '' : value)
          }}
        >
          <SelectTrigger className="w-32" aria-label="Filter by role">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty state */}
      {users.length === 0 ? (
        <div className="rounded-lg border px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">No users found matching your search.</p>
        </div>
      ) : (
        <>
          {/* Users table */}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead className="text-right">Boxes</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="font-medium hover:underline"
                      >
                        {user.username}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role === 'admin' ? 'Admin' : 'User'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.hasEmail ? (
                        user.emailVerified ? (
                          <Badge
                            variant="secondary"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                          >
                            Verified
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                          >
                            Not verified
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">&mdash;</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <MfaIcons user={user} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{user.boxCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
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
