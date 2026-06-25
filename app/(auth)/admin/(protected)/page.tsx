import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateSession } from '@/lib/session'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldCheck } from 'lucide-react'

export default async function AdminPage() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie?.value) redirect('/login')

  const session = await validateSession(sessionCookie.value)
  if (!session) redirect('/login')

  return (
    <div className="w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Administrative dashboard for Wahabox.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <CardTitle className="text-base">Admin Status</CardTitle>
          </div>
          <CardDescription>
            You are logged in as an administrator.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border bg-canvas-soft px-4 py-3">
            <span className="text-muted-foreground">Username</span>
            <span className="font-medium">{session.username}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-canvas-soft px-4 py-3">
            <span className="text-muted-foreground">Role</span>
            <span className="font-medium text-emerald-600 dark:text-emerald-400">Admin</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coming Soon</CardTitle>
          <CardDescription>
            Admin functionality will be expanded in future updates.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
