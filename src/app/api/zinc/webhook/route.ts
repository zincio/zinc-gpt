import { NextResponse } from 'next/server'
import { verifyZincWebhookSignature } from '@/lib/utils/crypto'
import { getOrderByZincId, updateOrderZincStatus } from '@/lib/db/queries'
import { logger } from '@/lib/utils/logger'
import type { ZincOrderStatus } from '@/lib/services/zinc'

/**
 * Zinc v2 webhook payload.
 * https://www.zinc.com/docs/v2/api-reference/introduction/webhooks
 */
type ZincWebhookEvent =
  | 'order.started'
  | 'order.placed'
  | 'order.failed'
  | 'order.tracking_received'
  | 'order.delivered'
  | 'order.cancelled'
  | 'return.created'
  | 'return.approved'
  | 'return.denied'
  | 'return.credited'

interface ZincTrackingNumber {
  id?: string
  carrier: string
  tracking_number: string
  delivered_at?: string
}

interface ZincWebhookPayload {
  event: ZincWebhookEvent | string
  order_id: string
  return_id: string | null
  status: ZincOrderStatus | string
  timestamp: string
  data: {
    price_components?: { subtotal: number; shipping: number; tax: number; total: number }
    error_type?: string
    error?: string
    tracking_numbers?: ZincTrackingNumber[]
    reason?: string
    merchant_order_id?: string
    refund_amount?: number
    [key: string]: unknown
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-webhook-signature') || ''

  // Verify webhook signature when a secret is configured
  const webhookSecret = process.env.ZINC_WEBHOOK_SECRET
  if (webhookSecret) {
    if (!signature || !verifyZincWebhookSignature(body, signature, webhookSecret)) {
      logger.error('Invalid Zinc webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: ZincWebhookPayload
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const { event, order_id: zincOrderId, status } = payload

    logger.info('Zinc webhook received', { event, zincOrderId, status })

    if (!zincOrderId) {
      return NextResponse.json({ received: true })
    }

    // Find our order by the Zinc order ID
    const order = getOrderByZincId(zincOrderId)
    if (!order) {
      logger.warn('Order not found for Zinc order', { zincOrderId, event })
      return NextResponse.json({ received: true })
    }

    switch (event) {
      case 'order.started':
        updateOrderZincStatus(order.id, 'in_progress')
        break

      case 'order.placed':
        updateOrderZincStatus(order.id, 'placed')
        logger.info('Zinc order placed', {
          orderId: order.id,
          priceComponents: payload.data?.price_components,
        })
        break

      case 'order.failed':
        updateOrderZincStatus(order.id, 'failed')
        logger.error('Zinc order failed', {
          orderId: order.id,
          errorType: payload.data?.error_type,
          error: payload.data?.error,
        })
        break

      case 'order.tracking_received': {
        const tracking = payload.data?.tracking_numbers?.[0]
        updateOrderZincStatus(order.id, 'shipped', tracking?.tracking_number)
        break
      }

      case 'order.delivered':
        updateOrderZincStatus(order.id, 'delivered')
        break

      case 'order.cancelled':
        updateOrderZincStatus(order.id, 'cancelled')
        logger.info('Zinc order cancelled', {
          orderId: order.id,
          reason: payload.data?.reason,
          refundAmount: payload.data?.refund_amount,
        })
        break

      default:
        logger.info('Unhandled Zinc webhook event', { event })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Zinc webhook error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    )
  }
}
