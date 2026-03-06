'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

export default function OnboardingPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const { t } = useTranslation()

  if (!session) {
    router.push('/login')
    return null
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">{t('onboarding.welcome')}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {t('onboarding.welcomeDesc')}
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="cursor-pointer transition-shadow hover:shadow-lg" onClick={() => router.push('/tasks')}>
          <CardHeader>
            <CardTitle>{t('onboarding.testFirst')}</CardTitle>
            <CardDescription>{t('onboarding.testFirstSub')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.testFirstDesc')}
            </p>
            <Button className="mt-4 w-full" variant="outline">
              {t('onboarding.browseTests')}
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-shadow hover:shadow-lg" onClick={() => router.push('/tasks/create')}>
          <CardHeader>
            <CardTitle>{t('onboarding.launchOwn')}</CardTitle>
            <CardDescription>{t('onboarding.launchOwnSub')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t('onboarding.launchOwnDesc')}
            </p>
            <Button className="mt-4 w-full">
              {t('onboarding.createTest')}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Link href="/tasks" className="text-sm text-muted-foreground underline">
        {t('onboarding.skip')}
      </Link>
    </div>
  )
}
