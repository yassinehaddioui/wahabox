import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/app-sidebar'
import { SessionKeySync } from '@/components/session-key-sync'
import { SessionProvider } from '@/lib/session-provider'
import { getSession } from '@/lib/session'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('session')
  if (!sessionCookie?.value) redirect('/login')

  const sessionData = getSession(sessionCookie.value)
  if (!sessionData) redirect('/login')

  return (
    <SessionProvider value={{ username: sessionData.username }}>
      <SessionKeySync />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <main className="flex flex-1 flex-col p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </SessionProvider>
  )
}
