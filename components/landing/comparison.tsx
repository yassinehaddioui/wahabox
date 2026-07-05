import { Check, Minus } from 'lucide-react'

const rows = [
  { feature: 'End-to-end encrypted', values: [true, false, true, false] },
  { feature: 'No account for senders', values: [true, false, false, false] },
  { feature: 'Zero-knowledge server', values: [true, false, false, false] },
  { feature: 'Expiry & auto-destruct', values: [true, false, true, false] },
  { feature: 'Self-hostable', values: [true, false, false, false] },
  { feature: 'Anonymous submissions', values: [true, false, false, false] },
]

const columns = ['Wahabox', 'Email', 'Messaging Apps', 'Google Forms']

function Cell({ value }: { value: boolean }) {
  if (value) {
    return <Check className="size-4 text-emerald-600" strokeWidth={2.5} />
  }
  return <Minus className="size-4 text-muted-foreground/40" strokeWidth={2} />
}

export default function Comparison() {
  return (
    <section className="mt-24">
      <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">Why Not Just Use…?</h2>
      <p className="mt-3 text-center text-muted-foreground">
        Wahabox combines security, anonymity, and simplicity in ways other tools can&apos;t.
      </p>

      <div className="mt-10 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-5 py-3 font-medium text-muted-foreground">Feature</th>
              {columns.map((col) => (
                <th key={col} className="px-5 py-3 font-semibold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.feature} className={i < rows.length - 1 ? 'border-b' : ''}>
                <td className="px-5 py-3 text-muted-foreground">{row.feature}</td>
                {row.values.map((val, j) => (
                  <td key={j} className="px-5 py-3">
                    <Cell value={val} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
