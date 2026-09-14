'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils/cn'

const INTERVAL_MS = 3600

/**
 * A rotating example prompt drawn over an empty textarea.
 *
 * The textarea keeps its real `placeholder` for assistive tech (hidden with
 * `placeholder:text-transparent`); this decorative layer is `aria-hidden`.
 * Only the example rotates; the lead-in stays put so the eye has an anchor.
 */
export function RotatingPlaceholder({
  lead,
  examples,
  active,
  className,
}: {
  lead: string
  examples: readonly string[]
  /** Render only while the field is empty. */
  active: boolean
  className?: string
}) {
  const [index, setIndex] = useState(0)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (!active || examples.length < 2) return
    let timer: ReturnType<typeof setInterval> | null = null

    const start = () => {
      stop()
      timer = setInterval(() => setIndex((i) => (i + 1) % examples.length), INTERVAL_MS)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    // Don't churn while the tab is hidden.
    const onVisibility = () => (document.hidden ? stop() : start())

    start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, examples.length])

  if (!active) return null

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 flex items-center gap-1 overflow-hidden px-2.5 py-2 text-base leading-normal text-muted-foreground select-none md:text-sm',
        className
      )}
    >
      <span className="shrink-0">{lead}</span>
      <span className="relative min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={examples[index]}
            className="block truncate"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, filter: 'blur(2px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, filter: 'blur(2px)', transition: { duration: 0.15 } }}
            transition={{ type: 'spring', duration: 0.45, bounce: 0 }}
          >
            {examples[index]}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}
