import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string
  lastUpdated: string
  children: React.ReactNode
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to LivGPT
        </Link>

        <header className="mt-8 border-b border-border pb-6">
          <h1 className="text-3xl font-semibold text-balance">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </header>

        <div className="mt-8 flex flex-col gap-8 text-sm leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </main>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
      {children}
    </section>
  )
}
