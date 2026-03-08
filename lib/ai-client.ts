import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getConfig } from '@/lib/settings'

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

async function resolveConfig(): Promise<AIConfig> {
  const provider = (await getConfig('AI_PROVIDER') as AIProvider | null)
    || (await getConfig('ANTHROPIC_API_KEY') ? 'anthropic' : null)

  if (!provider) {
    throw new Error('AI provider not configured. Set AI_PROVIDER or ANTHROPIC_API_KEY in your environment.')
  }

  const apiKey = await getConfig('AI_API_KEY') || await getConfig('ANTHROPIC_API_KEY') || ''

  const defaultModel = provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o'
  const model = await getConfig('AI_MODEL') || defaultModel

  const baseURL = await getConfig('AI_BASE_URL')
    || (provider === 'anthropic' ? await getConfig('ANTHROPIC_BASE_URL') : null)
    || undefined

  return { provider, apiKey, baseURL, model }
}

// ─── Provider Clients ───

let lastConfigJSON = ''
let anthropicClient: Anthropic | null = null
let openaiClient: OpenAI | null = null

function getAnthropicClient(cfg: AIConfig): Anthropic {
  const cfgJSON = JSON.stringify(cfg)
  if (anthropicClient && lastConfigJSON === cfgJSON) return anthropicClient
  lastConfigJSON = cfgJSON
  anthropicClient = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
  openaiClient = null
  return anthropicClient
}

function getOpenAIClient(cfg: AIConfig): OpenAI {
  const cfgJSON = JSON.stringify(cfg)
  if (openaiClient && lastConfigJSON === cfgJSON) return openaiClient
  lastConfigJSON = cfgJSON
  openaiClient = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL })
  anthropicClient = null
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
  const cfg = await resolveConfig()

  if (cfg.provider === 'anthropic') {
    return chatAnthropic(messages, options, cfg)
  }
  return chatOpenAI(messages, options, cfg)
}

async function chatAnthropic(messages: ChatMessage[], options: ChatOptions, cfg: AIConfig): Promise<{ text: string }> {
  const client = getAnthropicClient(cfg)

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
  const client = getOpenAIClient(cfg)

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
