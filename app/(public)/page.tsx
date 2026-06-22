import Link from "next/link";

const features = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        <circle cx="12" cy="16" r="1" />
      </svg>
    ),
    title: "End-to-End Encryption",
    description:
      "Messages are sealed with X25519 public-key cryptography. The server never sees plaintext — only you hold the key to decrypt.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: "Zero-Knowledge Architecture",
    description:
      "Your private key is generated in your browser and never leaves it. The server stores only encrypted data it cannot read.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
    title: "Anonymous Submissions",
    description:
      "Create PO boxes with secret shareable links. Anyone with the link can send an encrypted message — no account required for senders.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
    ),
    title: "Passkeys & Two-Factor Auth",
    description:
      "Sign in with Touch ID, Face ID, or a YubiKey via WebAuthn. Add TOTP codes or recovery codes for an extra security layer.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
    title: "Smart Box Management",
    description:
      "Set expiration dates, message caps, and optional passwords per box. Monitor from a dashboard with auto-decrypt and read/unread tracking.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    ),
    title: "Privacy by Design",
    description:
      "No analytics, no tracking, no third-party scripts. We can't read your messages because we don't have the keys.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto w-full max-w-4xl text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Encrypted Virtual PO Box
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Receive anonymous, encrypted messages. Your private key never leaves your browser.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <Link
          href="/signup"
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Create Account
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-lg border bg-background px-8 text-sm font-medium hover:bg-accent transition-colors"
        >
          Sign In
        </Link>
      </div>

      <section className="mt-24">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Why Wahabox?
        </h2>
        <p className="mt-3 text-muted-foreground">
          Built so that nobody — not even us — can read your messages.
        </p>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col items-start rounded-xl border bg-card px-6 py-6 text-left transition-colors hover:border-primary/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
