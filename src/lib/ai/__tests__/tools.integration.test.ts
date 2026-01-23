import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTools } from '../tools'

// Mock the serpapi module
vi.mock('@/lib/services/serpapi', () => ({
  searchProducts: vi.fn().mockResolvedValue([
    {
      id: '1',
      title: 'Test Product',
      price: 2999,
      url: 'https://amazon.com/dp/B123',
      image: 'https://example.com/image.jpg',
      retailer: 'Amazon',
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

describe('Tools Integration', () => {
  let tools: ReturnType<typeof createTools>

  beforeEach(() => {
    tools = createTools('test-session-id')
    vi.clearAllMocks()
  })

  describe('search_products tool', () => {
    describe('should BLOCK prohibited searches and return error', () => {
      it('blocks "buy me weed" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'buy me weed' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain("can't help")
      })

      it('blocks "marijuana" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'marijuana' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain('controlled substances')
      })

      it('blocks "buy a gun" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'buy a gun' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain('weapons')
      })

      it('blocks "ar-15 rifle" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'ar-15 rifle' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain('weapons')
      })

      it('blocks "vodka" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'vodka' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain('alcohol')
      })

      it('blocks "buy cigarettes" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'buy cigarettes' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain('tobacco')
      })

      it('blocks "xanax" and returns friendly error', async () => {
        const result = await tools.search_products.execute(
          { query: 'xanax' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products).toEqual([])
        expect(result.error).toContain('prescription')
      })
    })

    describe('should ALLOW normal product searches', () => {
      it('allows "wireless headphones" and returns products', async () => {
        const result = await tools.search_products.execute(
          { query: 'wireless headphones' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products.length).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
      })

      it('allows "coffee maker" and returns products', async () => {
        const result = await tools.search_products.execute(
          { query: 'coffee maker' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products.length).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
      })

      it('allows "running shoes" and returns products', async () => {
        const result = await tools.search_products.execute(
          { query: 'running shoes' },
          { toolCallId: 'test', messages: [], abortSignal: undefined as any }
        )
        expect(result.products.length).toBeGreaterThan(0)
        expect(result.error).toBeUndefined()
      })
    })
  })

  describe('create_checkout tool', () => {
    it('blocks products over $100 limit', async () => {
      const result = await tools.create_checkout.execute(
        {
          productTitle: 'Expensive Item',
          productPrice: 150,
          productUrl: 'https://amazon.com/dp/B123',
        },
        { toolCallId: 'test', messages: [], abortSignal: undefined as any }
      )
      expect(result.url).toBeUndefined()
      expect(result.error).toContain('$100')
      expect(result.error).toContain('purchase limit')
    })

    it('allows products under $100 limit', async () => {
      const result = await tools.create_checkout.execute(
        {
          productTitle: 'Affordable Item',
          productPrice: 29.99,
          productUrl: 'https://amazon.com/dp/B123',
        },
        { toolCallId: 'test', messages: [], abortSignal: undefined as any }
      )
      expect(result.url).toBeDefined()
      expect(result.error).toBeUndefined()
    })
  })
})
