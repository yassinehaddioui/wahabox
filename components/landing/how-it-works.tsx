import { KeyRound, Link2, LockKeyhole } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: KeyRound,
    title: 'Create Your PO Box',
    description:
      'Your keypair is generated right in your browser. The server never sees your private key — it stays with you, always.',
  },
  {
    number: '02',
    icon: Link2,
    title: 'Share Your Link',
    description:
      'Anyone with your secret link can submit an encrypted message. No account, no app, no friction for senders.',
  },
  {
    number: '03',
    icon: LockKeyhole,
    title: 'Decrypt & Manage',
    description:
      'Only you hold the key to decrypt. Read, organize, and set expiry rules from your dashboard — all zero-knowledge.',
  },
]

export default function HowItWorks() {
  return (
    <section className="mt-24">
      <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">How It Works</h2>
      <p className="mt-3 text-center text-muted-foreground">
        Three steps to private, encrypted messaging — no technical knowledge required.
      </p>

      <div className="mt-12 grid gap-8 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={step.number} className="relative flex flex-col items-center text-center">
            {/* Connector line between steps (hidden on mobile, last item) */}
            {i < steps.length - 1 && (
              <div className="absolute left-[calc(50%+4rem)] top-12 hidden h-0.5 w-[calc(100%-8rem)] bg-border sm:block" />
            )}
            {/* Step number badge */}
            <div className="relative z-10 flex size-12 items-center justify-center rounded-full bg-primary/10 text-sm font-bold tabular-nums text-primary ring-4 ring-background">
              {step.number}
            </div>
            {/* Icon */}
            <div className="mt-5 flex size-10 items-center justify-center rounded-lg bg-muted">
              <step.icon className="size-5 text-primary" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
