'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import en from './en.json'
import zh from './zh.json'

export type Locale = 'en' | 'zh'

const translations = { en, zh } as const

type TranslationTree = typeof en

// Flatten nested keys: { nav: { tasks: "..." } } → "nav.tasks"
type FlatKeys<T, Prefix extends string = ''> = T extends Record<string, unknown>
  ? { [K in keyof T & string]: FlatKeys<T[K], Prefix extends '' ? K : `${Prefix}.${K}`> }[keyof T & string]
  : Prefix

export type TranslationKey = FlatKeys<TranslationTree>

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return path
    current = (current as Record<string, unknown>)[key]
  }
  return typeof current === 'string' ? current : path
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return vars[key] !== undefined ? String(vars[key]) : `{${key}}`
  })
}

const COOKIE_NAME = 'lang'
const LS_KEY = 'lang'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`
}

export function detectLocale(): Locale {
  // 1. Cookie
  const cookieVal = getCookie(COOKIE_NAME)
  if (cookieVal === 'zh' || cookieVal === 'en') return cookieVal

  // 2. localStorage
  try {
    const lsVal = localStorage.getItem(LS_KEY)
    if (lsVal === 'zh' || lsVal === 'en') return lsVal
  } catch {}

  // 3. navigator.language
  if (typeof navigator !== 'undefined') {
    const lang = navigator.language || (navigator as { userLanguage?: string }).userLanguage || ''
    if (/^zh/i.test(lang)) return 'zh'
  }

  // 4. timezone
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (/Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Hong_Kong|Taipei|Macau)/i.test(tz)) return 'zh'
  } catch {}

  return 'en'
}

interface LanguageContextValue {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
  t: (key) => key,
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    // SSR-safe: try cookie sync read, fallback to 'en'
    if (typeof document !== 'undefined') {
      return detectLocale()
    }
    return 'en'
  })

  // Hydration: re-detect on mount
  useEffect(() => {
    setLocaleState(detectLocale())
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    setCookie(COOKIE_NAME, l)
    try { localStorage.setItem(LS_KEY, l) } catch {}
  }, [])

  const t = useCallback((key: TranslationKey, vars?: Record<string, string | number>): string => {
    const template = getNestedValue(translations[locale] as unknown as Record<string, unknown>, key)
    return interpolate(template, vars)
  }, [locale])

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useTranslation() {
  return useContext(LanguageContext)
}
