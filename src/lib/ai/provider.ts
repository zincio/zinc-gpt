import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'

// Use AI Gateway if configured, otherwise fall back to direct Anthropic
export function getAIProvider() {
  const gatewayUrl = process.env.AI_GATEWAY_URL
  const gatewayKey = process.env.AI_GATEWAY_API_KEY

  if (gatewayUrl && gatewayKey) {
    // Use AI Gateway (OpenAI-compatible endpoint)
    return createOpenAI({
      baseURL: gatewayUrl,
      apiKey: gatewayKey,
    })
  }

  // Fall back to direct Anthropic
  return createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
}

export function getModelId() {
  const gatewayUrl = process.env.AI_GATEWAY_URL

  if (gatewayUrl) {
    // AI Gateway model - adjust based on your gateway configuration
    return 'claude-sonnet-4-20250514'
  }

  // Direct Anthropic model
  return 'claude-sonnet-4-20250514'
}
