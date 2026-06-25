'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/boxes', label: 'Boxes' },
  { href: '/admin/audit-log', label: 'Audit Log' },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <nav className="flex gap-1 border-b pb-0 mb-6">
      {tabs.map((tab) => {
        const isActive = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-[1px] transition-colors',
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
