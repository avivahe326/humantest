'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Image from 'next/image'
import { SampleReport } from './sample-report'
import { CopyButton } from './copy-button'
import { useTranslation } from '@/lib/i18n'

export default function LandingPage() {
  const { t } = useTranslation()

  return (
    <div className="space-y-24 pb-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl flex items-center gap-3 justify-center">
          <Image src="/icon.png" alt="human_test logo" width={56} height={56} className="rounded-lg" />
          <span className="font-mono">human_test()</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
          {t('landing.heroSubtitle')}
        </p>
        <div className="flex gap-4">
          <Link href="/register">
            <Button size="lg">{t('landing.getStarted')}</Button>
          </Link>
          <Link href="/tasks">
            <Button size="lg" variant="outline">{t('landing.browseTests')}</Button>
          </Link>
        </div>
      </section>

      {/* Install as Agent Skill */}
      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold">{t('landing.installSkill')}</h2>
        <p className="mx-auto max-w-xl text-muted-foreground">
          {t('landing.installSkillDesc')}
        </p>
        <Card className="mx-auto max-w-lg">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 rounded bg-muted p-4">
              <pre className="flex-1 text-sm overflow-x-auto"><code>npx skills add avivahe326/human-test-skill</code></pre>
              <CopyButton text="npx skills add avivahe326/human-test-skill" />
            </div>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          {t('landing.poweredBy', { link: '' }).split('').length > 0 && (
            <>
              {t('landing.poweredBy', { link: '__LINK__' }).split('__LINK__')[0]}
              <a href="https://skills.sh" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">skills.sh</a>
              {t('landing.poweredBy', { link: '__LINK__' }).split('__LINK__')[1]}
            </>
          )}
        </p>
      </section>

      {/* How It Works */}
      <section className="space-y-8">
        <h2 className="text-center text-2xl font-bold">{t('landing.howItWorks')}</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('landing.step1Title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('landing.step1Desc', { code: '' }).split('').length > 0 && (
                  <>
                    {t('landing.step1Desc', { code: '__CODE__' }).split('__CODE__')[0]}
                    <code className="text-primary">human_test()</code>
                    {t('landing.step1Desc', { code: '__CODE__' }).split('__CODE__')[1]}
                  </>
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('landing.step2Title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('landing.step2Desc')}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('landing.step3Title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {t('landing.step3Desc')}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* For Developers */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">{t('landing.forDevelopers')}</h2>
        <Card className="mx-auto max-w-2xl">
          <CardContent className="pt-6">
            <pre className="overflow-x-auto rounded bg-muted p-4 text-sm leading-relaxed"><code><span className="text-muted-foreground italic">{'// One API call. Real human feedback.'}</span>{'\n'}<span className="text-purple-400">const</span> {'{ taskId }'} = <span className="text-purple-400">await</span> <span className="text-blue-400">fetch</span>(<span className="text-green-400">{`'/api/skill/human-test'`}</span>, {'{'}{'\n'}  method: <span className="text-green-400">{`'POST'`}</span>,{'\n'}  headers: {'{'}{'\n'}    <span className="text-green-400">{`'Authorization'`}</span>: <span className="text-green-400">{`'Bearer <your-api-key>'`}</span>,{'\n'}    <span className="text-green-400">{`'Content-Type'`}</span>: <span className="text-green-400">{`'application/json'`}</span>,{'\n'}  {'},'}{'\n'}  body: <span className="text-blue-400">JSON</span>.<span className="text-blue-400">stringify</span>({'{'}{'\n'}    url: <span className="text-green-400">{`'https://your-product.com'`}</span>,{'\n'}    focus: <span className="text-green-400">{`'Test the onboarding flow'`}</span>,{'\n'}    maxTesters: <span className="text-orange-400">5</span>,{'\n'}  {'}'}),{'\n'}{'}'}).<span className="text-blue-400">then</span>(r {'=> '}r.<span className="text-blue-400">json</span>());{'\n'}{'\n'}<span className="text-muted-foreground italic">{'// Poll for results (or use webhookUrl for push notifications)'}</span>{'\n'}<span className="text-purple-400">const</span> result = <span className="text-purple-400">await</span> <span className="text-blue-400">fetch</span>(<span className="text-green-400">{`\`/api/skill/status/\${taskId}\``}</span>, {'{'}{'\n'}  headers: {'{ '}<span className="text-green-400">{`'Authorization'`}</span>: <span className="text-green-400">{`'Bearer <your-api-key>'`}</span>{' },'}{'\n'}{'}'}).<span className="text-blue-400">then</span>(r {'=> '}r.<span className="text-blue-400">json</span>());{'\n'}{'\n'}result.report  <span className="text-muted-foreground italic">{'// AI-generated usability report'}</span></code></pre>
          </CardContent>
        </Card>
      </section>

      {/* For Testers */}
      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold">{t('landing.forTesters')}</h2>
        <p className="mx-auto max-w-xl text-muted-foreground">
          {t('landing.forTestersDesc')}
        </p>
        <Link href="/register">
          <Button variant="outline" size="lg">{t('landing.startTestingEarning')}</Button>
        </Link>
      </section>

      {/* Real Report Demo */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">{t('landing.realReportExample')}</h2>
        <p className="text-center text-muted-foreground">
          {t('landing.realReportDesc')}
        </p>
        <SampleReport />
      </section>

      {/* Footer */}
      <footer className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
        <p className="font-mono">human_test()</p>
        <p className="mt-1">{t('landing.footerTagline')}</p>
      </footer>
    </div>
  )
}
