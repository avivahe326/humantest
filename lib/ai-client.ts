import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// ─── Types ───

export type AIProvider = 'anthropic' | 'openai'

export interface ImageBlock {
  type: 'image'
  mediaType: string
  base64Data: string
}

export interface TextBlock {
  type: 'text'
  text: string
}

export type ContentBlock = TextBlock | ImageBlock

export type MessageContent = string | ContentBlock[]

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: MessageContent
}

export interface ChatOptions {
  system?: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  maxRetries?: number
}

export class AITimeoutError extends Error {
  constructor(message = 'AI request timed out') {
    super(message)
    this.name = 'AITimeoutError'
  }
}

// ─── Config ───

interface AIConfig {
  provider: AIProvider
  apiKey: string
  baseURL?: string
  model: string
}

function resolveConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER as AIProvider) || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : undefined)

  if (!provider) {
    throw new Error('AI provider not configured. Set AI_PROVIDER or ANTHROPIC_API_KEY in your environment.')
  }

  const apiKey = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''

  const defaultModel = provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o'
  const model = process.env.AI_MODEL || defaultModel

  const baseURL = process.env.AI_BASE_URL || (provider === 'anthropic' ? process.env.ANTHROPIC_BASE_URL : undefined) || undefined

  return { provider, apiKey, baseURL, model }
}

// ─── Provider Clients (lazy singletons) ───

let cachedConfig: AIConfig | null = null
let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null

function getConfig(): AIConfig {
  if (!cachedConfig) cachedConfig = resolveConfig()
  return cachedConfig
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const cfg = getConfig()
    anthropicClient = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
  }
  return anthropicClient
}

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const cfg = getConfig()
    openaiClient = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
  }
  return openaiClient
}

// ─── Content Conversion ───

function toAnthropicContent(content: MessageContent): string | Anthropic.Messages.ContentBlockParam[] {
  if (typeof content === 'string') return content
  return content.map((block): Anthropic.Messages.ContentBlockParam => {
    if (block.type === 'text') return { type: 'text', text: block.text }
    return {
      type: 'image',
      source: { type: 'base64', media_type: block.mediaType as Anthropic.Messages.Base64ImageSource['media_type'], data: block.base64Data },
    }
  })
}

function toOpenAIContent(content: MessageContent): string | OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  if (typeof content === 'string') return content
  return content.map((block): OpenAI.Chat.Completions.ChatCompletionContentPart => {
    if (block.type === 'text') return { type: 'text', text: block.text }
    return {
      type: 'image_url',
      image_url: { url: `data:${block.mediaType};base64,${block.base64Data}` },
    }
  })
}

// ─── Chat ───

export async function chat(messages: ChatMessage[], options: ChatOptions = {}): Promise<{ text: string }> {
  const cfg = getConfig()

  if (cfg.provider === 'anthropic') {
    return chatAnthropic(messages, options, cfg)
  }
  return chatOpenAI(messages, options, cfg)
}

async function chatAnthropic(messages: ChatMessage[], options: ChatOptions, cfg: AIConfig): Promise<{ text: string }> {
  const client = getAnthropicClient()

  const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.map(m => ({
    role: m.role,
    content: toAnthropicContent(m.content),
  }))

  try {
    const response = await client.messages.create(
      {
        model: cfg.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
        system: options.system,
        messages: anthropicMessages,
      },
      {
        timeout: options.timeoutMs,
        maxRetries: options.maxRetries ?? 0,
      }
    )

    const block = response.content[0]
    return { text: (block && block.type === 'text') ? block.text : '' }
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) {
      throw new AITimeoutError()
    }
    throw err
  }
}

async function chatOpenAI(messages: ChatMessage[], options: ChatOptions, cfg: AIConfig): Promise<{ text: string }> {
  const client = getOpenAIClient()

  const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

  if (options.system) {
    openaiMessages.push({ role: 'system', content: options.system })
  }

  for (const m of messages) {
    openaiMessages.push({
      role: m.role,
      content: toOpenAIContent(m.content),
    } as OpenAI.Chat.Completions.ChatCompletionMessageParam)
  }

  try {
    const response = await client.chat.completions.create(
      {
        model: cfg.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature,
        messages: openaiMessages,
      },
      {
        timeout: options.timeoutMs,
        maxRetries: options.maxRetries ?? 0,
      }
    )

    return { text: response.choices[0]?.message?.content ?? '' }
  } catch (err) {
    if (err instanceof OpenAI.APIConnectionTimeoutError) {
      throw new AITimeoutError()
    }
    throw err
  }
}
