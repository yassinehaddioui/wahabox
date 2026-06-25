'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Users, Package, Mail, Shield, Activity, Server, Database, Gauge, Key, Check, X } from 'lucide-react'

type Stats = {
  totalUsers: number
  totalBoxes: number
  totalMessages: number
  adminCount: number
  newUsers7d: number
  newBoxes7d: number
  newMessages7d: number
  newUsers30d: number
  newBoxes30d: number
  newMessages30d: number
  activeBoxes: number
  inactiveBoxes: number
}

type Health = {
  appVersion: string
  nodeEnv: string
  dbConnected: boolean
  redisConnected: boolean
  emailConfigured: boolean
  turnstileConfigured: boolean
  adminPromoteConfigured: boolean
}

type RateLimits = {
  redisConnected: boolean
  ipRateLimitKeys: number
  userRateLimitKeys: number
  globalRateLimitKey: number
  authFailureKeys: number
  dropCountKeys: number
}

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string }

function StatSkeleton() {
  return (
    <Card>
      <CardContent className="py-5">
        <Skeleton className="mb-2 h-4 w-20" />
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  )
}

function HealthSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityCard({ title, users, boxes, messages }: { title: string; users: number; boxes: number; messages: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            Users
          </span>
          <span className="tabular-nums font-semibold">{users}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            Boxes
          </span>
          <span className="tabular-nums font-semibold">{boxes}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            Messages
          </span>
          <span className="tabular-nums font-semibold">{messages}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ ok, labelTrue, labelFalse }: { ok: boolean; labelTrue?: string; labelFalse?: string }) {
  const isPositive = ok
  const text = ok ? (labelTrue ?? 'Connected') : (labelFalse ?? 'Disconnected')
  return (
    <div className="flex items-center gap-2">
      {isPositive ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <X className="h-3.5 w-3.5 text-destructive" />
      )}
      <Badge variant={isPositive ? 'default' : 'destructive'}>{text}</Badge>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [rateLimits, setRateLimits] = useState<RateLimits | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/admin/stats').then(
        (r) => (r.ok ? (r.json() as Promise<ApiResponse<Stats>>) : Promise.reject(new Error('stats fetch failed'))),
      ),
      fetch('/api/admin/health').then(
        (r) => (r.ok ? (r.json() as Promise<ApiResponse<Health>>) : Promise.reject(new Error('health fetch failed'))),
      ),
      fetch('/api/admin/rate-limits').then(
        (r) => (r.ok ? (r.json() as Promise<ApiResponse<RateLimits>>) : Promise.reject(new Error('rate-limits fetch failed'))),
      ),
    ]).then((results) => {
      const [s, h, r] = results
      if (s.status === 'fulfilled' && s.value.success) setStats(s.value.data)
      if (h.status === 'fulfilled' && h.value.success) setHealth(h.value.data)
      if (r.status === 'fulfilled' && r.value.success) setRateLimits(r.value.data)
      if (results.every((x) => x.status === 'rejected')) setError(true)
    })
  }, [])

  const loading = stats === null && health === null && rateLimits === null && !error

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Failed to load dashboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            All three data sources are unreachable. Please check the server status and try again.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats Row */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Gauge className="h-4 w-4" />
          Overview
        </h2>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
            <StatSkeleton />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={Users} label="Total Users" value={stats.totalUsers} />
            <StatCard icon={Package} label="Total Boxes" value={stats.totalBoxes} />
            <StatCard icon={Mail} label="Total Messages" value={stats.totalMessages} />
            <StatCard icon={Shield} label="Admins" value={stats.adminCount} />
          </div>
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Stats unavailable
            </CardContent>
          </Card>
        )}
      </section>

      {/* Activity Row */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Activity className="h-4 w-4" />
          Activity
        </h2>
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></CardContent></Card>
            <Card><CardHeader><Skeleton className="h-4 w-24" /></CardHeader><CardContent className="space-y-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></CardContent></Card>
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ActivityCard
              title="New This Week"
              users={stats.newUsers7d}
              boxes={stats.newBoxes7d}
              messages={stats.newMessages7d}
            />
            <ActivityCard
              title="New This Month"
              users={stats.newUsers30d}
              boxes={stats.newBoxes30d}
              messages={stats.newMessages30d}
            />
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Box Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Active
                  </span>
                  <span className="tabular-nums font-semibold">{stats.activeBoxes}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
                    Inactive
                  </span>
                  <span className="tabular-nums font-semibold">{stats.inactiveBoxes}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Activity data unavailable
            </CardContent>
          </Card>
        )}
      </section>

      {/* Server Health */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Server className="h-4 w-4" />
          Server Health
        </h2>
        {loading ? (
          <HealthSkeleton />
        ) : health ? (
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Database
                </span>
                <StatusBadge ok={health.dbConnected} labelFalse="Disconnected" />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Redis
                </span>
                <StatusBadge ok={health.redisConnected} labelFalse="Disconnected" />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Server className="h-4 w-4 text-muted-foreground" />
                  App Version
                </span>
                <Badge variant="secondary">{health.appVersion}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </span>
                <StatusBadge
                  ok={health.emailConfigured}
                  labelTrue="Configured"
                  labelFalse="Not configured"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Turnstile
                </span>
                <StatusBadge
                  ok={health.turnstileConfigured}
                  labelTrue="Configured"
                  labelFalse="Not configured"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  Admin Promote
                </span>
                <StatusBadge
                  ok={health.adminPromoteConfigured}
                  labelTrue="Configured"
                  labelFalse="Not configured"
                />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Health data unavailable
            </CardContent>
          </Card>
        )}
      </section>

      {/* Rate Limits */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          <Key className="h-4 w-4" />
          Rate Limits
        </h2>
        {loading ? (
          <Card>
            <CardContent className="space-y-3 py-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : rateLimits ? (
          <Card>
            <CardContent className="space-y-4 py-5">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  Redis Status
                </span>
                <StatusBadge ok={rateLimits.redisConnected} labelFalse="Disconnected" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">IP Rate Limit Keys</span>
                <Badge variant="secondary">{rateLimits.ipRateLimitKeys}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">User Rate Limit Keys</span>
                <Badge variant="secondary">{rateLimits.userRateLimitKeys}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Global Rate Limit</span>
                <Badge variant="secondary">{rateLimits.globalRateLimitKey}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Auth Failures</span>
                <Badge variant="secondary">{rateLimits.authFailureKeys}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Drop Count Keys</span>
                <Badge variant="secondary">{rateLimits.dropCountKeys}</Badge>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Rate limit data unavailable
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  )
}
