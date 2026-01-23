import Stripe from 'stripe'
import { zinc, type ZincAddress, type ZincOrderRequest } from './zinc'
import { logger } from '@/lib/utils/logger'

interface ProcessPaymentParams {
  checkoutSessionId: string
  productUrl: string
  shippingAddress: Stripe.Address & { name?: string }
  phone?: string
  totalAmountCents: number
}

interface ProcessPaymentResult {
  success: boolean
  zincOrderId?: string
  error?: string
}

/**
 * Convert Stripe shipping address to Zinc v2 format
 */
function formatZincAddress(
  address: Stripe.Address & { name?: string },
  phone?: string
): ZincAddress {
  const nameParts = (address.name || 'Customer').split(' ')
  const firstName = nameParts[0] || 'Customer'
  const lastName = nameParts.slice(1).join(' ') || 'Customer'

  return {
    first_name: firstName,
    last_name: lastName,
    address_line1: address.line1 || '',
    address_line2: address.line2 || undefined,
    city: address.city || '',
    state: address.state || '',
    postal_code: address.postal_code || '',
    phone_number: phone || '5555555555',
    country: address.country || 'US',
  }
}

/**
 * Process a successful Stripe payment by creating a Zinc order.
 */
export async function processStripePayment(
  params: ProcessPaymentParams
): Promise<ProcessPaymentResult> {
  const { checkoutSessionId, productUrl, shippingAddress, phone, totalAmountCents } = params

  // Format shipping address for Zinc v2
  const zincAddress = formatZincAddress(shippingAddress, phone)

  // Check if we're in test mode (Stripe test keys)
  const isTestMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')

  // Build Zinc v2 order request
  const orderRequest: ZincOrderRequest = {
    products: [
      {
        url: productUrl,
        quantity: 1,
      },
    ],
    shipping_address: zincAddress,
    // In test mode, max_price = 0 ensures Zinc won't place real orders
    // In production, allow 10% buffer for price fluctuations
    max_price: isTestMode ? 0 : Math.round(totalAmountCents * 1.1),
    idempotency_key: checkoutSessionId.slice(0, 36),
    metadata: {
      stripe_session_id: checkoutSessionId,
      product_url: productUrl,
      amount_cents: String(totalAmountCents),
      source: 'zinc-gpt',
    },
  }

  try {
    logger.info('Creating Zinc order', {
      productUrl,
      maxPrice: orderRequest.max_price,
      testMode: isTestMode,
    })

    const response = await zinc.createOrder(orderRequest)

    logger.info('Zinc order created', {
      orderId: response.id,
      status: response.status,
    })

    return {
      success: true,
      zincOrderId: response.id,
    }
  } catch (error) {
    logger.error('Failed to create Zinc order', {
      error: error instanceof Error ? error.message : 'Unknown error',
      productUrl,
    })

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order',
    }
  }
}
