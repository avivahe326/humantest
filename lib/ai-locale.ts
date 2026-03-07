export function getLanguageInstruction(locale?: string | null): string {
  if (locale === 'zh') return '\n\nIMPORTANT: You MUST write your entire response in Chinese (简体中文).'
  return ''
}
