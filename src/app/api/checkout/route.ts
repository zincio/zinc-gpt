import { NextResponse } from 'next/server'
import { getStripeClient } from '@/lib/services/stripe'
import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { productTitle, productPrice, productImage, productUrl, sessionId } = body

    if (!productTitle || !productPrice) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const stripe = getStripeClient()
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const sessionParam = sessionId ? `&sessionId=${sessionId}` : ''

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
      success_url: `${baseUrl}?success=true${sessionParam}&checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}?canceled=true${sessionParam}`,
      metadata: {
        productUrl: productUrl || '',
        sessionId: sessionId || '',
        productTitle: productTitle || '',
        productPriceCents: String(Math.round(productPrice * 100)),
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    logger.error('Checkout error', { error: error instanceof Error ? error.message : 'Unknown error' })
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
