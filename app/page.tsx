import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const MOCK_REPORT = `## Executive Summary

The landing page for **acme-saas.com** shows strong visual design but suffers from unclear value proposition and a confusing pricing page. Testers consistently struggled to understand what the product does within the first 10 seconds.

## Key Findings

1. **Unclear Value Proposition (Critical)** — 4/5 testers couldn't articulate what the product does after viewing the hero section. *"I see a nice animation but have no idea what this tool is for"* — Tester Alice
2. **Pricing Page Confusion (Major)** — The "Enterprise" plan has no price listed, causing 3/5 testers to abandon the flow. *"I assumed it was too expensive for me"* — Tester Bob
3. **Mobile Navigation Broken (Major)** — Hamburger menu doesn't close after clicking a link on mobile. Tester Carol noted: *"I had to refresh the page to get rid of the menu."*

## NPS Analysis

**Average NPS: 5.4/10** — Below the recommended threshold of 7.0.
- Promoters (9-10): 0
- Passives (7-8): 2
- Detractors (1-6): 3

## Recommendations

1. Rewrite hero copy to state the problem solved in one sentence
2. Add pricing to Enterprise plan or replace with "Contact Us"
3. Fix mobile nav z-index and click-outside-to-close behavior
4. Add social proof (logos, testimonials) above the fold`

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
                Real testers claim your task, use your product, and provide guided 3-step feedback: first impression, task experience, and NPS rating.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">3. Get AI Report</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                AI aggregates all feedback into a structured report with findings ranked by severity, NPS analysis, and actionable recommendations.
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

      {/* Mock Report Demo */}
      <section className="space-y-6">
        <h2 className="text-center text-2xl font-bold">Sample Report</h2>
        <p className="text-center text-muted-foreground">
          Here&apos;s what a real test report looks like:
        </p>
        <Card className="mx-auto max-w-3xl">
          <CardContent className="prose prose-invert max-w-none pt-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {MOCK_REPORT.split('\n').map((line, i) => {
                if (line.startsWith('## ')) {
                  return <h3 key={i} className="mt-4 text-lg font-bold">{line.replace('## ', '')}</h3>
                }
                if (line.startsWith('**') && line.endsWith('**')) {
                  return <p key={i} className="font-bold">{line.replace(/\*\*/g, '')}</p>
                }
                if (line.startsWith('1. ') || line.startsWith('2. ') || line.startsWith('3. ') || line.startsWith('4. ')) {
                  return <p key={i} className="ml-4">{line}</p>
                }
                if (line.startsWith('- ')) {
                  return <p key={i} className="ml-6 text-muted-foreground">{line}</p>
                }
                if (line.trim() === '') return <br key={i} />
                return <p key={i}>{line}</p>
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
        <p className="font-mono">human_test()</p>
        <p className="mt-1">Real human feedback for AI-built products.</p>
      </footer>
    </div>
  )
}
