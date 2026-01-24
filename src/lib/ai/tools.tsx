import { z } from 'zod'
import { tool } from 'ai'
import { searchProducts, type Product } from '@/lib/services/serpapi'
import { getStripeClient } from '@/lib/services/stripe'
import { moderateSearchQuery } from '@/lib/ai/content-filter'
import { logger } from '@/lib/utils/logger'

export type { Product }

const MAX_PRICE_DOLLARS = 100

interface SearchResult {
  products: Product[]
  query: string
  error?: string
}

export function createTools(sessionId: string) {
  return {
    search_products: tool({
      description: 'Search for products across major retailers. Returns product images, titles, prices.',
      parameters: z.object({
        query: z.string().describe('The search query for products'),
      }),
      execute: async ({ query }): Promise<SearchResult> => {
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
          const products = await searchProducts({ query, numResults: 6 })

          // Filter out products over the price limit
          const affordableProducts = products.filter(
            (p) => p.price <= MAX_PRICE_DOLLARS * 100
          )

          if (products.length > 0 && affordableProducts.length === 0) {
            return {
              products: [],
              query,
              error: `All results were over the $${MAX_PRICE_DOLLARS} purchase limit. Try searching for a more budget-friendly option.`,
            }
          }

          return { products: affordableProducts, query }
        } catch (error) {
          logger.error('Search failed', {
            query,
            error: error instanceof Error ? error.message : 'Unknown error',
          })

          return {
            products: [],
            query,
            error: "I couldn't complete the search. Please try again with different terms.",
          }
        }
      },
    }),

    create_checkout: tool({
      description: 'Create a checkout session for a product. Use when user wants to buy something.',
      parameters: z.object({
        productTitle: z.string().describe('The product title'),
        productPrice: z.number().describe('The product price in dollars'),
        productImage: z.string().optional().describe('The product image URL'),
        productUrl: z.string().describe('The product URL'),
      }),
      execute: async ({
        productTitle,
        productPrice,
        productImage,
        productUrl,
      }): Promise<{ url?: string; error?: string }> => {
        // Price limit check
        if (productPrice > MAX_PRICE_DOLLARS) {
          return {
            error: `This product costs $${productPrice.toFixed(2)}, which is over the $${MAX_PRICE_DOLLARS} purchase limit. Please choose a different product.`,
          }
        }

        try {
          const stripe = getStripeClient()

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
            success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?success=true&sessionId=${sessionId}`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}?canceled=true&sessionId=${sessionId}`,
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
