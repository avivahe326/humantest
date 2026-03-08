import { getConfig } from '@/lib/settings'

export async function getLanguageInstruction(locale?: string | null): Promise<string> {
  let effectiveLocale = locale
  if (!effectiveLocale) {
    effectiveLocale = await getConfig('DEFAULT_LOCALE') || undefined
  }
  if (effectiveLocale === 'zh') return '\n\nIMPORTANT: You MUST write your entire response in Chinese (简体中文).'
  return ''
}
