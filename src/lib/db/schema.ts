export const schema = `
-- Sessions (conversation state)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  state TEXT DEFAULT 'browsing',
  cart_data TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Users (identified by email)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Addresses (multiple per user)
CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip_code TEXT NOT NULL,
  country TEXT DEFAULT 'US',
  phone_number TEXT,
  is_default INTEGER DEFAULT 0
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  address_id TEXT NOT NULL REFERENCES addresses(id),
  zinc_order_id TEXT UNIQUE,
  zinc_status TEXT DEFAULT 'pending',
  stripe_payment_intent_id TEXT,
  stripe_status TEXT DEFAULT 'pending',
  products TEXT NOT NULL,
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER DEFAULT 0,
  tax_cents INTEGER DEFAULT 0,
  total_cents INTEGER NOT NULL,
  tracking_number TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_zinc_order_id ON orders(zinc_order_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`
