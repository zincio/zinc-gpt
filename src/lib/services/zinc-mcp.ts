import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logger } from '@/lib/utils/logger'

/**
 * Zinc MCP server, used headlessly: we are the MCP host, so we render our own
 * cards from `structuredContent` instead of the server's ui:// views.
 *
 * https://www.zinc.com/docs/v2/mcp/overview
 *
 * No API key or wallet: search is free and the shopper pays by card on Zinc's
 * payment page, which also collects the shipping address and phone number.
 *
 * `prepare-order` returns a confirmation token in `_meta`. It must never reach
 * the model: only a human click (our /api/order route) may spend it.
 */

export const ZINC_MCP_URL = process.env.ZINC_MCP_URL || 'https://mcp.zinc.com/mcp'
const CALL_TIMEOUT_MS = 30_000

export class ZincMcpError extends Error {
  constructor(message: string, public readonly tool: string) {
    super(message)
    this.name = 'ZincMcpError'
  }
}

interface ToolCallResult<T> {
  structured: T
  /** The server's own text summary of the result, written for a model */
  text: string
  meta: Record<string, unknown>
}

/**
 * Call one Zinc MCP tool. The server is stateless, so each call gets its own
 * short-lived connection rather than a pooled session.
 */
export async function callZincTool<T>(
  name: string,
  args: Record<string, unknown>
): Promise<ToolCallResult<T>> {
  const client = new Client({ name: 'zinc-gpt', version: '0.1.0' })
  const transport = new StreamableHTTPClientTransport(new URL(ZINC_MCP_URL))
  const started = Date.now()

  try {
    await client.connect(transport)
    const result = await client.callTool({ name, arguments: args }, undefined, {
      timeout: CALL_TIMEOUT_MS,
    })

    const text = Array.isArray(result.content)
      ? result.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('\n')
      : ''

    if (result.isError) {
      throw new ZincMcpError(text || `${name} failed`, name)
    }

    logger.info('Zinc MCP call', { tool: name, ms: Date.now() - started })

    return {
      structured: result.structuredContent as T,
      text,
      meta: (result._meta ?? {}) as Record<string, unknown>,
    }
  } catch (error) {
    if (error instanceof ZincMcpError) throw error
    const message = error instanceof Error ? error.message : String(error)
    logger.error('Zinc MCP call failed', { tool: name, error: message })
    throw new ZincMcpError(message, name)
  } finally {
    await client.close().catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Tool shapes (from the server's outputSchema)
// ---------------------------------------------------------------------------

export interface McpSearchResult {
  url: string
  retailer: string
  title: string
  image?: string
  retailer_logo?: string
  brand?: string
  price_cents?: number
  stars?: number
  num_reviews?: number
}

export interface McpSearchOutput {
  query: string
  retailers?: string[]
  results: McpSearchResult[]
  result_count: number
  environment: 'sandbox' | 'live'
}

export interface McpOrderProduct {
  url: string
  quantity: number
  title?: string
  image?: string
  price_cents?: number
  retailer_logo?: string
}

export interface McpQuote {
  listed_price_cents: number
  estimated_tax_cents: number
  shipping_cents: number
  order_fee_cents: number
  estimated_total_cents: number
  hold_cents: number
}

export interface McpPrepareOutput {
  products: McpOrderProduct[]
  max_price_cents: number
  max_price_display: string
  quote: McpQuote | null
  can_place: boolean
  environment: 'sandbox' | 'live'
}

/** What place-order needs back, exactly as prepare-order issued it. */
export interface McpPendingOrder {
  confirmation: string
  order: {
    products: { url: string; quantity?: number; title?: string; image?: string }[]
    max_price: number
  }
}

export interface McpPayment {
  payment_id: string
  status: string
  order_id: string | null
  pay_url: string | null
  expires_at: string | null
  hold_cents: number | null
  failure: string | null
}

export interface McpPlaceOutput {
  status: string
  order_id: string | null
  max_price_cents: number
  payment: McpPayment | null
}

/** Pull the confirmation token and bound order out of a prepare-order result. */
export function pendingOrderFromMeta(meta: Record<string, unknown>): McpPendingOrder | null {
  const confirmation = meta.confirmation
  const order = meta.order as McpPendingOrder['order'] | undefined
  if (typeof confirmation !== 'string' || !order?.products?.length) return null
  return { confirmation, order }
}
