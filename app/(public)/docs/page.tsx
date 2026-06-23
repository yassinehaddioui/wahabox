import Link from 'next/link'
import { Terminal, Rocket, BookOpen, ArrowRight } from 'lucide-react'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

const steps = [
  {
    icon: <Terminal className="size-5" />,
    title: 'Clone the repository',
    code: 'git clone https://github.com/yassinehaddioui/wahabox.git',
    description: 'Get the source code from GitHub.',
  },
  {
    icon: <Terminal className="size-5" />,
    title: 'Navigate to the project',
    code: 'cd wahabox',
    description: 'Enter the project directory.',
  },
  {
    icon: <Rocket className="size-5" />,
    title: 'Run setup',
    code: './setup.sh',
    description:
      'Generates secrets, starts the production Docker stack (PostgreSQL 17, Redis 7, Next.js), and runs database migrations.',
  },
]

const devSteps = [
  {
    code: 'git clone https://github.com/yassinehaddioui/wahabox.git',
    label: 'Clone',
  },
  {
    code: 'cd wahabox && cp .env.example .env',
    label: 'Configure',
  },
  {
    code: './dev.sh up',
    label: 'Launch',
  },
]

export default function DocsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Getting Started</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Self-host Wahabox in minutes with Docker. Run your own end-to-end encrypted virtual PO box.
        </p>
        <div className="mt-4">
          <a
            href="https://github.com/yassinehaddioui/wahabox"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <GitHubIcon className="size-4" />
            github.com/yassinehaddioui/wahabox
          </a>
        </div>
      </div>

      {/* Prerequisites */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BookOpen className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">Prerequisites</h2>
        </div>
        <ul className="mt-4 ml-12 list-disc space-y-2 text-muted-foreground">
          <li>
            <strong>Docker</strong> and <strong>Docker Compose</strong> — for running the application
            stack
          </li>
          <li>
            <strong>pnpm</strong> (v9+) — package manager for Node.js dependencies
          </li>
        </ul>
      </section>

      {/* Production Setup */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Rocket className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">Self-Hosting (Production)</h2>
        </div>
        <p className="mt-4 ml-12 text-muted-foreground">
          One command to get a production-ready instance running on your server.
        </p>

        <div className="mt-6 space-y-8">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium text-muted-foreground">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{step.icon}</span>
                  <h3 className="font-medium">{step.title}</h3>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                <div className="mt-2 overflow-x-auto rounded-lg border bg-muted/50 px-4 py-3">
                  <code className="text-sm font-mono">{step.code}</code>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 ml-12 rounded-lg border bg-card px-5 py-4">
          <p className="text-sm">
            <span className="font-medium">That&apos;s it.</span>{' '}
            <span className="text-muted-foreground">
              The app is available at{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                http://localhost:3000
              </code>
              .
            </span>
          </p>
        </div>
      </section>

      {/* Development Setup */}
      <section className="mt-16">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Terminal className="size-5" />
          </div>
          <h2 className="text-xl font-semibold">Development</h2>
        </div>
        <p className="mt-4 ml-12 text-muted-foreground">
          Local development with hot reload, debug tooling, and auto-TLS via Caddy.
        </p>

        <div className="mt-6 ml-12 space-y-4">
          {devSteps.map((step, i) => (
            <div key={i} className="flex items-start gap-4">
              <div className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium text-muted-foreground">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {step.label}
                </p>
                <div className="overflow-x-auto rounded-lg border bg-muted/50 px-4 py-3">
                  <code className="text-sm font-mono">{step.code}</code>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 ml-12 rounded-lg border bg-card px-5 py-4">
          <p className="text-sm">
            <span className="font-medium">Dev URL:</span>{' '}
            <span className="text-muted-foreground">
              Available at{' '}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                https://wahabox.localhost
              </code>
              {' '}with Caddy handling auto-TLS.
            </span>
          </p>
        </div>
      </section>

      {/* Further Reading */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold">Further Reading</h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {[
            {
              title: 'Project Overview',
              href: 'https://github.com/yassinehaddioui/wahabox/blob/main/docs/project-overview.md',
              desc: 'Architecture, data model, and security invariants.',
            },
            {
              title: 'Deployment Guide',
              href: 'https://github.com/yassinehaddioui/wahabox/blob/main/DEPLOYMENT.md',
              desc: 'Production deployment with nginx and Cloudflare.',
            },
            {
              title: 'Contributing',
              href: 'https://github.com/yassinehaddioui/wahabox/blob/main/CONTRIBUTING.md',
              desc: 'Development workflow, testing, and code of conduct.',
            },
            {
              title: 'Security Policy',
              href: 'https://github.com/yassinehaddioui/wahabox/blob/main/SECURITY.md',
              desc: 'Responsible disclosure and security practices.',
            },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-lg border p-4 transition-colors hover:border-primary/40"
            >
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
                <ArrowRight className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium group-hover:text-primary transition-colors">
                  {link.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{link.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <div className="mt-16 rounded-xl border bg-card p-8 text-center">
        <h2 className="text-lg font-semibold">Ready to deploy?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Wahabox is MIT-licensed and open source. Star the repo, open an issue, or submit a PR.
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <a
            href="https://github.com/yassinehaddioui/wahabox"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <GitHubIcon className="size-4" />
            View on GitHub
          </a>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center rounded-lg border bg-background px-6 text-sm font-medium hover:bg-accent transition-colors"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  )
}
