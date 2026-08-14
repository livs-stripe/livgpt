"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

/**
 * A horizontal snap rail for a row of cards.
 *
 * Native overflow scrolling does the work, so touch, trackpad, and shift-wheel
 * all behave as the platform expects, and tabbing to a card scrolls it into view
 * without any focus management of our own. The rail itself is focusable so the
 * arrow keys scroll it, and the arrow buttons are `aria-hidden` extras for the
 * pointer, not the only way through. Anything of a single screenful renders as a
 * plain row with no arrows and no fade.
 */
export function Carousel({
  children,
  label,
  className = "",
}: {
  children: React.ReactNode
  label: string
  className?: string
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const sync = useCallback(() => {
    const rail = railRef.current
    if (!rail) return
    // A pixel of slack: fractional scroll widths never land exactly on the end.
    const maxScroll = rail.scrollWidth - rail.clientWidth
    setAtStart(rail.scrollLeft <= 1)
    setAtEnd(rail.scrollLeft >= maxScroll - 1)
  }, [])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    sync()
    // Cards arrive while the response streams, so the rail's own size changes.
    const observer = new ResizeObserver(sync)
    observer.observe(rail)
    for (const child of Array.from(rail.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [sync, children])

  function scrollByCard(direction: 1 | -1) {
    const rail = railRef.current
    if (!rail) return
    const card = rail.firstElementChild as HTMLElement | null
    const step = card ? card.offsetWidth + 12 : rail.clientWidth * 0.8
    rail.scrollBy({ left: step * direction, behavior: "smooth" })
  }

  const scrollable = !(atStart && atEnd)

  return (
    <div className={`relative ${className}`}>
      <div
        ref={railRef}
        onScroll={sync}
        role="group"
        aria-label={label}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [scrollbar-width:thin]"
      >
        {children}
      </div>

      {scrollable && !atEnd ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent"
        />
      ) : null}

      {scrollable ? (
        <>
          <RailButton side="left" disabled={atStart} onClick={() => scrollByCard(-1)} />
          <RailButton side="right" disabled={atEnd} onClick={() => scrollByCard(1)} />
        </>
      ) : null}
    </div>
  )
}

function RailButton({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right"
  disabled: boolean
  onClick: () => void
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      // The rail is scrollable by keyboard already, so these are pointer-only
      // affordances and stay out of the tab order.
      tabIndex={-1}
      aria-hidden="true"
      className={`absolute top-[38%] flex size-9 items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-md backdrop-blur transition-opacity hover:bg-muted ${
        side === "left" ? "-left-3" : "-right-3"
      } ${disabled ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <Icon className="size-5" />
    </button>
  )
}
