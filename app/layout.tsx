import type { Metadata } from 'next'
import { Inter, Source_Serif_4, JetBrains_Mono } from 'next/font/google'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
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
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  )
}
