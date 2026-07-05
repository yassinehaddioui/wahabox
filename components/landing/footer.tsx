import Link from 'next/link'
import Image from 'next/image'

const productLinks = [
  { label: 'Create Account', href: '/signup' },
  { label: 'Sign In', href: '/login' },
  { label: 'Docs', href: '/docs' },
]

const resourceLinks = [
  { label: 'GitHub', href: 'https://github.com/yassinehaddioui/wahabox' },
  { label: 'Feedback', href: 'https://box.wahalabs.com/drop/FiigUseCaEp-wytxiGtz6g' },
  { label: 'Changelog', href: 'https://github.com/yassinehaddioui/wahabox/blob/main/CHANGELOG.md' },
]

const legalLinks = [
  { label: 'Security', href: 'https://github.com/yassinehaddioui/wahabox/blob/main/SECURITY.md' },
  { label: 'License', href: 'https://github.com/yassinehaddioui/wahabox/blob/main/LICENSE' },
]

export default function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2">
              <Image
                src="/WahaBox-Logo.svg"
                alt="Wahabox"
                width={0}
                height={0}
                className="h-8 w-auto"
              />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Zero-knowledge encrypted messaging. Your private key never leaves your browser.
            </p>
            <p className="mt-4 text-xs text-muted-foreground/70">
              &copy; {new Date().getFullYear()} Wahalabs LLC
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="text-sm font-semibold">Product</h4>
            <ul className="mt-3 space-y-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-sm font-semibold">Resources</h4>
            <ul className="mt-3 space-y-2">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-sm font-semibold">Legal</h4>
            <ul className="mt-3 space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
