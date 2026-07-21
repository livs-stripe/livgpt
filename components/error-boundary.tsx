"use client"

import { Component, type ReactNode } from "react"

type Props = {
  children: ReactNode
  fallback?: ReactNode
}

type State = { hasError: boolean }

/**
 * Prevents a render error in a subtree (e.g. a malformed product card) from
 * unmounting the entire app. Without a boundary, an uncaught error during
 * render bubbles to the React root and blanks the whole page, which is what
 * made the chat "disappear" when a product result contained unexpected data.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error("ErrorBoundary caught an error:", error)
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Something went wrong displaying this content.
          </div>
        )
      )
    }
    return this.props.children
  }
}
