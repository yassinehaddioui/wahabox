'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { useSession } from '@/lib/session-provider'

const navItems = [
  { href: '/dashboard', label: 'PO Boxes' },
]

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const session = useSession()

  async function handleLogout() {
    sessionStorage.clear()
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <Link href="/dashboard" className="px-4 py-2 text-lg font-bold tracking-tight">
          Wahabox
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {navItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton render={<Link href={item.href} />} isActive={pathname === item.href}>
                  {item.label}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground truncate">
            {session?.username ?? '...'}
          </span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
