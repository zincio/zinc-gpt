import { logger } from '@/lib/utils/logger'

const ZINC_API_URL = 'https://api.zinc.com'

interface ZincAddress {
  first_name: string
  last_name: string
  address_line1: string
  address_line2?: string
  city: string
  state: string
  postal_code: string
  phone_number: string
  country?: string
}

interface ZincProduct {
  url: string
  quantity?: number
  variant?: Array<{ label: string; value: string }>
}

interface ZincOrderRequest {
  products: ZincProduct[]
  shipping_address: ZincAddress
  max_price: number
  idempotency_key?: string
  retailer_credentials_id?: string
  metadata?: Record<string, string>
}

interface ZincOrderResponse {
  id: string
  status: string
  items?: Array<{
    product_url: string
    quantity: number
    price?: number
  }>
  shipping_address?: ZincAddress
  created_at?: string
  updated_at?: string
}

interface ZincError {
  code: string
  message: string
  details?: Record<string, string>
}

class ZincClient {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ZINC_API_KEY || ''
    if (!this.apiKey) {
      logger.warn('Zinc API key not configured')
    }
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }
  }

  async createOrder(order: ZincOrderRequest): Promise<ZincOrderResponse> {
    const response = await fetch(`${ZINC_API_URL}/orders`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(order),
    })

    const data = await response.json()

    if (!response.ok) {
      const error = data as ZincError
      throw new Error(error.message || `Zinc API error: ${error.code}`)
    }

    return data as ZincOrderResponse
  }

  async getOrder(orderId: string): Promise<ZincOrderResponse> {
    const response = await fetch(`${ZINC_API_URL}/orders/${orderId}`, {
      method: 'GET',
      headers: this.headers,
    })

    const data = await response.json()

    if (!response.ok) {
      const error = data as ZincError
      throw new Error(error.message || `Zinc API error: ${error.code}`)
    }

    return data as ZincOrderResponse
  }

  async cancelOrder(orderId: string): Promise<void> {
    const response = await fetch(`${ZINC_API_URL}/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: this.headers,
    })

    if (!response.ok) {
      const data = await response.json() as ZincError
      throw new Error(data.message || `Zinc API error: ${data.code}`)
    }
  }
}

// Export singleton instance
export const zinc = new ZincClient()

// Export types
export type {
  ZincAddress,
  ZincProduct,
  ZincOrderRequest,
  ZincOrderResponse,
}
