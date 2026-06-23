import type { Metadata } from 'next'
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google'
import { readFileSync } from 'fs'
import { join } from 'path'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

function getVersion(): { sha: string; date: string } {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), 'version.json'), 'utf-8'))
  } catch {
    return { sha: 'unknown', date: '' }
  }
}

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

const plausibleScriptSrc = process.env.PLAUSIBLE_SCRIPT_SRC

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const version = getVersion()

  return (
    <html lang="en" className={`${fontSans.variable} ${fontSerif.variable} ${fontMono.variable}`}>
      {plausibleScriptSrc && (
        <head>
          {/* Privacy-friendly analytics by Plausible */}
          <script async src={plausibleScriptSrc}></script>
          <script
            dangerouslySetInnerHTML={{
              __html:
                'window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};plausible.init()',
            }}
          ></script>
        </head>
      )}
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
              {version.sha !== 'unknown' && (
                <>
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
                </>
              )}
              {version.date ? (
                <>
                  Last deploy:{' '}
                  {new Date(version.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short',
                  })}
                </>
              ) : (
                'Deploy info unavailable'
              )}
            </p>
          </footer>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
