import { v4 as uuidv4 } from 'uuid'
import { db, type UserRow } from '..'

export function createUser(email: string, name?: string): UserRow {
  const id = uuidv4()
  const stmt = db.prepare(`
    INSERT INTO users (id, email, name)
    VALUES (?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET name = COALESCE(excluded.name, name)
    RETURNING *
  `)
  return stmt.get(id, email, name ?? null) as UserRow
}

export function getUserById(id: string): UserRow | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
  return stmt.get(id) as UserRow | undefined
}

export function getUserByEmail(email: string): UserRow | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE email = ?')
  return stmt.get(email) as UserRow | undefined
}

export function getOrCreateUser(email: string, name?: string): UserRow {
  const existing = getUserByEmail(email)
  if (existing) {
    if (name && !existing.name) {
      const updateStmt = db.prepare('UPDATE users SET name = ? WHERE id = ?')
      updateStmt.run(name, existing.id)
      return { ...existing, name }
    }
    return existing
  }
  return createUser(email, name)
}
