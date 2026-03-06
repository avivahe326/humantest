'use client'

import { useState } from 'react'

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 5000)
      }}
      className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted-foreground/10 transition-colors"
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}
