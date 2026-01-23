import Stripe from 'stripe'

// Lazy-load Stripe client to avoid build-time errors
let stripeClient: Stripe | null = null

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const apiKey = process.env.STRIPE_SECRET_KEY
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    stripeClient = new Stripe(apiKey)
  }
  return stripeClient
}

// Export the singleton Stripe instance getter
export { getStripeClient }

interface CreatePaymentIntentParams {
  amount: number // in cents
  currency?: string
  metadata?: Record<string, string>
  orderId?: string
}

export async function createPaymentIntent(params: CreatePaymentIntentParams) {
  const stripe = getStripeClient()
  const { amount, currency = 'usd', metadata = {}, orderId } = params

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: {
      enabled: true,
    },
    metadata: {
      ...metadata,
      orderId: orderId || '',
    },
  })

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  }
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  const stripe = getStripeClient()
  return stripe.paymentIntents.retrieve(paymentIntentId)
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  const stripe = getStripeClient()
  return stripe.paymentIntents.cancel(paymentIntentId)
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripeClient()
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!webhookSecret) {
    throw new Error('Stripe webhook secret not configured')
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret)
}

// Calculate tax estimate (simplified - in production, use a tax API like TaxJar)
export function estimateTax(subtotalCents: number, state: string): number {
  const taxRates: Record<string, number> = {
    CA: 0.0725,
    NY: 0.08,
    TX: 0.0625,
    FL: 0.06,
    WA: 0.065,
    // Add more states as needed
  }

  const rate = taxRates[state.toUpperCase()] || 0.07 // Default 7%
  return Math.round(subtotalCents * rate)
}

// Shipping cost estimates
export interface ShippingEstimate {
  id: string
  name: string
  price: number // in cents
  estimatedDays: string
}

export function getShippingOptions(subtotalCents: number): ShippingEstimate[] {
  const options: ShippingEstimate[] = [
    {
      id: 'standard',
      name: 'Standard Shipping',
      price: subtotalCents >= 3500 ? 0 : 599, // Free over $35
      estimatedDays: '5-7 business days',
    },
    {
      id: 'express',
      name: 'Express Shipping',
      price: 1299,
      estimatedDays: '2-3 business days',
    },
    {
      id: 'overnight',
      name: 'Overnight Shipping',
      price: 2499,
      estimatedDays: '1 business day',
    },
  ]

  return options
}
