"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

const COLORS = [
  "#7C5CFF",
  "#635BFF",
  "#F472B6",
  "#E879A9",
  "#E8A87C",
  "#F0A36B",
  "#8FBF9F",
  "#86C5A8",
  "#7EC8E3",
  "#93C5FD",
  "#C084FC",
]

type Piece = {
  x: number
  y: number
  w: number
  h: number
  rot: number
  rotSpeed: number
  vx: number
  vy: number
  shape: "rect" | "circle"
  color: string
  opacity: number
}

function spawnPiece(width: number, height: number, fromTop: boolean): Piece {
  const circle = Math.random() > 0.55
  return {
    x: Math.random() * width,
    y: fromTop ? -24 - Math.random() * 80 : Math.random() * height,
    w: circle ? 6 + Math.random() * 9 : 7 + Math.random() * 12,
    h: circle ? 5 + Math.random() * 8 : 4 + Math.random() * 8,
    rot: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.22,
    vx: (Math.random() - 0.5) * 3.2,
    vy: 1.2 + Math.random() * 3.4,
    shape: circle ? "circle" : "rect",
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
    opacity: 0.72 + Math.random() * 0.28,
  }
}

/** Full-viewport confetti for a few seconds after a successful purchase. */
export function ConfettiBurst({ durationMs = 3400 }: { durationMs?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [mounted, setMounted] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    setMounted(true)
    const timeout = window.setTimeout(() => setDone(true), durationMs)
    return () => window.clearTimeout(timeout)
  }, [durationMs])

  useEffect(() => {
    if (!mounted) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const size = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      return { width, height }
    }

    let { width, height } = size()
    const onResize = () => {
      ;({ width, height } = size())
    }
    window.addEventListener("resize", onResize)

    const pieces: Piece[] = []
    for (let i = 0; i < 110; i++) pieces.push(spawnPiece(width, height, false))
    for (let i = 0; i < 50; i++) pieces.push(spawnPiece(width, height, true))

    const start = performance.now()
    const fadeMs = 700
    let raf = 0
    let spawned = 0

    const frame = (now: number) => {
      const elapsed = now - start
      if (elapsed < 900 && spawned < 40) {
        pieces.push(spawnPiece(width, height, true))
        spawned += 1
      }

      ctx.clearRect(0, 0, width, height)
      const fade =
        elapsed > durationMs - fadeMs
          ? Math.max(0, 1 - (elapsed - (durationMs - fadeMs)) / fadeMs)
          : 1

      for (const piece of pieces) {
        piece.x += piece.vx
        piece.y += piece.vy
        piece.vy += 0.045
        piece.rot += piece.rotSpeed
        piece.vx *= 0.994

        ctx.save()
        ctx.globalAlpha = piece.opacity * fade
        ctx.translate(piece.x, piece.y)
        ctx.rotate(piece.rot)
        ctx.fillStyle = piece.color
        if (piece.shape === "circle") {
          ctx.beginPath()
          ctx.ellipse(0, 0, piece.w / 2, piece.h / 2, 0, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h)
        }
        ctx.restore()
      }

      if (elapsed < durationMs) raf = requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, width, height)
    }

    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", onResize)
    }
  }, [durationMs, mounted])

  if (!mounted || done) return null

  return createPortal(
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[200]"
      aria-hidden="true"
    />,
    document.body,
  )
}
