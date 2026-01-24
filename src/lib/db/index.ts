import Database from 'better-sqlite3'
import { schema } from './schema'
import path from 'path'

let db: Database.Database

try {
  // Try file-based database first
  const dbPath = path.join(process.cwd(), 'data.db')
  db = new Database(dbPath)
} catch {
  // Fall back to in-memory database if file-based fails
  console.warn('File-based SQLite failed, using in-memory database')
  db = new Database(':memory:')
}

// Initialize schema (safe to run multiple times due to IF NOT EXISTS)
db.exec(schema)

export { db }

// Type definitions for database rows
export interface UserRow {
  id: string
  email: string
  name: string | null
  created_at: number
}

export interface AddressRow {
  id: string
  user_id: string
  first_name: string
  last_name: string
  address_line_1: string
  address_line_2: string | null
  city: string
  state: string
  zip_code: string
  country: string
  phone_number: string | null
  is_default: number
}

export interface SessionRow {
  id: string
  user_id: string | null
  state: string
  cart_data: string | null
  created_at: number
}

export interface OrderRow {
  id: string
  session_id: string | null
  user_id: string
  address_id: string
  zinc_order_id: string | null
  zinc_status: string
  stripe_payment_intent_id: string | null
  stripe_status: string
  products: string
  subtotal_cents: number
  shipping_cents: number
  tax_cents: number
  total_cents: number
  tracking_number: string | null
  created_at: number
}
