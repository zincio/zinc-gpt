import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { constructWebhookEvent, getStripeClient } from '@/lib/services/stripe'
import { processStripePayment } from '@/lib/services/order-processor'
import { updateOrderZincId } from '@/lib/db/queries'
import { logger } from '@/lib/utils/logger'

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  try {
    const event = constructWebhookEvent(body, signature)

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.payment_status !== 'paid') {
          logger.info('Checkout session not paid, skipping', { sessionId: session.id })
          break
        }

        const stripe = getStripeClient()
        const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ['customer_details'],
        })

        const productUrl = fullSession.metadata?.productUrl
        const shippingDetails = fullSession.shipping_details

        if (!productUrl) {
          logger.error('No product URL in session metadata', { sessionId: session.id })
          break
        }

        if (!shippingDetails?.address) {
          logger.error('No shipping address in session', { sessionId: session.id })
          break
        }

        const result = await processStripePayment({
          checkoutSessionId: session.id,
          productUrl,
          shippingAddress: {
            ...shippingDetails.address,
            name: shippingDetails.name || fullSession.customer_details?.name || undefined,
          },
          phone: fullSession.customer_details?.phone || undefined,
          totalAmountCents: fullSession.amount_total || 0,
        })

        if (result.success && result.zincOrderId) {
          logger.info('Zinc order created successfully', {
            sessionId: session.id,
            zincOrderId: result.zincOrderId,
          })

          const orderId = fullSession.metadata?.orderId
          if (orderId) {
            updateOrderZincId(orderId, result.zincOrderId)
          }
        } else {
          logger.error('Failed to create Zinc order', {
            sessionId: session.id,
            error: result.error,
          })
        }
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        logger.info('Checkout session expired', { sessionId: session.id })
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object
        logger.info('Payment intent succeeded', { paymentIntentId: paymentIntent.id })
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object
        logger.info('Payment intent failed', { paymentIntentId: paymentIntent.id })
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Webhook error', { error: errorMessage })
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    )
  }
}
