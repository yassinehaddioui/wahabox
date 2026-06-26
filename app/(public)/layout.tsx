import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center justify-between border-b border-hairline px-4 sm:px-6 overflow-hidden">
        <Link href="/" className="flex items-center text-base font-semibold tracking-tigh gap-2">
          <Image
            src="/WahaBox-Logo.svg"
            alt="Wahabox"
            width={0}
            height={0}
            className="h-12 w-auto"
          />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <a
            href="https://github.com/yassinehaddioui/wahabox"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
            aria-label="View source on GitHub"
          >
            <GitHubIcon className="size-5" />
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex"
            render={<Link href="/docs" className="text-muted-foreground" />}
          >
            Docs
          </Button>
          <Link
            href="https://box.wahalabs.com/drop/FiigUseCaEp-wytxiGtz6g"
            className="hidden md:inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-transparent bg-clip-padding px-3 text-sm text-muted-foreground font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground active:translate-y-px"
          >
            Feedback
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="font-semibold"
            render={<Link href="/login" className="text-muted-foreground" />}
          >
            Sign In
          </Button>
          <Button size="sm" className="font-medium" render={<Link href="/signup" />}>
            Get Started
          </Button>
        </nav>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-16 pb-12">{children}</main>
    </div>
  )
}
