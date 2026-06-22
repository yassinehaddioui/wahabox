import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-16 items-center justify-between border-b border-hairline px-6">
        <Link href="/" className="flex items-center text-base font-semibold tracking-tigh gap-2">
          <Image src="/WahaBox-Logo.svg" alt="Wahabox" width={0} height={0} className="h-12 w-auto" />
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Button variant="ghost" size="sm" render={<Link href="/login" className="text-muted-foreground" />}>
            Sign In
          </Button>
          <Button size="sm" className="font-medium" render={<Link href="/signup" />}>
            Get Started
          </Button>
        </nav>
      </header>
      <main className="flex flex-1 items-start justify-center px-6 pt-16 pb-12">
        {children}
      </main>
    </div>
  );
}
