import crypto from 'crypto'

/**
 * Verify a Zinc v2 webhook signature.
 *
 * Zinc sends `X-Webhook-Signature`: a hex HMAC-SHA256 of the raw request body
 * using the webhook secret from the Zinc dashboard (Settings -> Webhooks).
 * https://www.zinc.com/docs/v2/api-reference/introduction/webhooks
 */
export function verifyZincWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  // Some senders prefix the digest (e.g. "sha256=<hex>"); accept either form.
  const provided = signature.trim().replace(/^sha256=/i, '').toLowerCase()

  const a = Buffer.from(provided, 'utf8')
  const b = Buffer.from(expectedSignature, 'utf8')

  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false

  return crypto.timingSafeEqual(a, b)
}

export function generateSessionId(): string {
  return crypto.randomUUID()
}
