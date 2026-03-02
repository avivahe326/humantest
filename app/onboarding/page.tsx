'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function OnboardingPage() {
  const { data: session } = useSession()
  const router = useRouter()

  if (!session) {
    router.push('/login')
    return null
  }

  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Welcome to human_test()</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          You have 100 credits — enough to launch a 5-person test, or earn more by testing others&apos; products first.
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Card className="cursor-pointer transition-shadow hover:shadow-lg" onClick={() => router.push('/tasks')}>
          <CardHeader>
            <CardTitle>Test a product first</CardTitle>
            <CardDescription>Browse available tests and earn credits</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Complete testing tasks from other developers and earn credits for each test you complete.
            </p>
            <Button className="mt-4 w-full" variant="outline">
              Browse Tests
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer transition-shadow hover:shadow-lg" onClick={() => router.push('/tasks/create')}>
          <CardHeader>
            <CardTitle>Launch my own test</CardTitle>
            <CardDescription>Get real human feedback on your product</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Create a testing task and get structured feedback from real users. Costs credits per tester.
            </p>
            <Button className="mt-4 w-full">
              Create Test
            </Button>
          </CardContent>
        </Card>
      </div>

      <Link href="/tasks" className="text-sm text-muted-foreground underline">
        Skip for now
      </Link>
    </div>
  )
}
