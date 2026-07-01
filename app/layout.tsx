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
  metadataBase: new URL('https://wahabox.org'),
  title: {
    default: 'Wahabox — Encrypted Virtual PO Box | Anonymous Secure Messaging',
    template: '%s | Wahabox',
  },
  description:
    'Receive anonymous, end-to-end encrypted messages with zero-knowledge architecture. Create PO boxes, share secret links, and decrypt messages — your private key never leaves your browser.',
  keywords: [
    'encrypted messaging',
    'anonymous messages',
    'PO box',
    'end-to-end encryption',
    'zero-knowledge',
    'X25519',
    'secure messaging',
    'privacy',
    'WebAuthn',
    'passkeys',
  ],
  authors: [{ name: 'Wahalabs LLC', url: 'https://wahalabs.com' }],
  generator: 'Next.js',
  applicationName: 'Wahabox',
  referrer: 'origin-when-cross-origin',
  creator: 'Wahalabs LLC',
  publisher: 'Wahalabs LLC',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://wahabox.org',
    siteName: 'Wahabox',
    title: 'Wahabox — Encrypted Virtual PO Box | Anonymous Secure Messaging',
    description:
      'Receive anonymous, end-to-end encrypted messages with zero-knowledge architecture. Create PO boxes, share secret links, and decrypt messages — your private key never leaves your browser.',
    images: [
      {
        url: '/og-image',
        width: 1200,
        height: 630,
        alt: 'Wahabox — Encrypted Virtual PO Box',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Wahabox — Encrypted Virtual PO Box | Anonymous Secure Messaging',
    description:
      'Receive anonymous, end-to-end encrypted messages with zero-knowledge architecture. Your private key never leaves your browser.',
    images: ['/og-image'],
    creator: '@wahalabs',
  },
  alternates: {
    canonical: 'https://wahabox.org',
  },
  icons: {
    icon: [
      { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
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
