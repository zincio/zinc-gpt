import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  callZincTool,
  ZincMcpError,
  type McpPayment,
  type McpPlaceOutput,
} from '@/lib/services/zinc-mcp'
import { checkRateLimit, createRateLimitKey, getClientIp, RATE_LIMITS } from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/utils/logger'

/**
 * The only caller of place-order. Reached by the user clicking Pay & place on
 * the review card, never by the model. Zinc verifies the confirmation token is
 * bound to exactly these items and this max price, so a tampered body fails.
 */
const placeSchema = z.object({
  confirmation: z.string().min(1).max(4096),
  order: z.object({
    products: z
      .array(
        z.object({
          url: z.url(),
          quantity: z.number().int().min(1).optional(),
          title: z.string().optional(),
          image: z.string().optional(),
        })
      )
      .min(1)
      .max(20),
    max_price: z.number().int().min(1),
  }),
})

export async function POST(req: Request) {
  const rateLimit = checkRateLimit(createRateLimitKey(getClientIp(req), 'checkout'), RATE_LIMITS.checkout)
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
  }

  const parsed = placeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid order' }, { status: 400 })
  }

  try {
    const { structured } = await callZincTool<McpPlaceOutput>('place-order', parsed.data)
    return NextResponse.json(structured)
  } catch (error) {
    const message = error instanceof ZincMcpError ? error.message : 'Could not place the order.'
    logger.error('Place order failed', { error: message })
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/** Payment status, polled by the review card until the order exists. */
export async function GET(req: Request) {
  const paymentId = new URL(req.url).searchParams.get('payment_id')
  if (!paymentId || paymentId.length > 256) {
    return NextResponse.json({ error: 'Missing payment_id' }, { status: 400 })
  }

  try {
    const { structured } = await callZincTool<McpPayment>('get-payment-status', {
      payment_id: paymentId,
    })
    return NextResponse.json(structured)
  } catch (error) {
    const message = error instanceof ZincMcpError ? error.message : 'Could not check the payment.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
