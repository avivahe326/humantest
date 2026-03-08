import { NextResponse } from 'next/server'
import { getConfig } from '@/lib/settings'

export async function GET() {
  const [smtpHost, githubToken] = await Promise.all([
    getConfig('SMTP_HOST'),
    getConfig('GITHUB_TOKEN'),
  ])
  return NextResponse.json({
    emailVerification: !!smtpHost,
    hasGithubToken: !!githubToken,
  })
}
