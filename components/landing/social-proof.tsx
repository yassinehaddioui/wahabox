import { Code2, Scale, Server, Star, ShieldCheck } from 'lucide-react'

const badges = [
  { icon: Code2, label: 'Open Source' },
  { icon: Scale, label: 'MIT Licensed' },
  { icon: Server, label: 'Self-Hostable' },
  { icon: Star, label: 'GitHub Stars' },
  { icon: ShieldCheck, label: 'X25519 Encrypted' },
]

export default function SocialProof() {
  return (
    <section className="mt-24">
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-xl border bg-card px-6 py-5 sm:gap-x-8">
        {badges.map(({ icon: Icon, label }) => (
          <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className="size-4 shrink-0 text-primary/70" strokeWidth={1.5} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
