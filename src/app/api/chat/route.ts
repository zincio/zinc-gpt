import { NextResponse } from 'next/server'
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from 'ai'
import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic'
import { SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { createTools, type ShopUIMessage } from '@/lib/ai/tools'
import { getEffort, getModel, getModelId, supportsFallbacks } from '@/lib/ai/provider'
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
  if (!validation.success || !validation.data) {
    return NextResponse.json(
      { error: validation.error ?? 'Invalid request body' },
      { status: 400 }
    )
  }

  const { messages: rawMessages, sessionId: requestedSessionId } = validation.data

  // Resolve session. The client generates a UUID and sends it with every
  // request; we make sure a row exists for it (resilient to SQLite failures).
  const sessionId = requestedSessionId || crypto.randomUUID()
  try {
    if (!getSessionById(sessionId)) {
      createSession(undefined, sessionId)
    }
  } catch (error) {
    logger.warn('Session persistence unavailable, continuing', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  // Create tools with session context
  const tools = createTools(sessionId)

  // Validate UI messages against the tool schemas (rejects malformed tool parts)
  let messages: ShopUIMessage[]
  try {
    messages = (await validateUIMessages({ messages: rawMessages, tools })) as ShopUIMessage[]
  } catch (error) {
    logger.warn('Invalid UI messages', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Invalid message format' }, { status: 400 })
  }

  const modelId = getModelId()

  let model
  try {
    model = getModel()
  } catch (error) {
    logger.error('AI provider not configured', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Chat is not configured' }, { status: 500 })
  }

  const anthropicOptions = {
    effort: getEffort(),
    // Server-side refusal fallbacks: if the primary model declines a request on
    // policy grounds, Anthropic re-runs it on a fallback model in the same call.
    ...(supportsFallbacks(modelId) ? { fallbacks: 'default' as const } : {}),
  } satisfies AnthropicLanguageModelOptions

  const result = streamText({
    model,
    instructions: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: isStepCount(5), // Allow multiple tool calls in a single response
    providerOptions: {
      anthropic: anthropicOptions,
    },
    onError: ({ error }) => {
      logger.error('Chat stream error', {
        model: modelId,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
    },
  })

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onError: () => 'Something went wrong while generating a response. Please try again.',
    }),
    headers: {
      'X-Session-Id': sessionId,
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(rateLimit.resetTime),
    },
  })
}
