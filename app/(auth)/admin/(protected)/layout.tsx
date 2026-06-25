import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateSession } from '@/lib/session'
import { AdminNav } from '@/components/admin-nav'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie?.value) redirect('/login')

  const session = await validateSession(sessionCookie.value)
  if (!session) redirect('/login')

  if (session.role !== 'admin') redirect('/admin-promote')

  return (
    <div className="w-full space-y-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">Manage users, boxes, and monitor system health.</p>
      </div>
      <AdminNav />
      {children}
    </div>
  )
}
