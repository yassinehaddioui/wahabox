import Link from "next/link";

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl text-center">
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
    </div>
  );
}
