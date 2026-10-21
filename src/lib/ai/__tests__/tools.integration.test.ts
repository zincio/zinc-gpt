import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTools, type SearchResult, type PrepareOrderResult } from '../tools'

vi.mock('@/lib/services/zinc-products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/zinc-products')>()),
  listRetailers: vi.fn().mockResolvedValue([{ retailer: 'amazon', displayName: 'Amazon' }]),
}))

const searchOutput = {
  structured: {
    query: 'test',
    results: [
      {
        url: 'https://www.amazon.com/dp/B123',
        retailer: 'amazon',
        title: 'Test Product',
        image: 'https://example.com/image.jpg',
        price_cents: 2999,
        stars: 4.5,
      },
    ],
    result_count: 1,
    environment: 'live',
  },
  text: '',
  meta: {},
}

const prepareOutput = {
  structured: {
    products: [{ url: 'https://www.amazon.com/dp/B123', quantity: 1, title: 'Test Product', price_cents: 2999 }],
    max_price_cents: 4100,
    max_price_display: '$41.00',
    quote: {
      listed_price_cents: 2999,
      estimated_tax_cents: 300,
      shipping_cents: 0,
      order_fee_cents: 100,
      estimated_total_cents: 3399,
      hold_cents: 3600,
    },
    can_place: true,
    environment: 'live',
  },
  text: 'Ready to review: 1 item(s), about $33.99.',
  meta: {
    confirmation: 'secret-token',
    order: { products: [{ url: 'https://www.amazon.com/dp/B123', quantity: 1 }], max_price: 4100 },
  },
}

vi.mock('@/lib/services/zinc-mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/zinc-mcp')>()),
  callZincTool: vi.fn(async (name: string) => (name === 'prepare-order' ? prepareOutput : searchOutput)),
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

  describe('prepare_order tool', () => {
    const product = {
      productTitle: 'Test Product',
      productPrice: 29.99,
      productImage: 'https://example.com/image.jpg',
      productUrl: 'https://www.amazon.com/dp/B123',
      retailerName: 'Amazon',
    }

    it('returns the quote and the confirmation for the card', async () => {
      const result = await run<PrepareOrderResult>(tools.prepare_order, product)
      expect(result.error).toBeUndefined()
      expect(result.quote?.estimated_total_cents).toBe(3399)
      expect(result.pending?.confirmation).toBe('secret-token')
    })

    it('never shows the confirmation token to the model', async () => {
      const output = await run<PrepareOrderResult>(tools.prepare_order, product)
      const forModel = await tools.prepare_order.toModelOutput!({
        toolCallId: 'test',
        input: product,
        output,
      } as never)
      expect(JSON.stringify(forModel)).not.toContain('secret-token')
    })

    it('returns a friendly error when Zinc fails', async () => {
      const { callZincTool } = await import('@/lib/services/zinc-mcp')
      vi.mocked(callZincTool).mockRejectedValueOnce(new Error('Out of stock'))
      const result = await run<PrepareOrderResult>(tools.prepare_order, product)
      expect(result.pending).toBeUndefined()
      expect(result.error).toContain('Out of stock')
    })
  })
})
