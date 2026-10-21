'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react'
import { Streamdown } from 'streamdown'
import {
  AlertCircleIcon,
  ArrowUpIcon,
  RotateCwIcon,
  ShoppingBagIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import { Message, MessageContent, MessageFooter } from '@/components/ui/message'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Marker, MarkerContent } from '@/components/ui/marker'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { RotatingPlaceholder } from '@/components/rotating-placeholder'
import { ThingsArc } from '@/components/things-arc'
import { ZincLogo } from '@/components/zinc-logo'
import { MESSAGE_ANIMATIONS } from '@/lib/message-animations'
import type { Product } from '@/lib/services/zinc-products'
import type { ShopUIMessage } from '@/lib/ai/tools'
import type { McpPayment, McpPlaceOutput } from '@/lib/services/zinc-mcp'

type ShopUIPart = ShopUIMessage['parts'][number]
type SearchToolPart = Extract<ShopUIPart, { type: 'tool-search_products' }>
type PrepareToolPart = Extract<ShopUIPart, { type: 'tool-prepare_order' }>

const ZINC_MCP_DOCS_URL = 'https://www.zinc.com/docs/v2/mcp/overview'

const PLACEHOLDER_LEAD = 'Buy anything, like'
const PLACEHOLDER_EXAMPLES = [
  'wireless earbuds under $30',
  'a cast iron skillet under $40',
  'a birthday gift for a six-year-old',
  'running shoes from Walmart',
  'a standing desk mat',
  'dog treats on Chewy',
  'a French press and some good coffee',
] as const

/** One transition for the whole chat so it reads as a single surface. */
const SPRING = { type: 'spring', duration: 0.4, bounce: 0 } as const
const ENTER = MESSAGE_ANIMATIONS['slide-up'].variants
const MotionMessageScrollerItem = motion.create(MessageScrollerItem)

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // Fallback for very old browsers: RFC 4122 v4 via Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default function Home() {
  const router = useRouter()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<ShopUIMessage[]>([])

  // Bootstrap session + messages from URL/localStorage on mount
  useEffect(() => {
    const urlSessionId = new URLSearchParams(window.location.search).get('sessionId')
    const id = urlSessionId || newSessionId()

    // Load messages from localStorage
    const stored = localStorage.getItem(`chat-${id}`)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setInitialMessages(parsed)
      } catch {
        // Invalid stored messages, ignore
      }
    }

    // Keep the session in the URL so refresh preserves it. Go through the Next
    // router (not raw history.replaceState) so the router's own URL stays in
    // sync and the param survives Fast Refresh / router.refresh().
    if (urlSessionId !== id) {
      router.replace(`/?sessionId=${id}`, { scroll: false })
    }
    setSessionId(id)
  }, [router])

  if (!sessionId) {
    return <main className="flex h-svh flex-col bg-background" />
  }

  return (
    <MotionConfig transition={SPRING} reducedMotion="user">
      <Chat key={sessionId} sessionId={sessionId} initialMessages={initialMessages} />
    </MotionConfig>
  )
}

function Chat({
  sessionId,
  initialMessages,
}: {
  sessionId: string
  initialMessages: ShopUIMessage[]
}) {
  const [input, setInput] = useState('')
  const formRef = useRef<HTMLFormElement>(null)
  const reduceMotion = useReducedMotion()

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: { sessionId },
      }),
    [sessionId]
  )

  const { messages, sendMessage, status, error, setMessages, regenerate, clearError } =
    useChat<ShopUIMessage>({
      id: sessionId,
      messages: initialMessages,
      transport,
    })

  const isBusy = status === 'submitted' || status === 'streaming'

  // Save messages to localStorage when they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(`chat-${sessionId}`, JSON.stringify(messages))
    }
  }, [sessionId, messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isBusy) return
    setInput('')
    await sendMessage({ text })
  }

  // "Buy this" hands the product back to the model (same pattern as the Zinc
  // MCP views): the model calls prepare_order and the review card renders.
  const handleBuy = (product: Product) => {
    if (isBusy) return
    void sendMessage({ text: `Buy "${product.title}" (${product.url})` })
  }

  const handleReset = () => {
    setMessages([])
    clearError()
    localStorage.removeItem(`chat-${sessionId}`)
  }

  const isEmpty = messages.length === 0 && !error

  // Show a "thinking" marker until the assistant starts producing output.
  const lastMessage = messages[messages.length - 1]
  const isThinking =
    status === 'submitted' || (status === 'streaming' && lastMessage?.role === 'user')

  return (
    <main className="relative flex h-svh flex-col bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
        <Badge
          variant="outline"
          className="pointer-events-auto bg-background/90 text-muted-foreground shadow-sm backdrop-blur"
          asChild
        >
          <a href={ZINC_MCP_DOCS_URL} target="_blank" rel="noopener noreferrer">
            <ZincLogo className="text-foreground" />
            Powered by Zinc MCP
          </a>
        </Badge>
      </div>

      {/* Reset, floating top-right once there is something to reset */}
      <AnimatePresence>
        {messages.length > 0 && (
          <motion.div
            key="reset"
            className="absolute top-3 right-3 z-20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <Button
              variant="outline"
              size="icon"
              className="rounded-full bg-background/90 shadow-xs backdrop-blur"
              aria-label="New conversation"
              title="New conversation"
              onClick={handleReset}
              disabled={isBusy}
            >
              <RotateCwIcon />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport aria-label="Conversation">
            {/* Bottom padding keeps the last turn clear of the floating composer */}
            <MessageScrollerContent
              aria-busy={isBusy || undefined}
              className="mx-auto w-full max-w-2xl px-4 pt-14 pb-44 sm:px-6"
            >
              {isEmpty && (
                <motion.div
                  className="flex flex-1 flex-col"
                  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Empty className="h-full border-none">
                    <ThingsArc className="-mb-2" />
                    <EmptyHeader>
                      <EmptyTitle className="text-2xl font-semibold tracking-tight">
                        <h1>Zinc GPT</h1>
                      </EmptyTitle>
                      <EmptyDescription>
                        Shop any retailer by chat. Ask for a product, compare picks, and
                        check out without leaving the conversation.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                </motion.div>
              )}

              {messages.map((message) => {
                const isUser = message.role === 'user'
                return (
                  <MotionMessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={isUser}
                    // Only the user's turn animates in; the reply streams into place.
                    variants={isUser ? ENTER : undefined}
                    initial={isUser && !reduceMotion ? 'initial' : false}
                    animate="animate"
                  >
                    <Message align={isUser ? 'end' : 'start'}>
                      <MessageContent>
                        {message.parts.map((part, index) => {
                          if (part.type === 'text') {
                            if (!part.text) return null
                            return isUser ? (
                              <Bubble key={index} variant="muted">
                                <BubbleContent className="whitespace-pre-wrap">
                                  {part.text}
                                </BubbleContent>
                              </Bubble>
                            ) : (
                              <Bubble key={index} variant="ghost">
                                <BubbleContent>
                                  <Streamdown className="w-full min-w-0 overflow-hidden">
                                    {part.text}
                                  </Streamdown>
                                </BubbleContent>
                              </Bubble>
                            )
                          }
                          if (part.type === 'tool-search_products') {
                            return (
                              <SearchToolResult
                                key={part.toolCallId}
                                part={part}
                                onBuy={handleBuy}
                                disabled={isBusy}
                              />
                            )
                          }
                          if (part.type === 'tool-prepare_order') {
                            return <PrepareOrderResult key={part.toolCallId} part={part} />
                          }
                          return null
                        })}
                      </MessageContent>
                    </Message>
                  </MotionMessageScrollerItem>
                )
              })}

              <AnimatePresence>
                {isThinking && (
                  <MotionMessageScrollerItem
                    key="thinking"
                    messageId="thinking"
                    variants={MESSAGE_ANIMATIONS.fade.variants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Marker role="status">
                      <MarkerContent className="shimmer">Thinking...</MarkerContent>
                    </Marker>
                  </MotionMessageScrollerItem>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <MotionMessageScrollerItem
                    key="error"
                    messageId="error"
                    variants={ENTER}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                  >
                    <Message>
                      <MessageContent>
                        <Bubble variant="destructive">
                          <BubbleContent className="flex items-center gap-2">
                            <AlertCircleIcon className="size-4 shrink-0" />
                            <span>{error.message || 'Something went wrong. Please try again.'}</span>
                          </BubbleContent>
                        </Bubble>
                        <MessageFooter>
                          <Button
                            variant="link"
                            size="xs"
                            className="h-auto p-0 text-xs"
                            onClick={() => regenerate()}
                          >
                            Try again
                          </Button>
                        </MessageFooter>
                      </MessageContent>
                    </Message>
                  </MotionMessageScrollerItem>
                )}
              </AnimatePresence>

            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton className="data-[direction=end]:bottom-40" />
        </MessageScroller>
      </MessageScrollerProvider>

      {/* Floating composer */}
      {/* Gradient backdrop so content scrolling beneath the composer dissolves into the page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-background via-background/90 to-transparent px-4 pt-8 pb-4 sm:pb-6">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="pointer-events-auto mx-auto w-full max-w-2xl rounded-2xl bg-background"
        >
          <InputGroup className="relative has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
            <InputGroupTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  formRef.current?.requestSubmit()
                }
              }}
              placeholder={`${PLACEHOLDER_LEAD} ${PLACEHOLDER_EXAMPLES[0]}`}
              aria-label="Message"
              rows={1}
              className="max-h-40 min-h-14 placeholder:text-transparent"
              disabled={isBusy}
            />
            <RotatingPlaceholder
              lead={PLACEHOLDER_LEAD}
              examples={PLACEHOLDER_EXAMPLES}
              active={input.length === 0}
            />
            <InputGroupAddon align="block-end">
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto rounded-full"
                disabled={isBusy || !input.trim()}
                aria-label="Send"
              >
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </div>
    </main>
  )
}

/* -------------------------------------------------------------------------- */
/* Tool parts                                                                  */
/* -------------------------------------------------------------------------- */

const MotionItem = motion.create(Item)

const listVariants = {
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } },
}
const rowVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
}

function ProductThumb({ src, alt = '' }: { src?: string; alt?: string }) {
  return (
    <ItemMedia variant="image" className="bg-background [&_img]:object-contain">
      {src ? (
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <ShoppingBagIcon className="size-4 text-muted-foreground" />
      )}
    </ItemMedia>
  )
}

function SearchSkeleton() {
  return (
    <ItemGroup aria-busy>
      {[...Array(3)].map((_, i) => (
        <Fragment key={i}>
          <Item variant="outline" size="xs">
            <ItemMedia variant="image">
              <Skeleton className="size-full" />
            </ItemMedia>
            <ItemContent>
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </ItemContent>
            <ItemActions />
          </Item>
        </Fragment>
      ))}
    </ItemGroup>
  )
}

function ProductList({
  products,
  onBuy,
  disabled,
}: {
  products: Product[]
  onBuy: (product: Product) => void
  disabled?: boolean
}) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      className="w-full"
      variants={listVariants}
      initial={reduceMotion ? false : 'initial'}
      animate="animate"
    >
      <ItemGroup>
        {products.map((product) => (
          <Fragment key={product.id}>
            <MotionItem
              variant="outline"
              size="xs"
              variants={rowVariants}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled || undefined}
              aria-label={`Buy ${product.title}`}
              onClick={() => !disabled && onBuy(product)}
              onKeyDown={(e) => {
                if (disabled) return
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onBuy(product)
                }
              }}
              className="cursor-pointer transition-colors hover:bg-muted focus-visible:bg-muted aria-disabled:cursor-default aria-disabled:opacity-60"
            >
              <ProductThumb src={product.image} />
              <ItemContent className="min-w-0">
                <ItemTitle className="block w-full truncate">{product.title}</ItemTitle>
                <ItemDescription className="truncate tabular-nums">
                  {formatPrice(product.price)} ·{' '}
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`View on ${product.retailerName}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {product.retailerName}
                  </a>
                  {product.rating != null && (
                    <>
                      {' '}· ★ {product.rating.toFixed(1)}
                      {product.reviews ? ` (${product.reviews.toLocaleString()})` : ''}
                    </>
                  )}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                {/* Label only: the whole row is the button. Shown on hover/focus; always on touch. */}
                <span
                  aria-hidden
                  className="px-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 group-focus-visible/item:opacity-100 pointer-coarse:opacity-100"
                >
                  Buy
                </span>
              </ItemActions>
            </MotionItem>
          </Fragment>
        ))}
      </ItemGroup>
    </motion.div>
  )
}

function SearchToolResult({
  part,
  onBuy,
  disabled,
}: {
  part: SearchToolPart
  onBuy: (product: Product) => void
  disabled?: boolean
}) {
  switch (part.state) {
    case 'input-streaming':
    case 'input-available':
      return <SearchSkeleton />
    case 'output-error':
      return (
        <Marker>
          <MarkerContent>Search failed. Please try again.</MarkerContent>
        </Marker>
      )
    case 'output-available': {
      const products = part.output.products
      if (!products?.length) return null
      return <ProductList products={products} onBuy={onBuy} disabled={disabled} />
    }
    default:
      return null
  }
}

type OrderPhase =
  | { kind: 'review' }
  | { kind: 'placing' }
  | { kind: 'paying'; paymentId: string; payUrl: string | null }
  | { kind: 'placed'; orderId: string }
  | { kind: 'failed'; message: string }

const PAYMENT_POLL_MS = 3000

function orderStorageKey(toolCallId: string) {
  return `order-${toolCallId}`
}

/**
 * Our version of the Zinc MCP review card. Pay & place is the only path to
 * place-order: the model can prepare an order but never confirm one.
 */
function PrepareOrderResult({ part }: { part: PrepareToolPart }) {
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<OrderPhase>({ kind: 'review' })

  // Resume a payment or placed order after a reload
  useEffect(() => {
    try {
      const saved = localStorage.getItem(orderStorageKey(part.toolCallId))
      if (saved) setPhase(JSON.parse(saved) as OrderPhase)
    } catch {
      // ignore storage failures
    }
  }, [part.toolCallId])

  useEffect(() => {
    if (phase.kind !== 'paying' && phase.kind !== 'placed') return
    try {
      localStorage.setItem(orderStorageKey(part.toolCallId), JSON.stringify(phase))
    } catch {
      // ignore storage failures
    }
  }, [part.toolCallId, phase])

  // Poll the payment until the order exists (the payment page runs in another tab)
  const paymentId = phase.kind === 'paying' ? phase.paymentId : null
  useEffect(() => {
    if (!paymentId) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/order?payment_id=${encodeURIComponent(paymentId)}`)
        const payment = (await res.json()) as McpPayment & { error?: string }
        if (cancelled || !res.ok) return
        if (payment.order_id) setPhase({ kind: 'placed', orderId: payment.order_id })
        else if (payment.status === 'failed' || payment.status === 'expired')
          setPhase({ kind: 'failed', message: payment.failure ?? 'Payment was not completed.' })
      } catch {
        // transient; try again next tick
      }
    }
    void tick()
    const interval = setInterval(tick, PAYMENT_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [paymentId])

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <Marker role="status">
        <MarkerContent className="shimmer">Preparing your order...</MarkerContent>
      </Marker>
    )
  }
  if (part.state !== 'output-available') return null

  const { product, quote, pending, error } = part.output
  if (!product || !pending) {
    return (
      <Marker>
        <MarkerContent>{error ?? 'This order cannot be placed right now.'}</MarkerContent>
      </Marker>
    )
  }

  const handlePay = async () => {
    // Open the tab inside the click so it isn't blocked as a popup
    const tab = window.open('', '_blank')
    setPhase({ kind: 'placing' })
    try {
      const res = await fetch('/api/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending),
      })
      const placed = (await res.json()) as McpPlaceOutput & { error?: string }
      if (!res.ok) throw new Error(placed.error ?? 'Could not place the order.')

      if (placed.order_id) {
        tab?.close()
        setPhase({ kind: 'placed', orderId: placed.order_id })
      } else if (placed.payment) {
        if (tab && placed.payment.pay_url) tab.location.href = placed.payment.pay_url
        else tab?.close()
        setPhase({ kind: 'paying', paymentId: placed.payment.payment_id, payUrl: placed.payment.pay_url })
      } else {
        throw new Error('Zinc did not return a payment page.')
      }
    } catch (err) {
      tab?.close()
      setPhase({ kind: 'failed', message: err instanceof Error ? err.message : 'Could not place the order.' })
    }
  }

  const unit = formatPrice(product.priceCents)
  const qty = product.quantity > 1 ? ` × ${product.quantity}` : ''

  return (
    <MotionItem
      variant="outline"
      size="sm"
      className="w-full"
      variants={MESSAGE_ANIMATIONS.pop.variants}
      initial={reduceMotion ? false : 'initial'}
      animate="animate"
    >
      <ProductThumb src={product.image} />
      <ItemContent className="min-w-0">
        <ItemTitle className="block w-full truncate">{product.title}</ItemTitle>
        <ItemDescription className="truncate tabular-nums">
          {unit}
          {qty} · {product.retailerName}
          {quote && <> · about {formatPrice(quote.estimated_total_cents)} total</>}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {phase.kind === 'review' && (
          <Button size="sm" onClick={handlePay}>
            Pay &amp; place
          </Button>
        )}
        {phase.kind === 'placing' && (
          <Button size="sm" disabled>
            Opening payment...
          </Button>
        )}
        {phase.kind === 'paying' && phase.payUrl && (
          <Button size="sm" variant="outline" asChild>
            <a href={phase.payUrl} target="_blank" rel="noopener noreferrer">
              Open payment page
            </a>
          </Button>
        )}
        {phase.kind === 'failed' && (
          <Button size="sm" variant="outline" onClick={handlePay}>
            Try again
          </Button>
        )}
      </ItemActions>
      <ItemFooter className="text-xs text-muted-foreground tabular-nums">
        {phase.kind === 'review' || phase.kind === 'placing' ? (
          quote ? (
            <span>
              {formatPrice(quote.listed_price_cents)} + est. tax {formatPrice(quote.estimated_tax_cents)} + shipping{' '}
              {formatPrice(quote.shipping_cents)} + Zinc fee {formatPrice(quote.order_fee_cents)}. Hold up to{' '}
              {formatPrice(quote.hold_cents)}; only the actual total is charged. Card, address and phone go on the
              payment page.
            </span>
          ) : (
            <span>Nothing charged yet. Card, address and phone go on the payment page.</span>
          )
        ) : phase.kind === 'paying' ? (
          <span className="shimmer">Waiting for payment in the other tab...</span>
        ) : phase.kind === 'placed' ? (
          <span>
            Order placed · <span className="font-mono">{phase.orderId.slice(0, 8)}</span>. Receipt and tracking go to
            the email you paid with.
          </span>
        ) : (
          <span className="text-destructive">{phase.message}</span>
        )}
      </ItemFooter>
    </MotionItem>
  )
}
