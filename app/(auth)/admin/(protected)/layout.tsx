import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { validateSession } from '@/lib/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie?.value) redirect('/login')

  const session = await validateSession(sessionCookie.value)
  if (!session) redirect('/login')

  if (session.role !== 'admin') redirect('/admin-promote')

  return <>{children}</>
}
