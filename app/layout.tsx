import type { Metadata } from 'next'
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import version from '@/version.json'
import './globals.css'

const fontSans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

const fontSerif = Source_Serif_4({
  variable: '--font-serif',
  subsets: ['latin'],
})

const fontMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Wahabox',
  description: 'Encrypted virtual PO box messaging',
  icons: {
    icon: [
      { url: '/WahaBox-Logo-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/WahaBox-Logo.svg', type: 'image/svg+xml' },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}>
      <body>
        <TooltipProvider>
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
          <footer className="border-t border-hairline py-4 text-center">
            <p className="text-xs text-muted-foreground/50 font-mono">
              Copyright &copy;{' '}
              <a
                href="https://wahalabs.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-muted-foreground transition-colors"
              >
                Wahalabs LLC
              </a>{' '}
              &mdash; {new Date().getFullYear()}&nbsp;&middot;&nbsp;
              Deployed SHA:{' '}
              <a
                href={`https://github.com/yassinehaddioui/wahabox/commit/${version.sha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-muted-foreground transition-colors"
              >
                {version.sha}
              </a>
              &nbsp;&middot;&nbsp;
              Last deploy:{' '}
              {new Date(version.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short',
              })}
            </p>
          </footer>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
