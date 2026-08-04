import Link from "next/link"
import { Compass } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Compass className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">Page not found</h1>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">
          We couldn&apos;t find the page you were looking for. Let&apos;s get you back to
          shopping.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to home
      </Link>
    </div>
  )
}
