import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'

/**
 * Default model. Override with ANTHROPIC_MODEL (e.g. "claude-sonnet-5" for a
 * cheaper/faster tier). Model IDs are undated: https://platform.claude.com/docs/en/about-claude/models
 */
export const DEFAULT_MODEL_ID = 'claude-opus-5'

/**
 * Reasoning effort for the chat route. Shopping chat is latency-sensitive and
 * the tool surface is small, so we default to "low". Override with
 * ANTHROPIC_EFFORT=low|medium|high|xhigh|max.
 */
export const DEFAULT_EFFORT = 'low' as const

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export function getModelId(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL_ID
}

export function getEffort(): Effort {
  const value = process.env.ANTHROPIC_EFFORT?.trim()
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh' || value === 'max') {
    return value
  }
  return DEFAULT_EFFORT
}

/**
 * Whether the configured model supports Anthropic's server-side refusal
 * fallbacks (Claude Opus 5 / Fable family). Older tiers reject the parameter.
 */
export function supportsFallbacks(modelId: string = getModelId()): boolean {
  return modelId.startsWith('claude-opus-5') || modelId.startsWith('claude-fable')
}

/**
 * Resolve the language model.
 *
 * - If AI_GATEWAY_API_KEY is set, route through Vercel AI Gateway using the
 *   built-in gateway provider ("anthropic/<model>").
 * - Otherwise call Anthropic directly with ANTHROPIC_API_KEY.
 */
export function getModel(): LanguageModel {
  const modelId = getModelId()

  if (process.env.AI_GATEWAY_API_KEY) {
    return `anthropic/${modelId}`
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY (or AI_GATEWAY_API_KEY) is not configured')
  }

  const anthropic = createAnthropic()
  return anthropic(modelId)
}
