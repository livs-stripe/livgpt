"use client"

import Link from "next/link"
import { MessageSquarePlus, Sparkles, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Conversation } from "@/lib/types"

type SidebarProps = {
  conversations: Conversation[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="flex items-center gap-2 text-base font-semibold">
            Shop with Stripe
          </span>
          <span className="text-sm text-muted-foreground">
            AI shopping assistant
          </span>
        </div>
      </div>

      <div className="px-3 pb-3">
        <Button onClick={onNew} variant="secondary" className="h-10 w-full justify-start text-base">
          <MessageSquarePlus className="size-4" />
          New chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2">
        <div className="flex flex-col gap-0.5 py-1">
          {conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-2.5 text-[15px] leading-snug transition-colors ${
                  c.id === activeId
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-sidebar-accent/50"
                }`}
              >
                <button
                  onClick={() => onSelect(c.id)}
                  className="flex-1 truncate text-left"
                >
                  {c.title}
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label="Delete conversation"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Powered by Stripe Agentic Commerce
        </p>
        <nav className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground hover:underline underline-offset-2"
          >
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground hover:underline underline-offset-2"
          >
            Terms
          </Link>
        </nav>
      </div>
    </aside>
  )
}
