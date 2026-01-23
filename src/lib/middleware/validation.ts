import { z } from 'zod'

/**
 * Schema for chat request body validation.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(2000, 'Message content too long (max 2000 characters)'),
      })
    )
    .max(50, 'Too many messages (max 50)')
    .min(1, 'At least one message is required'),
  sessionId: z.string().uuid().optional().nullable(),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

/**
 * Validate a chat request body.
 * Returns the validated data or throws a ZodError.
 */
export function validateChatRequest(body: unknown): ChatRequest {
  return chatRequestSchema.parse(body)
}

/**
 * Safe validation that returns a result object instead of throwing.
 */
export function safeParseChatRequest(body: unknown): {
  success: boolean
  data?: ChatRequest
  error?: string
} {
  const result = chatRequestSchema.safeParse(body)

  if (result.success) {
    return { success: true, data: result.data }
  }

  // Format the first error message
  const firstError = result.error.errors[0]
  const errorMessage = firstError
    ? `${firstError.path.join('.')}: ${firstError.message}`
    : 'Invalid request body'

  return { success: false, error: errorMessage }
}

/**
 * Schema for checkout request body validation.
 */
export const checkoutRequestSchema = z.object({
  productTitle: z.string().min(1).max(500),
  productPrice: z.number().positive().max(100, 'Products over $100 are not available'),
  productImage: z.string().url().optional().nullable(),
  productUrl: z.string().url(),
  sessionId: z.string().optional().nullable(),
})

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>

/**
 * Safe validation for checkout requests.
 */
export function safeParseCheckoutRequest(body: unknown): {
  success: boolean
  data?: CheckoutRequest
  error?: string
} {
  const result = checkoutRequestSchema.safeParse(body)

  if (result.success) {
    return { success: true, data: result.data }
  }

  const firstError = result.error.errors[0]
  const errorMessage = firstError
    ? `${firstError.path.join('.')}: ${firstError.message}`
    : 'Invalid request body'

  return { success: false, error: errorMessage }
}
