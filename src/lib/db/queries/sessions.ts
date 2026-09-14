import { v4 as uuidv4 } from 'uuid'
import { db, type SessionRow } from '..'
import type { CartItem } from '@/lib/utils/validation'

export type SessionState = 'browsing' | 'collecting_info' | 'checkout' | 'completed'

export function createSession(userId?: string, id: string = uuidv4()): SessionRow {
  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, state, cart_data)
    VALUES (?, ?, 'browsing', '[]')
    RETURNING *
  `)
  return stmt.get(id, userId ?? null) as SessionRow
}

export function getSessionById(id: string): SessionRow | undefined {
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
  return stmt.get(id) as SessionRow | undefined
}

export function updateSessionState(id: string, state: SessionState): void {
  const stmt = db.prepare('UPDATE sessions SET state = ? WHERE id = ?')
  stmt.run(state, id)
}

export function updateSessionUserId(id: string, userId: string): void {
  const stmt = db.prepare('UPDATE sessions SET user_id = ? WHERE id = ?')
  stmt.run(userId, id)
}

export function getSessionCart(id: string): CartItem[] {
  const session = getSessionById(id)
  if (!session?.cart_data) return []
  try {
    return JSON.parse(session.cart_data) as CartItem[]
  } catch {
    return []
  }
}

export function updateSessionCart(id: string, cart: CartItem[]): void {
  const stmt = db.prepare('UPDATE sessions SET cart_data = ? WHERE id = ?')
  stmt.run(JSON.stringify(cart), id)
}

export function addToCart(sessionId: string, item: CartItem): CartItem[] {
  const cart = getSessionCart(sessionId)
  const existingIndex = cart.findIndex(i => i.product.id === item.product.id)

  if (existingIndex >= 0) {
    cart[existingIndex].quantity += item.quantity
  } else {
    cart.push(item)
  }

  updateSessionCart(sessionId, cart)
  return cart
}

export function removeFromCart(sessionId: string, productId: string): CartItem[] {
  const cart = getSessionCart(sessionId).filter(i => i.product.id !== productId)
  updateSessionCart(sessionId, cart)
  return cart
}

export function updateCartItemQuantity(sessionId: string, productId: string, quantity: number): CartItem[] {
  const cart = getSessionCart(sessionId)
  const item = cart.find(i => i.product.id === productId)

  if (item) {
    if (quantity <= 0) {
      return removeFromCart(sessionId, productId)
    }
    item.quantity = quantity
    updateSessionCart(sessionId, cart)
  }

  return cart
}

export function clearCart(sessionId: string): void {
  updateSessionCart(sessionId, [])
}

export function getCartSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
}
