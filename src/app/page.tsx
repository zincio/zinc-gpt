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
import { MESSAGE_ANIMATIONS } from '@/lib/message-animations'
import type { Product } from '@/lib/services/zinc-products'
import type { ShopUIMessage } from '@/lib/ai/tools'

type ShopUIPart = ShopUIMessage['parts'][number]
type SearchToolPart = Extract<ShopUIPart, { type: 'tool-search_products' }>
type CheckoutToolPart = Extract<ShopUIPart, { type: 'tool-create_checkout' }>

/** What we remember about a purchase between leaving for Stripe and coming back. */
interface PurchasedProduct {
  title: string
  price: number // cents
  retailerName: string
  image?: string
}

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
  const [purchasedProduct, setPurchasedProduct] = useState<PurchasedProduct | null>(null)
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)

  // Bootstrap session + messages from URL/localStorage on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlSessionId = params.get('sessionId')
    const isSuccess = params.get('success') === 'true'

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

    // Check for successful purchase
    if (isSuccess) {
      const purchasedData = localStorage.getItem(`purchase-${id}`)
      if (purchasedData) {
        try {
          setPurchasedProduct(JSON.parse(purchasedData))
          localStorage.removeItem(`purchase-${id}`)
        } catch {
          // Invalid purchase data, ignore
        }
      }

      // Fetch customer email from checkout session
      const checkoutSessionId = params.get('checkout_session_id')
      if (checkoutSessionId) {
        fetch(`/api/checkout/session?session_id=${checkoutSessionId}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.email) setCustomerEmail(data.email)
          })
          .catch(() => {
            // Ignore email fetch errors
          })
      }
    }

    // Keep the session in the URL so refresh preserves it. Go through the Next
    // router (not raw history.replaceState) so the router's own URL stays in
    // sync and the param survives Fast Refresh / router.refresh().
    if (urlSessionId !== id || isSuccess) {
      router.replace(`/?sessionId=${id}`, { scroll: false })
    }
    setSessionId(id)
  }, [router])

  if (!sessionId) {
    return <main className="flex h-svh flex-col bg-background" />
  }

  return (
    <MotionConfig transition={SPRING} reducedMotion="user">
      <Chat
        key={sessionId}
        sessionId={sessionId}
        initialMessages={initialMessages}
        purchasedProduct={purchasedProduct}
        customerEmail={customerEmail}
        onPurchaseDismiss={() => setPurchasedProduct(null)}
      />
    </MotionConfig>
  )
}

function Chat({
  sessionId,
  initialMessages,
  purchasedProduct,
  customerEmail,
  onPurchaseDismiss,
}: {
  sessionId: string
  initialMessages: ShopUIMessage[]
  purchasedProduct: PurchasedProduct | null
  customerEmail: string | null
  onPurchaseDismiss: () => void
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
  // MCP views): the model calls create_checkout and renders the confirmation.
  const handleBuy = (product: Product) => {
    if (isBusy) return
    void sendMessage({ text: `Set up checkout for "${product.title}" (${product.url})` })
  }

  const handleReset = () => {
    setMessages([])
    clearError()
    onPurchaseDismiss()
    localStorage.removeItem(`chat-${sessionId}`)
  }

  const isEmpty = messages.length === 0 && !error && !purchasedProduct

  // Show a "thinking" marker until the assistant starts producing output.
  const lastMessage = messages[messages.length - 1]
  const isThinking =
    status === 'submitted' || (status === 'streaming' && lastMessage?.role === 'user')

  return (
    <main className="relative flex h-svh flex-col bg-background">
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
              className="mx-auto w-full max-w-2xl px-4 pt-14 pb-44 sm:px-6 md:pt-6"
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
                          if (part.type === 'tool-create_checkout') {
                            return (
                              <CheckoutToolResult
                                key={part.toolCallId}
                                part={part}
                                sessionId={sessionId}
                              />
                            )
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

              {purchasedProduct && (
                <MotionMessageScrollerItem
                  messageId="purchase-success"
                  variants={MESSAGE_ANIMATIONS.pop.variants}
                  initial={reduceMotion ? false : 'initial'}
                  animate="animate"
                >
                  <Message>
                    <MessageContent>
                      <Item variant="outline" size="sm" className="w-full">
                        <ProductThumb src={purchasedProduct.image} />
                        <ItemContent className="min-w-0">
                          <ItemTitle>Order placed</ItemTitle>
                          <ItemDescription className="truncate tabular-nums">
                            {purchasedProduct.title} · {formatPrice(purchasedProduct.price)} · {purchasedProduct.retailerName}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                      <MessageFooter>
                        We&apos;ll email {customerEmail ?? 'you'} a receipt and tracking information.
                      </MessageFooter>
                    </MessageContent>
                  </Message>
                </MotionMessageScrollerItem>
              )}
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

function CheckoutToolResult({ part, sessionId }: { part: CheckoutToolPart; sessionId: string }) {
  const reduceMotion = useReducedMotion()

  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <Marker role="status">
        <MarkerContent className="shimmer">Preparing checkout...</MarkerContent>
      </Marker>
    )
  }
  if (part.state !== 'output-available') return null

  const { productTitle, productPrice, productImage, productUrl } = part.input
  const priceCents = Math.round(productPrice * 100)
  let retailerName = 'the retailer'
  try {
    retailerName = new URL(productUrl).hostname.replace(/^www\./, '').split('.')[0]
    retailerName = retailerName.charAt(0).toUpperCase() + retailerName.slice(1)
  } catch {
    // keep fallback
  }

  if (!part.output.url) {
    return (
      <Marker>
        <MarkerContent>{part.output.error ?? 'Checkout is unavailable right now.'}</MarkerContent>
      </Marker>
    )
  }

  const rememberPurchase = () => {
    const purchased: PurchasedProduct = {
      title: productTitle,
      price: priceCents,
      retailerName,
      image: productImage,
    }
    try {
      localStorage.setItem(`purchase-${sessionId}`, JSON.stringify(purchased))
    } catch {
      // ignore storage failures
    }
  }

  return (
    <MotionItem
      variant="outline"
      size="sm"
      className="w-full"
      variants={MESSAGE_ANIMATIONS.pop.variants}
      initial={reduceMotion ? false : 'initial'}
      animate="animate"
    >
      <ProductThumb src={productImage} />
      <ItemContent className="min-w-0">
        <ItemTitle className="block w-full truncate">{productTitle}</ItemTitle>
        <ItemDescription className="truncate tabular-nums">
          {formatPrice(priceCents)} · {retailerName} · Nothing charged yet
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button size="sm" asChild onClick={rememberPurchase}>
          <a href={part.output.url}>Complete purchase</a>
        </Button>
      </ItemActions>
    </MotionItem>
  )
}
