import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateSession } from '@/lib/session'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AdminPromoteForm } from '@/components/admin-promote-form'
import { ShieldBan } from 'lucide-react'

export default async function AdminPromotePage() {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie?.value) redirect('/login')

  const session = await validateSession(sessionCookie.value)
  if (!session) redirect('/login')

  // Already admin → go to admin panel
  if (session.role === 'admin') redirect('/admin')

  const isConfigured = !!process.env.ADMIN_PROMOTE_TOKEN

  return (
    <div className="mx-auto max-w-md w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Promotion</h1>
        <p className="text-sm text-muted-foreground">
          Gain administrative access to manage Wahabox.
        </p>
      </div>

      {!isConfigured ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldBan className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">Promotion Disabled</CardTitle>
            </div>
            <CardDescription>
              Admin promotion is not configured. The server administrator must set the
              ADMIN_PROMOTE_TOKEN environment variable to enable this feature.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <AdminPromoteForm />
      )}
    </div>
  )
}
