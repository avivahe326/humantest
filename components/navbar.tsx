'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

export function Navbar() {
  const { data: session, status } = useSession()
  const { locale, setLocale, t } = useTranslation()

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-mono text-lg font-bold">
            <Image src="/icon.png" alt="human_test logo" width={24} height={24} className="rounded" />
            human_test()
          </Link>
          <div className="hidden items-center gap-4 sm:flex">
            <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground">
              {t('nav.tasks')}
            </Link>
            {session && (
              <>
                <Link href="/tasks/create" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('nav.createTest')}
                </Link>
                <Link href="/my-tasks" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('nav.myTasks')}
                </Link>
                <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
                  {t('nav.settings')}
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
          >
            {t('nav.langSwitch')}
          </button>
          {status === 'loading' ? null : session ? (
            <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/' })}>
              {t('nav.logOut')}
            </Button>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">{t('nav.logIn')}</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">{t('nav.signUp')}</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
