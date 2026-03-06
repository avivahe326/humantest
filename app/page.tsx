import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SampleReport } from './sample-report'

export default function LandingPage() {
  return (
    <div className="space-y-24 pb-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 pt-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          <span className="font-mono">human_test()</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Let AI hire humans to test your product. Get structured feedback from real users in hours, not weeks.
        </p>
        <div className="flex gap-4">
          <Link href="/register">
            <Button size="lg">Get Started Free</Button>
          </Link>
          <Link href="/tasks">
            <Button size="lg" variant="outline">Browse Tests</Button>
          </Link>
        </div>
      </section>

      {/* Install as Agent Skill */}
      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold">Install as Agent Skill</h2>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Add human testing to any AI coding agent — Claude Code, Cursor, Copilot, Gemini CLI, and 30+ more.
        </p>
        <Card className="mx-auto max-w-lg">
          <CardContent className="pt-6">
            <pre className="rounded bg-muted p-4 text-sm text-left">
              <code>npx skills add avivahe326/human-test-skill</code>
            </pre>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Powered by <a href="https://skills.sh" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">skills.sh</a> open agent skills ecosystem
        </p>
      </section>

      {/* How It Works */}
      <section className="space-y-8">
        <h2 className="text-center text-2xl font-bold">How It Works</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">1. Create a Test</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Call <code className="text-primary">human_test()</code> from your AI agent or use the web form. AI generates a structured test plan automatically.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Humans Test</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Real testers claim your task, use your product, and provide guided feedback with screen recording, audio narration, and NPS rating.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Get AI Report</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                AI analyzes recordings and aggregates all feedback into a structured report with findings ranked by severity, NPS analysis, and actionable recommendations.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* For Developers */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">For Developers</h2>
        <Card className="mx-auto max-w-2xl">
          <CardContent className="pt-6">
            <pre className="overflow-x-auto rounded bg-muted p-4 text-sm">
{`// One API call. Real human feedback.
const response = await fetch('/api/skill/human-test', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <your-api-key>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://your-product.com',
    focus: 'Test the onboarding flow',
    maxTesters: 5,
  }),
});

const { taskId } = await response.json();
// Testers will test your product and submit feedback.
// You'll receive a webhook with the full AI report.`}
            </pre>
          </CardContent>
        </Card>
      </section>

      {/* For Testers */}
      <section className="space-y-6 text-center">
        <h2 className="text-2xl font-bold">For Testers</h2>
        <p className="mx-auto max-w-xl text-muted-foreground">
          Earn credits by testing real products. Browse available tests, complete guided feedback tasks, and build your testing portfolio.
        </p>
        <Link href="/register">
          <Button variant="outline" size="lg">Start Testing &amp; Earning</Button>
        </Link>
      </section>

      {/* Real Report Demo */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">Real Report Example</h2>
        <p className="text-center text-muted-foreground">
          This is a real AI-generated report from an actual usability test on our platform:
        </p>
        <SampleReport />
      </section>

      {/* Footer */}
      <footer className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
        <p className="font-mono">human_test()</p>
        <p className="mt-1">Real human feedback for AI-built products.</p>
      </footer>
    </div>
  )
}
