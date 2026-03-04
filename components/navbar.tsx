'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { useEffect, useState, useCallback } from 'react'

export function Navbar() {
  const { data: session, status } = useSession()
  const [credits, setCredits] = useState<number | null>(null)
  const pathname = usePathname()

  const fetchCredits = useCallback(() => {
    if (!session?.user?.id) return
    fetch('/api/credits/balance')
      .then(res => res.json())
      .then(data => setCredits(data.credits))
      .catch(() => {})
  }, [session?.user?.id])

  // Fetch on session change and route change
  useEffect(() => { fetchCredits() }, [fetchCredits, pathname])

  // Refetch when page becomes visible
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchCredits() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchCredits])

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono text-lg font-bold">
            human_test()
          </Link>
          <div className="hidden items-center gap-4 sm:flex">
            <Link href="/tasks" className="text-sm text-muted-foreground hover:text-foreground">
              Tasks
            </Link>
            {session && (
              <>
                <Link href="/tasks/create" className="text-sm text-muted-foreground hover:text-foreground">
                  Create Test
                </Link>
                <Link href="/my-tasks" className="text-sm text-muted-foreground hover:text-foreground">
                  My Tasks
                </Link>
                <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
                  Settings
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {status === 'loading' ? null : session ? (
            <>
              {credits !== null && (
                <span className="text-sm font-medium">{credits} credits</span>
              )}
              <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/' })}>
                Log out
              </Button>
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">Sign up</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  )
}
