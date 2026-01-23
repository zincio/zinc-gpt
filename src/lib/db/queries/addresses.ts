import { v4 as uuidv4 } from 'uuid'
import { db, type AddressRow } from '..'
import type { Address } from '@/lib/utils/validation'

export function createAddress(userId: string, address: Address): AddressRow {
  const id = uuidv4()
  const stmt = db.prepare(`
    INSERT INTO addresses (
      id, user_id, first_name, last_name, address_line_1, address_line_2,
      city, state, zip_code, country, phone_number, is_default
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `)
  return stmt.get(
    id,
    userId,
    address.firstName,
    address.lastName,
    address.addressLine1,
    address.addressLine2 ?? null,
    address.city,
    address.state,
    address.zipCode,
    address.country ?? 'US',
    address.phoneNumber ?? null,
    0
  ) as AddressRow
}

export function getAddressById(id: string): AddressRow | undefined {
  const stmt = db.prepare('SELECT * FROM addresses WHERE id = ?')
  return stmt.get(id) as AddressRow | undefined
}

export function getAddressesByUserId(userId: string): AddressRow[] {
  const stmt = db.prepare('SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, created_at DESC')
  return stmt.all(userId) as AddressRow[]
}

export function getDefaultAddress(userId: string): AddressRow | undefined {
  const stmt = db.prepare('SELECT * FROM addresses WHERE user_id = ? AND is_default = 1')
  return stmt.get(userId) as AddressRow | undefined
}

export function setDefaultAddress(userId: string, addressId: string): void {
  const resetStmt = db.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?')
  resetStmt.run(userId)

  const setStmt = db.prepare('UPDATE addresses SET is_default = 1 WHERE id = ? AND user_id = ?')
  setStmt.run(addressId, userId)
}

export function addressToZincFormat(address: AddressRow) {
  return {
    first_name: address.first_name,
    last_name: address.last_name,
    address_line1: address.address_line_1,
    address_line2: address.address_line_2 || '',
    zip_code: address.zip_code,
    city: address.city,
    state: address.state,
    country: address.country,
    phone_number: address.phone_number || '',
  }
}
