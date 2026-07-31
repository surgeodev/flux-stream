import { useState, createContext, useContext, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const TooltipCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void } | null>(null)

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}

export function Tooltip({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return <TooltipCtx.Provider value={{ open, setOpen }}>{children}</TooltipCtx.Provider>
}

export function TooltipTrigger({ children, asChild, ...props }: { children: ReactNode; asChild?: boolean }) {
  const ctx = useContext(TooltipCtx)!
  return (
    <div onMouseEnter={() => ctx.setOpen(true)} onMouseLeave={() => ctx.setOpen(false)} {...props}>
      {children}
    </div>
  )
}

export function TooltipContent({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(TooltipCtx)!
  if (!ctx.open) return null
  return (
    <div className={cn('absolute z-50 px-3 py-1.5 text-xs rounded-md bg-popover border border-border shadow-lg', className)}>
      {children}
    </div>
  )
}
