"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle } from "lucide-react"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6 text-center text-foreground">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <AlertTriangle className="size-7" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-balance">Something went wrong</h1>
        <p className="max-w-md text-sm text-muted-foreground text-pretty">
          We hit an unexpected snag. You can try again, or head back to start a fresh
          conversation.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-lg border border-border px-5 text-sm font-medium transition-colors hover:bg-muted"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}
