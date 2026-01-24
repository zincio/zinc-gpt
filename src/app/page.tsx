'use client'

import { useChat, type Message as ChatMessage } from 'ai/react'
import { useEffect, useState, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { ExternalLink, ShoppingCart, RotateCcw, Loader2 } from 'lucide-react'
import type { CostEstimate } from '@/lib/services/cost-estimator'

interface Store {
  name: string
  price: number
  url: string
  title?: string
  rating?: number
  reviews?: number
}

interface ProductFeature {
  title: string
  value: string
}

interface Product {
  id: string
  title: string
  price: number
  url: string
  image?: string
  images?: string[]
  retailer: string
  rating?: number
  reviews?: number
  stores?: Store[]
  variantTitle?: string
  features?: ProductFeature[]
  hasVariants?: boolean
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [initialMessages, setInitialMessages] = useState<ChatMessage[]>([])
  const [isInitialized, setIsInitialized] = useState(false)
  const [purchasedProduct, setPurchasedProduct] = useState<Product | null>(null)
  const [customerEmail, setCustomerEmail] = useState<string | null>(null)

  // Load sessionId and messages from URL/localStorage on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlSessionId = params.get('sessionId')
    const isSuccess = params.get('success') === 'true'

    if (urlSessionId) {
      setSessionId(urlSessionId)
      // Load messages from localStorage
      const stored = localStorage.getItem(`chat-${urlSessionId}`)
      if (stored) {
        try {
          setInitialMessages(JSON.parse(stored))
        } catch {
          // Invalid stored messages, ignore
        }
      }

      // Check for successful purchase
      if (isSuccess) {
        const purchasedData = localStorage.getItem(`purchase-${urlSessionId}`)
        if (purchasedData) {
          try {
            setPurchasedProduct(JSON.parse(purchasedData))
            localStorage.removeItem(`purchase-${urlSessionId}`)
          } catch {
            // Invalid purchase data, ignore
          }
        }

        // Fetch customer email from checkout session
        const checkoutSessionId = params.get('checkout_session_id')
        if (checkoutSessionId) {
          fetch(`/api/checkout/session?session_id=${checkoutSessionId}`)
            .then(res => res.json())
            .then(data => {
              if (data.email) {
                setCustomerEmail(data.email)
              }
            })
            .catch(() => {
              // Ignore email fetch errors
            })
        }

        // Clean URL
        window.history.replaceState({}, '', `/?sessionId=${urlSessionId}`)
      }
    }
    setIsInitialized(true)
  }, [])

  const { messages, input, setInput, setMessages, append, isLoading } = useChat({
    id: sessionId || undefined,
    api: '/api/chat',
    body: { sessionId },
    initialMessages: initialMessages,
    onResponse: (response) => {
      const newSessionId = response.headers.get('X-Session-Id')
      if (newSessionId && newSessionId !== sessionId) {
        setSessionId(newSessionId)
        // Update URL so refresh preserves session
        window.history.replaceState({}, '', `/?sessionId=${newSessionId}`)
      }
    },
  })

  // Save messages to localStorage when they change
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      localStorage.setItem(`chat-${sessionId}`, JSON.stringify(messages))
    }
  }, [sessionId, messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const message = input
    setInput('')
    await append({ role: 'user', content: message })
  }

  const handleReset = () => {
    setMessages([])
    setPurchasedProduct(null)
    if (sessionId) {
      localStorage.removeItem(`chat-${sessionId}`)
    }
  }

  return (
    <main className="flex h-screen flex-col bg-white">
      {/* Reset button */}
      {messages.length > 0 && (
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleReset}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            title="Reset conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-[60vh] text-center">
              <h1 className="text-xl font-medium text-gray-900 mb-2">What are you looking for?</h1>
              <p className="text-sm text-gray-500">Search any product across retailers</p>
            </div>
          )}

          {messages.map((message) => (
            <Message key={message.id} from={message.role} className="mb-6">
              {message.role === 'user' ? (
                <MessageContent>{message.content}</MessageContent>
              ) : (
                <>
                  {message.parts?.map((part, index) => {
                    if (part.type === 'text' && part.text) {
                      return (
                        <MessageContent key={index}>
                          <MessageResponse>
                            <ReactMarkdown>{part.text}</ReactMarkdown>
                          </MessageResponse>
                        </MessageContent>
                      )
                    }
                    if (part.type === 'tool-invocation') {
                      return (
                        <ToolResult
                          key={part.toolInvocation.toolCallId}
                          tool={part.toolInvocation}
                          onProductClick={setSelectedProduct}
                        />
                      )
                    }
                    return null
                  }) ?? <MessageContent><MessageResponse>{message.content}</MessageResponse></MessageContent>}
                </>
              )}
            </Message>
          ))}

          {/* Purchase Success Message */}
          {purchasedProduct && (
            <div className="mb-6">
              <div className="p-4 rounded-lg border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-3">
                  {purchasedProduct.image && (
                    <img
                      src={purchasedProduct.image}
                      alt={purchasedProduct.title}
                      className="w-14 h-14 object-cover rounded-lg border border-gray-100"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">Purchase complete!</p>
                    <p className="text-xs text-gray-600 truncate mt-0.5">{purchasedProduct.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ${(purchasedProduct.price / 100).toFixed(2)} from {purchasedProduct.retailer}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">
                We&apos;ll email {customerEmail ? <span className="text-gray-500">{customerEmail}</span> : 'you'} a receipt and tracking information.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="bg-white">
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 bg-gray-50 rounded-full px-4 py-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything"
              className="flex-1 bg-transparent outline-none text-sm text-gray-900 placeholder:text-gray-400"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="sm"
              disabled={isLoading || !input.trim()}
              className="rounded-full h-8 w-8 p-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </form>
      </div>

      {/* Product Detail Sheet (side panel) */}
      <ProductSheet
        product={selectedProduct}
        sessionId={sessionId}
        onClose={() => setSelectedProduct(null)}
      />
    </main>
  )
}

function ToolResult({
  tool,
  onProductClick,
}: {
  tool: any
  onProductClick: (product: Product) => void
}) {
  const { toolName, state, result } = tool

  if (state !== 'result') {
    if (toolName === 'search_products') {
      return (
        <div className="relative -mx-8">
          <div className="flex gap-3 overflow-hidden pb-2 pr-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`flex-shrink-0 w-36 ${i === 0 ? 'ml-8' : ''}`}>
                <Skeleton className="w-full aspect-[3/4] rounded-lg" />
                <div className="mt-2 space-y-1">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
          <div className="absolute top-0 bottom-2 w-8 pointer-events-none" style={{ left: 0, background: 'linear-gradient(to left, transparent, white)' }} />
          <div className="absolute top-0 bottom-2 w-16 pointer-events-none" style={{ right: 0, background: 'linear-gradient(to right, transparent, white)' }} />
        </div>
      )
    }
    return <div className="text-sm text-gray-500">Processing...</div>
  }

  if (toolName === 'search_products' && result?.products) {
    return <ProductRow products={result.products} toolCallId={tool.toolCallId} onProductClick={onProductClick} />
  }

  if (toolName === 'create_checkout' && result?.url) {
    return (
      <a
        href={result.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 mt-2 px-5 py-3 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors"
      >
        <ShoppingCart className="w-4 h-4" />
        Complete Purchase
      </a>
    )
  }

  return null
}

// Track which tool calls have been rendered to prevent re-animation
const renderedToolCalls = new Set<string>()

function ProductRow({
  products,
  toolCallId,
  onProductClick,
}: {
  products: Product[]
  toolCallId: string
  onProductClick: (product: Product) => void
}) {
  const shouldAnimate = useRef(!renderedToolCalls.has(toolCallId))

  useEffect(() => {
    renderedToolCalls.add(toolCallId)
  }, [toolCallId])

  if (!products?.length) return null

  return (
    <div className="relative -mx-8">
      <div className="flex gap-3 overflow-x-auto pb-2 pr-8 scrollbar-hide">
        {products.map((product, i) => (
        <button
          key={product.id}
          onClick={() => onProductClick(product)}
          className={`flex-shrink-0 w-36 text-left group/card ${i === 0 ? 'ml-8' : ''}`}
          style={shouldAnimate.current ? {
            animation: `fadeSlideIn 0.3s ease-out ${i * 0.05}s both`
          } : undefined}
        >
          <div className="overflow-hidden rounded-lg border border-gray-100 shadow-sm bg-gray-50">
            {product.image ? (
              <img
                src={product.image}
                alt={product.title}
                className="w-full aspect-[3/4] object-cover group-hover/card:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full aspect-[3/4]" />
            )}
          </div>
          <div className="mt-2 h-12">
            <p className="text-xs font-medium text-gray-900 truncate">
              {product.title}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              ${(product.price / 100).toFixed(2)} · {product.retailer}
            </p>
          </div>
        </button>
      ))}
      </div>
      <div className="absolute top-0 bottom-2 w-8 pointer-events-none" style={{ left: 0, background: 'linear-gradient(to left, transparent, white)' }} />
      <div className="absolute top-0 bottom-2 w-16 pointer-events-none" style={{ right: 0, background: 'linear-gradient(to right, transparent, white)' }} />
    </div>
  )
}

function ProductSheet({
  product,
  sessionId,
  onClose,
}: {
  product: Product | null
  sessionId: string | null
  onClose: () => void
}) {
  const [isLoading, setIsLoading] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [zipCode, setZipCode] = useState('')
  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  // Reset image index and zip code when product changes
  useEffect(() => {
    setSelectedImageIndex(0)
    setEstimate(null)
  }, [product?.id])

  // Fetch estimate when zip code is valid (5 digits)
  useEffect(() => {
    if (zipCode.length === 5 && product) {
      setIsEstimating(true)
      fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productPriceCents: product.price,
          zipCode
        })
      })
        .then(r => r.json())
        .then(data => {
          if (data.error) {
            setEstimate(null)
          } else {
            setEstimate(data)
          }
        })
        .catch(() => setEstimate(null))
        .finally(() => setIsEstimating(false))
    } else {
      setEstimate(null)
    }
  }, [zipCode, product?.price, product])

  const handleBuy = async () => {
    if (!product) return
    setIsLoading(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: product.title,
          productPrice: product.price / 100,
          productImage: product.image,
          productUrl: product.url,
          sessionId,
        }),
      })
      const data = await response.json()
      if (data.url) {
        // Save product info for success message
        if (sessionId) {
          localStorage.setItem(`purchase-${sessionId}`, JSON.stringify(product))
        }
        window.location.href = data.url
      }
    } catch {
      // Checkout error, silently fail (user will see the page didn't redirect)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Sheet open={!!product} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xs overflow-y-auto">
        {product && (
          <div className="space-y-4">
            {/* Product Images */}
            {(product.images?.length || product.image) && (
              <div className="-mx-6 -mt-6">
                <div className="overflow-hidden">
                  <img
                    src={product.images?.[selectedImageIndex] || product.image}
                    alt={product.title}
                    className="w-full aspect-square object-cover"
                  />
                </div>
                {/* Thumbnail Gallery */}
                {product.images && product.images.length > 1 && (
                  <div className="flex gap-1.5 px-4 py-2 overflow-x-auto">
                    {product.images.slice(0, 6).map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedImageIndex(i)}
                        className={`flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border-2 transition-colors ${
                          i === selectedImageIndex ? 'border-gray-900' : 'border-transparent'
                        }`}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <SheetHeader className="text-left space-y-1">
              <SheetTitle className="text-base font-semibold leading-tight pr-8">
                {product.title}
              </SheetTitle>
              {product.variantTitle && product.variantTitle !== product.title && (
                <p className="text-xs text-gray-500">
                  {product.variantTitle}
                </p>
              )}
              <p className="text-lg font-bold text-gray-900">
                ${(product.price / 100).toFixed(2)}
              </p>
              {product.rating && (
                <p className="text-xs text-gray-500">
                  {product.rating} rating · {product.reviews?.toLocaleString()} reviews
                </p>
              )}
            </SheetHeader>

            {/* Zip Code Input for Estimate */}
            <div className="space-y-2">
              <label className="text-xs text-gray-500">
                Enter zip code for shipping estimate
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  placeholder="12345"
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, ''))}
                  className="w-24 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                />
                {isEstimating && (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                )}
              </div>
            </div>

            {/* Cost Breakdown */}
            {estimate && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">${(estimate.subtotal / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax ({estimate.state})</span>
                  <span className="text-gray-900">${(estimate.tax / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Shipping (est.)</span>
                  <span>~${(estimate.shipping / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold pt-1 border-t border-gray-200">
                  <span className="text-gray-900">Estimated Total</span>
                  <span className="text-gray-900">${(estimate.total / 100).toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-gray-400 pt-1">
                  Final amount calculated at checkout
                </p>
              </div>
            )}

            {/* Variants Warning */}
            {product.hasVariants && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
                <span className="text-amber-600 text-xs">⚠</span>
                <span className="text-xs text-amber-700">This product has variants. Checkout is experimental.</span>
              </div>
            )}

            {/* Product Features */}
            {product.features && product.features.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Details</p>
                <div className="space-y-1">
                  {product.features.slice(0, 6).map((feature, i) => (
                    <div key={i} className="flex justify-between text-xs">
                      <span className="text-gray-500">{feature.title}</span>
                      <span className="text-gray-900 text-right max-w-[60%] truncate">{feature.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Competing Prices Table */}
            {product.stores && product.stores.length > 0 && (() => {
              // Check if there are duplicate store names (indicates variants)
              const storeNames = product.stores.map(s => s.name)
              const hasDuplicates = storeNames.length !== new Set(storeNames).size

              return (
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">
                    {hasDuplicates ? 'Available options' : 'Compare prices'}
                  </p>
                  <div className="space-y-1.5">
                    {product.stores.map((store, i) => (
                      <a
                        key={i}
                        href={store.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex justify-between items-start py-1.5 px-2 -mx-2 rounded hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <p className="text-xs text-gray-900">{store.name}</p>
                          {hasDuplicates && store.title && (
                            <p className="text-[10px] text-gray-500 truncate">{store.title}</p>
                          )}
                        </div>
                        <span className="text-xs font-medium text-gray-900 flex-shrink-0">
                          ${(store.price / 100).toFixed(2)}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )
            })()}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                onClick={handleBuy}
                disabled={isLoading}
                className="w-full rounded-full h-10 text-sm font-medium"
              >
                <ShoppingCart className="w-3.5 h-3.5 mr-2" />
                {isLoading ? 'Loading...' : 'Buy Now'}
              </Button>
              <Button
                variant="outline"
                asChild
                className="w-full rounded-full h-10 text-sm font-medium"
              >
                <a href={product.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-3.5 h-3.5 mr-2" />
                  View at {product.retailer}
                </a>
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
