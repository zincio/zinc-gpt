'use client'

import Image from 'next/image'
import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils/cn'

/**
 * A small fanned arc of chiclet tiles holding Zinc's Thiings icons, hinting at
 * the range of things you can buy. Purely decorative.
 */

const ICONS = [
  { src: '/thiings/headset.png', alt: 'Headphones' },
  { src: '/thiings/backpack.png', alt: 'Backpack' },
  { src: '/thiings/notebook.png', alt: 'Notebook' },
  { src: '/thiings/birthday-cake.png', alt: 'Birthday cake' },
  { src: '/thiings/suitcase.png', alt: 'Suitcase' },
  { src: '/thiings/trophy.png', alt: 'Trophy' },
] as const

const TILE = 36 // px, matches size-9
const RADIUS = 86 // px, arc radius (spacing ≈ 28px, so 36px tiles overlap by ~8px)
const SWEEP = 110 // degrees, total arc

const POP = { type: 'spring', stiffness: 520, damping: 30, mass: 0.7 } as const

export function ThingsArc({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const n = ICONS.length
  const mid = (n - 1) / 2
  // Height needed for the arc's sag plus one tile
  const sag = RADIUS * (1 - Math.cos((SWEEP / 2) * (Math.PI / 180)))
  const height = Math.ceil(sag + TILE)

  return (
    <div
      aria-hidden
      className={cn('relative mx-auto w-52 select-none', className)}
      style={{ height }}
    >
      {ICONS.map((icon, i) => {
        const t = i / (n - 1) - 0.5 // -0.5 .. 0.5
        const theta = t * SWEEP // degrees from the top of the arc
        const rad = theta * (Math.PI / 180)
        const x = RADIUS * Math.sin(rad)
        const y = RADIUS * (1 - Math.cos(rad))
        const distance = Math.abs(i - mid)
        // A faint hue sweep on the border only; the tile itself stays neutral
        const hue = (i / (n - 1)) * 300
        return (
          <motion.div
            key={icon.src}
            className="absolute top-0 left-1/2 flex size-9 items-center justify-center rounded-xl border bg-background shadow-xs"
            style={{
              x: x - TILE / 2,
              y,
              rotate: theta, // tangent to the arc, i.e. perpendicular to its radius
              zIndex: n - distance,
              borderColor: `oklch(0.86 0.06 ${hue})`,
            }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6, y: y + 8 }}
            animate={{ opacity: 1, scale: 1, y }}
            transition={{ ...POP, delay: 0.05 * distance }}
          >
            <Image
              src={icon.src}
              alt={icon.alt}
              width={160}
              height={160}
              sizes="28px"
              className="size-7 object-contain"
            />
          </motion.div>
        )
      })}
    </div>
  )
}
