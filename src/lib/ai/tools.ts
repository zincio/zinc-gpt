import { z } from 'zod'
import { tool, type InferUITools, type UIDataTypes, type UIMessage } from 'ai'
import { searchProducts, ZincProductsError, type Product } from '@/lib/services/zinc-products'
import { getStripeClient } from '@/lib/services/stripe'
import { moderateSearchQuery } from '@/lib/ai/content-filter'
import { logger } from '@/lib/utils/logger'

export type { Product }

export interface SearchResult {
  products: Product[]
  query: string
  error?: string
}

export interface CheckoutResult {
  url?: string
  error?: string
}

export function createTools(sessionId: string) {
  return {
    search_products: tool({
      description:
        'Search every retailer Zinc supports (Amazon, Walmart, Target, Best Buy, Home Depot, and more) in one call. Returns titles, prices, images, ratings, and an orderable retailer URL for each result. Pass price bounds when the user states a budget.',
      inputSchema: z.object({
        query: z.string().describe('The product search query, without price words (put those in minPrice/maxPrice)'),
        minPrice: z.number().optional().describe('Minimum price in dollars, if the user gave a floor'),
        maxPrice: z.number().optional().describe('Maximum price in dollars, if the user gave a budget'),
        retailer: z
          .string()
          .optional()
          .describe('Restrict results to one retailer slug (e.g. "walmart", "target") only if the user asks for a specific store'),
      }),
      execute: async ({ query, minPrice, maxPrice, retailer }): Promise<SearchResult> => {
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
          const products = await searchProducts({
            query,
            numResults: 6,
            minPriceCents: minPrice !== undefined ? Math.round(minPrice * 100) : undefined,
            maxPriceCents: maxPrice !== undefined ? Math.round(maxPrice * 100) : undefined,
            retailer: retailer?.toLowerCase().trim() || undefined,
          })

          if (products.length === 0) {
            return {
              products: [],
              query,
              error: 'No results matched. Try different terms or loosen the price range.',
            }
          }

          return { products, query }
        } catch (error) {
          logger.error('Search failed', {
            query,
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          if (error instanceof ZincProductsError && error.code === 'insufficient_funds') {
            return {
              products: [],
              query,
              error: 'Product search is temporarily unavailable (the store wallet needs a top-up). Please try again later.',
            }
          }

          return {
            products: [],
            query,
            error: "I couldn't complete the search. Please try again with different terms.",
          }
        }
      },
    }),

    create_checkout: tool({
      description:
        'Create a Stripe checkout session for a product. Use when the user wants to buy something.',
      inputSchema: z.object({
        productTitle: z.string().describe('The product title'),
        productPrice: z.number().describe('The product price in dollars'),
        productImage: z.string().optional().describe('The product image URL'),
        productUrl: z.string().describe('The orderable product URL from search results'),
      }),
      execute: async ({
        productTitle,
        productPrice,
        productImage,
        productUrl,
      }): Promise<CheckoutResult> => {
        try {
          const stripe = getStripeClient()
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

          const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
              {
                price_data: {
                  currency: 'usd',
                  product_data: {
                    name: productTitle,
                    images: productImage ? [productImage] : [],
                  },
                  unit_amount: Math.round(productPrice * 100),
                },
                quantity: 1,
              },
            ],
            mode: 'payment',
            billing_address_collection: 'required',
            shipping_address_collection: {
              allowed_countries: ['US'],
            },
            phone_number_collection: {
              enabled: true,
            },
            success_url: `${baseUrl}?success=true&sessionId=${sessionId}&checkout_session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}?canceled=true&sessionId=${sessionId}`,
            metadata: {
              sessionId,
              productUrl,
              productTitle,
              productPriceCents: String(Math.round(productPrice * 100)),
            },
          })

          return { url: session.url! }
        } catch (error) {
          logger.error('Checkout creation failed', {
            productTitle,
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          return {
            error: 'Failed to create checkout. Please try again.',
          }
        }
      },
    }),
  }
}

export type ShopTools = ReturnType<typeof createTools>

/** UI message type shared by the chat route and the client so tool parts are typed. */
export type ShopUIMessage = UIMessage<unknown, UIDataTypes, InferUITools<ShopTools>>
