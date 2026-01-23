import { v4 as uuidv4 } from 'uuid'
import { db, type OrderRow } from '..'
import type { CartItem } from '@/lib/utils/validation'

export interface CreateOrderParams {
  sessionId?: string
  userId: string
  addressId: string
  products: CartItem[]
  subtotalCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  stripePaymentIntentId?: string
}

export function createOrder(params: CreateOrderParams): OrderRow {
  const id = uuidv4()
  const stmt = db.prepare(`
    INSERT INTO orders (
      id, session_id, user_id, address_id, products,
      subtotal_cents, shipping_cents, tax_cents, total_cents,
      stripe_payment_intent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `)
  return stmt.get(
    id,
    params.sessionId ?? null,
    params.userId,
    params.addressId,
    JSON.stringify(params.products),
    params.subtotalCents,
    params.shippingCents,
    params.taxCents,
    params.totalCents,
    params.stripePaymentIntentId ?? null
  ) as OrderRow
}

export function getOrderById(id: string): OrderRow | undefined {
  const stmt = db.prepare('SELECT * FROM orders WHERE id = ?')
  return stmt.get(id) as OrderRow | undefined
}

export function getOrderByZincId(zincOrderId: string): OrderRow | undefined {
  const stmt = db.prepare('SELECT * FROM orders WHERE zinc_order_id = ?')
  return stmt.get(zincOrderId) as OrderRow | undefined
}

export function getOrdersByUserId(userId: string): OrderRow[] {
  const stmt = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC')
  return stmt.all(userId) as OrderRow[]
}

export function getOrdersBySessionId(sessionId: string): OrderRow[] {
  const stmt = db.prepare('SELECT * FROM orders WHERE session_id = ? ORDER BY created_at DESC')
  return stmt.all(sessionId) as OrderRow[]
}

export function updateOrderZincId(orderId: string, zincOrderId: string): void {
  const stmt = db.prepare('UPDATE orders SET zinc_order_id = ? WHERE id = ?')
  stmt.run(zincOrderId, orderId)
}

export function updateOrderZincStatus(orderId: string, status: string, trackingNumber?: string): void {
  if (trackingNumber) {
    const stmt = db.prepare('UPDATE orders SET zinc_status = ?, tracking_number = ? WHERE id = ?')
    stmt.run(status, trackingNumber, orderId)
  } else {
    const stmt = db.prepare('UPDATE orders SET zinc_status = ? WHERE id = ?')
    stmt.run(status, orderId)
  }
}

export function updateOrderStripeStatus(orderId: string, status: string): void {
  const stmt = db.prepare('UPDATE orders SET stripe_status = ? WHERE id = ?')
  stmt.run(status, orderId)
}

export function getOrderProducts(order: OrderRow): CartItem[] {
  try {
    return JSON.parse(order.products) as CartItem[]
  } catch {
    return []
  }
}
