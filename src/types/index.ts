// Product type
export interface Product {
  id: string
  title: string
  price: number
  url: string
  image?: string
  retailer: string
  asin?: string
}

// Message types for chat
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt?: Date
  toolInvocations?: ToolInvocation[]
}

export interface ToolInvocation {
  toolCallId: string
  toolName: string
  state: 'call' | 'result'
  args?: Record<string, unknown>
  result?: unknown
}
