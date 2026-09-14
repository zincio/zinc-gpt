import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTools, type SearchResult, type CheckoutResult } from '../tools'

// Mock the Zinc products module
vi.mock('@/lib/services/zinc-products', () => ({
  ZincProductsError: class ZincProductsError extends Error {
    constructor(message: string, public status: number, public code?: string) {
      super(message)
    }
  },
  searchProducts: vi.fn().mockResolvedValue([
    {
      id: 'amazon:abcd1234',
      retailer: 'amazon',
      retailerName: 'Amazon',
      title: 'Test Product',
      price: 2999,
      url: 'https://www.amazon.com/dp/B123',
      image: 'https://example.com/image.jpg',
    },
  ]),
}))

// Mock stripe
vi.mock('@/lib/services/stripe', () => ({
  getStripeClient: vi.fn().mockReturnValue({
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
  }),
}))

// Minimal ToolExecutionOptions for invoking tool.execute() directly in tests
const TOOL_OPTS = { toolCallId: 'test', messages: [] } as never

async function run<T>(
  t: { execute?: (input: never, opts: never) => unknown },
  input: unknown
): Promise<T> {
  return (await t.execute!(input as never, TOOL_OPTS)) as T
}

describe('Tools Integration', () => {
  let tools: ReturnType<typeof createTools>

  beforeEach(() => {
    tools = createTools('test-session-id')
    vi.clearAllMocks()
  })

  describe('search_products tool', () => {
    describe('should BLOCK prohibited searches and return error', () => {
      it('blocks "buy me weed" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'buy me weed' })
        expect(result.products).toEqual([])
        expect(result.error).toContain("can't help")
      })

      it('blocks "marijuana" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'marijuana' })
        expect(result.products).toEqual([])
        expect(result.error).toContain('controlled substances')
      })

      it('blocks "buy a gun" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'buy a gun' })
        expect(result.products).toEqual([])
        expect(result.error).toContain('weapons')
      })

      it('blocks "ar-15 rifle" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'ar-15 rifle' })
        expect(result.products).toEqual([])
        expect(result.error).toContain('weapons')
      })

      it('blocks "vodka" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'vodka' })
        expect(result.products).toEqual([])
        expect(result.error).toContain('alcohol')
      })

      it('blocks "buy cigarettes" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'buy cigarettes' })
        expect(result.products).toEqual([])
        expect(result.error).toContain('tobacco')
      })

      it('blocks "xanax" and returns friendly error', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'xanax' })
        expect(result.products).toEqual([])
        expect(result.error).toContain('prescription')
      })
    })

    describe('should ALLOW normal product searches', () => {
      it('allows "wireless headphones" and returns products', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'wireless headphones' })
        expect(result.products.length).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
      })

      it('allows "coffee maker" and returns products', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'coffee maker' })
        expect(result.products.length).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
      })

      it('allows "running shoes" and returns products', async () => {
        const result = await run<SearchResult>(tools.search_products, { query: 'running shoes' })
        expect(result.products.length).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
      })
    })
  })

  describe('create_checkout tool', () => {
    const product = {
      productTitle: 'Test Product',
      productPrice: 29.99,
      productImage: 'https://example.com/image.jpg',
      productUrl: 'https://www.amazon.com/dp/B123',
    }

    it('creates a Stripe checkout session and returns its URL', async () => {
      const result = await run<CheckoutResult>(tools.create_checkout, product)
      expect(result.url).toBe('https://checkout.stripe.com/test')
      expect(result.error).toBeUndefined()
    })

    it('has no price ceiling', async () => {
      const result = await run<CheckoutResult>(tools.create_checkout, {
        ...product,
        productPrice: 1299.0,
      })
      expect(result.url).toBe('https://checkout.stripe.com/test')
    })

    it('returns a friendly error when Stripe fails', async () => {
      const { getStripeClient } = await import('@/lib/services/stripe')
      vi.mocked(getStripeClient).mockReturnValueOnce({
        checkout: { sessions: { create: vi.fn().mockRejectedValue(new Error('boom')) } },
      } as never)
      const result = await run<CheckoutResult>(tools.create_checkout, product)
      expect(result.url).toBeUndefined()
      expect(result.error).toContain('Failed to create checkout')
    })
  })
})
