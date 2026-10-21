import { z } from 'zod'
import { tool, type InferUITools, type UIDataTypes, type UIMessage } from 'ai'
import { listRetailers, normalizeTitle, type Product } from '@/lib/services/zinc-products'
import {
  callZincTool,
  pendingOrderFromMeta,
  type McpPendingOrder,
  type McpPrepareOutput,
  type McpQuote,
  type McpSearchOutput,
} from '@/lib/services/zinc-mcp'
import { moderateSearchQuery } from '@/lib/ai/content-filter'
import { logger } from '@/lib/utils/logger'

export type { Product }

export interface SearchResult {
  products: Product[]
  query: string
  error?: string
}

export interface PrepareOrderResult {
  product?: {
    title: string
    url: string
    image?: string
    retailerName: string
    priceCents: number
    quantity: number
  }
  quote?: McpQuote
  maxPriceDisplay?: string
  /**
   * Token + bound order for place-order. Goes to the browser (like the MCP
   * card) but is stripped from what the model sees by toModelOutput.
   */
  pending?: McpPendingOrder
  /** The server's own summary, for the model */
  summary?: string
  error?: string
}

const NUM_RESULTS = 6

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

async function retailerLabels(): Promise<Map<string, string>> {
  try {
    const list = await listRetailers()
    return new Map(list.map((r) => [r.retailer, r.displayName]))
  } catch {
    return new Map()
  }
}

function productId(retailer: string, url: string): string {
  // FNV-1a 32-bit over the URL: stable, short, and good enough as a React key
  let hash = 0x811c9dc5
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${retailer}:${hash.toString(16).padStart(8, '0')}`
}

export function createTools(_sessionId: string) {
  return {
    search_products: tool({
      description:
        'Search every retailer Zinc supports (Amazon, Walmart, Target, Best Buy, Home Depot, and more) in one call via the Zinc MCP server. Returns titles, prices, images, ratings, and an orderable retailer URL for each result. Pass price bounds when the user states a budget.',
      inputSchema: z.object({
        query: z.string().describe('The product search query, without price words (put those in minPrice/maxPrice)'),
        minPrice: z.number().optional().describe('Minimum price in dollars, if the user gave a floor'),
        maxPrice: z.number().optional().describe('Maximum price in dollars, if the user gave a budget'),
        retailers: z
          .array(z.string())
          .max(10)
          .optional()
          .describe(
            'Only when the user names specific stores: retailer slugs (e.g. ["walmart", "target"]), "etsy", or Shopify store domains (e.g. "allbirds.com", at most 3 stores). Omit to search everywhere.'
          ),
        sort: z
          .enum(['relevance', 'price_asc', 'price_desc', 'rating'])
          .optional()
          .describe('Use price_asc for "cheapest", price_desc for "most expensive"/"premium", rating for "best rated". Default relevance.'),
      }),
      execute: async ({ query, minPrice, maxPrice, retailers, sort }): Promise<SearchResult> => {
        // Content moderation check
        const moderation = moderateSearchQuery(query)
        if (!moderation.allowed) {
          return {
            products: [],
            query,
            error: moderation.reason,
          }
        }

        try {
          const stores = retailers?.map((r) => r.toLowerCase().trim()).filter(Boolean)
          const [{ structured }, labels] = await Promise.all([
            callZincTool<McpSearchOutput>('search-products', {
              query,
              ...(stores?.length ? { retailers: stores } : {}),
            }),
            retailerLabels(),
          ])

          // The MCP search has no price or sort parameters, so apply them to its
          // (up to 20, best-first) results here.
          const min = minPrice !== undefined ? Math.round(minPrice * 100) : undefined
          const max = maxPrice !== undefined ? Math.round(maxPrice * 100) : undefined
          let results = (structured.results ?? []).filter((r) => {
            if (!r.price_cents || r.price_cents <= 0) return false
            if (min !== undefined && r.price_cents < min) return false
            if (max !== undefined && r.price_cents > max) return false
            return true
          })
          if (sort === 'price_asc') results = [...results].sort((a, b) => a.price_cents! - b.price_cents!)
          if (sort === 'price_desc') results = [...results].sort((a, b) => b.price_cents! - a.price_cents!)
          if (sort === 'rating') results = [...results].sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))

          // Collapse colour/size variants of one listing so they don't fill the list
          const seenTitles = new Set<string>()
          results = results.filter((r) => {
            const key = `${r.retailer}:${normalizeTitle(r.title)}`
            if (seenTitles.has(key)) return false
            seenTitles.add(key)
            return true
          })

          const products: Product[] = results.slice(0, NUM_RESULTS).map((r) => ({
            id: productId(r.retailer, r.url),
            retailer: r.retailer,
            retailerName: labels.get(r.retailer) ?? titleCase(r.retailer),
            title: r.title,
            price: r.price_cents!,
            url: r.url,
            image: r.image,
            brand: r.brand,
            rating: r.stars,
            reviews: r.num_reviews,
          }))

          if (products.length === 0) {
            return {
              products: [],
              query,
              error: 'No results matched. Try different terms or loosen the price range.',
            }
          }

          return { products, query }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error'
          logger.error('Search failed', { query, error: message })

          // An unknown store comes back as an error listing the accepted ones
          if (retailers?.length && /retailer|store|accepted/i.test(message)) {
            return { products: [], query, error: message }
          }

          return {
            products: [],
            query,
            error: "I couldn't complete the search. Please try again with different terms.",
          }
        }
      },
    }),

    prepare_order: tool({
      description:
        'Prepare an order for one product so the user can review the estimated total and pay. Spends nothing: the user confirms with the Pay & place button on the card, and enters their card, shipping address and phone number on the payment page.',
      inputSchema: z.object({
        productUrl: z.string().describe('The orderable product URL from search results'),
        productTitle: z.string().describe('The product title from search results'),
        productImage: z.string().optional().describe('The image URL from search results, verbatim'),
        productPrice: z.number().describe('The listed price in dollars from search results'),
        retailerName: z.string().optional().describe('The retailer display name from search results'),
        quantity: z.number().int().min(1).max(9).optional(),
        maxPrice: z
          .number()
          .optional()
          .describe('Hard cap in dollars including tax and shipping. Only if the user named a budget for this order.'),
      }),
      execute: async ({
        productUrl,
        productTitle,
        productImage,
        productPrice,
        retailerName,
        quantity = 1,
        maxPrice,
      }): Promise<PrepareOrderResult> => {
        const moderation = moderateSearchQuery(productTitle)
        if (!moderation.allowed) return { error: moderation.reason }

        try {
          const { structured, text, meta } = await callZincTool<McpPrepareOutput>('prepare-order', {
            products: [
              {
                url: productUrl,
                quantity,
                title: productTitle,
                ...(productImage ? { image: productImage } : {}),
                price_cents: Math.round(productPrice * 100),
              },
            ],
            ...(maxPrice !== undefined ? { max_price: Math.round(maxPrice * 100) } : {}),
          })

          const pending = pendingOrderFromMeta(meta)
          const item = structured.products?.[0]
          if (!pending || !item || !structured.can_place) {
            return { error: text || 'This order cannot be placed right now.' }
          }

          let host = retailerName
          if (!host) {
            try {
              host = titleCase(new URL(productUrl).hostname.replace(/^www\./, '').split('.')[0])
            } catch {
              host = 'the retailer'
            }
          }

          return {
            product: {
              title: item.title ?? productTitle,
              url: item.url,
              image: item.image ?? productImage,
              retailerName: host,
              priceCents: item.price_cents ?? Math.round(productPrice * 100),
              quantity: item.quantity,
            },
            quote: structured.quote ?? undefined,
            maxPriceDisplay: structured.max_price_display,
            pending,
            summary: text,
          }
        } catch (error) {
          logger.error('Prepare order failed', {
            productUrl,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          return {
            error: error instanceof Error ? error.message : 'Could not prepare the order. Please try again.',
          }
        }
      },
      // The confirmation token is for the human's click only; never show it to the model.
      toModelOutput: ({ output }) => ({
        type: 'text',
        value: output.error ?? output.summary ?? 'Ready to review. The user must click Pay & place.',
      }),
    }),
  }
}

export type ShopTools = ReturnType<typeof createTools>

/** UI message type shared by the chat route and the client so tool parts are typed. */
export type ShopUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<ShopTools>>
