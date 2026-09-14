import { z } from 'zod'

const MAX_MESSAGES = 50
const MAX_TEXT_CHARS = 4000

/**
 * Loose schema for an AI SDK UIMessage. Tool parts are validated separately by
 * `validateUIMessages` against the real tool schemas in the chat route.
 */
const uiMessageSchema = z.looseObject({
  id: z.string().min(1).max(128),
  role: z.enum(['user', 'assistant', 'system']),
  parts: z.array(z.looseObject({ type: z.string() })).max(100),
})

/**
 * Schema for chat request body validation.
 */
export const chatRequestSchema = z.object({
  messages: z
    .array(uiMessageSchema)
    .min(1, 'At least one message is required')
    .max(MAX_MESSAGES, `Too many messages (max ${MAX_MESSAGES})`)
    .refine(
      (messages) =>
        messages.every((message) => {
          const textLength = message.parts.reduce((sum, part) => {
            const text = (part as { text?: unknown }).text
            return sum + (typeof text === 'string' ? text.length : 0)
          }, 0)
          return textLength <= MAX_TEXT_CHARS
        }),
      { message: `Message content too long (max ${MAX_TEXT_CHARS} characters)` }
    ),
  sessionId: z.uuid().optional().nullable(),
})

export type ChatRequest = z.infer<typeof chatRequestSchema>

function formatFirstIssue(error: z.ZodError): string {
  const firstIssue = error.issues[0]
  return firstIssue
    ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
    : 'Invalid request body'
}

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

  return { success: false, error: formatFirstIssue(result.error) }
}

/**
 * Schema for checkout request body validation.
 */
export const checkoutRequestSchema = z.object({
  productTitle: z.string().min(1).max(500),
  productPrice: z.number().positive(),
  productImage: z.url().optional().nullable(),
  productUrl: z.url(),
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

  return { success: false, error: formatFirstIssue(result.error) }
}
