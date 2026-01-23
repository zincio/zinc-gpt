import { NextResponse } from 'next/server'
import { verifyZincWebhookSignature } from '@/lib/utils/crypto'
import { getOrderByZincId, updateOrderZincStatus } from '@/lib/db/queries'
import { logger } from '@/lib/utils/logger'

interface ZincWebhookPayload {
  _type: string
  request_id: string
  code?: string
  message?: string
  tracking?: Array<{
    carrier: string
    tracking_number: string
    tracking_url: string
    product_ids: string[]
  }>
  delivery?: {
    delivered: boolean
    delivery_date?: string
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('x-zinc-signature') || ''

  // Verify webhook signature if secret is configured
  const webhookSecret = process.env.ZINC_WEBHOOK_SECRET
  if (webhookSecret && signature) {
    const isValid = verifyZincWebhookSignature(body, signature, webhookSecret)
    if (!isValid) {
      logger.error('Invalid Zinc webhook signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  try {
    const payload: ZincWebhookPayload = JSON.parse(body)
    const { _type, request_id } = payload

    logger.info('Zinc webhook received', { type: _type, requestId: request_id })

    // Find order by Zinc request ID
    const order = getOrderByZincId(request_id)
    if (!order) {
      logger.warn('Order not found for Zinc request', { requestId: request_id })
      return NextResponse.json({ received: true })
    }

    switch (_type) {
      case 'request_succeeded':
        updateOrderZincStatus(order.id, 'succeeded')
        break

      case 'request_failed':
        updateOrderZincStatus(order.id, 'failed')
        logger.error('Zinc order failed', { code: payload.code, message: payload.message })
        break

      case 'tracking_obtained':
        if (payload.tracking && payload.tracking.length > 0) {
          const tracking = payload.tracking[0]
          updateOrderZincStatus(order.id, 'shipped', tracking.tracking_number)
        }
        break

      case 'status_updated':
        if (payload.delivery?.delivered) {
          updateOrderZincStatus(order.id, 'delivered')
        }
        break

      default:
        logger.info('Unhandled Zinc webhook type', { type: _type })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logger.error('Zinc webhook error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    )
  }
}
