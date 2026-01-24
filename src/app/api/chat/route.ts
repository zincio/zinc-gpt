import { NextResponse } from 'next/server'
import { streamText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { createTools } from '@/lib/ai/tools'
import { createSession, getSessionById } from '@/lib/db/queries'
import { safeParseChatRequest } from '@/lib/middleware/validation'
import {
  checkRateLimit,
  RATE_LIMITS,
  getClientIp,
  createRateLimitKey,
} from '@/lib/middleware/rate-limit'
import { logger } from '@/lib/utils/logger'

export const maxDuration = 60

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(req: Request) {
  // Rate limiting
  const clientIp = getClientIp(req)
  const rateLimitKey = createRateLimitKey(clientIp, 'chat')
  const rateLimit = checkRateLimit(rateLimitKey, RATE_LIMITS.chat)

  if (!rateLimit.allowed) {
    logger.info('Rate limit exceeded', { ip: clientIp, endpoint: 'chat' })
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfterSeconds || 60),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimit.resetTime),
        },
      }
    )
  }

  // Parse and validate request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 }
    )
  }

  const validation = safeParseChatRequest(body)
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error },
      { status: 400 }
    )
  }

  const { messages, sessionId: existingSessionId } = validation.data!

  // Get or create session (resilient to SQLite failures)
  let sessionId = existingSessionId || `fallback-${Date.now()}`
  try {
    if (!existingSessionId || !getSessionById(existingSessionId)) {
      const session = createSession()
      sessionId = session.id
    }
  } catch {
    // Continue with fallback sessionId
  }

  // Create tools with session context
  const tools = createTools(sessionId)

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-20250514'),
      system: SYSTEM_PROMPT,
      messages,
      tools,
      maxSteps: 5, // Allow multiple tool calls in a single response
    })

    return result.toDataStreamResponse({
      headers: {
        'X-Session-Id': sessionId,
        'X-RateLimit-Remaining': String(rateLimit.remaining),
        'X-RateLimit-Reset': String(rateLimit.resetTime),
      },
    })
  } catch (error) {
    logger.error('Chat failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json(
      { error: 'Chat request failed' },
      { status: 500 }
    )
  }
}
