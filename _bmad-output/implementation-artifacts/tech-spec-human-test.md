---
title: 'human_test() MVP Platform'
slug: 'human-test'
created: '2026-03-02'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 14 App Router', 'React', 'Tailwind CSS', 'shadcn/ui', 'Prisma ORM', 'MySQL 8.0 (Aliyun RDS)', 'NextAuth.js', 'Claude/OpenAI API', 'Aliyun ECS + PM2 + Nginx']
files_to_modify: ['All files listed in Project Structure section — greenfield project']
code_patterns: ['App Router conventions (app/ directory)', 'Server Components by default', 'Route Handlers for API', 'Prisma schema-first', 'shadcn/ui components']
test_patterns: ['Manual smoke tests via curl for Skill API', 'Manual browser testing for web flows', 'Post-MVP: Playwright e2e tests']
---

# Tech-Spec: human_test() MVP Platform

**Created:** 2026-03-02

## Overview

### Problem Statement

AI agents cannot obtain real human subjective feedback on products — perception, judgment, emotion. Developers need real user testing but the barrier is too high (cost, time, process complexity). There is no "call a human" capability in the entire AI tool ecosystem.

### Solution

An OpenClaw Skill + Web platform: AI agents publish testing tasks via `human_test()`, human testers claim and complete tasks on the web, submitting multimodal feedback (text/screen recording/audio). AI automatically aggregates feedback into a structured report.

### Scope

**In Scope:**
- OpenClaw Skill interface — `human_test()` to create tasks + `get_status()` to check progress (sync), webhook push on task completion (async)
- Web task creation form — developers can create tasks via web UI (not just API), with AI auto-generating test plans
- Task web page — browse task list, claim tasks, submit guided 3-step feedback (first impression → task experience → summary/NPS)
- Credits system — register earns 100 credits, completing a test earns credits, creating a task costs credits. Dual-track: credits now, cash payments later
- Minimal registration + onboarding — email signup, post-registration guided flow ("test first" or "create test")
- AI summary report — aggregate multi-tester structured feedback into report with tester attribution
- Landing page — product intro + mock report demo + CTA

**Out of Scope:**
- Cash payment/billing system (prepared with `rewardType` field for future)
- Credit/reputation scoring beyond simple balance
- Matching algorithm
- Multi-language support
- Native mobile app
- Category/tagging system
- Analytics dashboard
- Notification system (beyond webhook)

## Context for Development

### Codebase Patterns

- **Greenfield project — Confirmed Clean Slate** (no existing codebase, no legacy constraints)
- Project root: `human-test/` under working directory
- Next.js 14 App Router conventions (app/ directory, server components, route handlers)
- Prisma ORM for database access (schema-first approach)
- NextAuth.js for authentication (email + password credentials)
- shadcn/ui component library (Tailwind-based, copy-paste components)
- OpenClaw Skill specification for external API interface

### Project Structure

```
human-test/
├── app/
│   ├── page.tsx                          # Landing Page (with mock report demo)
│   ├── layout.tsx                        # Root layout + nav
│   ├── providers.tsx                     # NextAuth SessionProvider wrapper
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── onboarding/
│   │   └── page.tsx                      # Post-registration guided flow
│   ├── tasks/
│   │   ├── page.tsx                      # Task list (cards with credits + time)
│   │   ├── create/page.tsx               # Web task creation form + AI plan preview
│   │   └── [id]/
│   │       ├── page.tsx                  # Task detail + claim + report display (public for COMPLETED)
│   │       └── submit/page.tsx           # 3-step guided feedback form + success state
│   ├── my-tasks/
│   │   └── page.tsx                      # Two tabs: "Testing" (claimed) + "Created" (my tasks + reports)
│   ├── settings/
│   │   └── page.tsx                      # API Key + credits balance + credits history
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/route.ts
│       │   ├── register/route.ts
│       │   └── regenerate-key/route.ts
│       ├── skill/
│       │   ├── human-test/route.ts       # POST: create task (Skill entry)
│       │   └── status/[id]/route.ts      # GET: query progress
│       ├── tasks/
│       │   ├── route.ts                  # GET: list (paginated)
│       │   ├── create/route.ts           # POST: web form task creation
│       │   └── [id]/
│       │       ├── claim/route.ts
│       │       ├── submit/route.ts
│       │       ├── cancel/route.ts       # POST: cancel task + refund unclaimed credits
│       │       └── generate-report/route.ts  # POST: early report generation (creator only, ≥1 submission)
│       └── ai/
│           └── generate-test-plan/route.ts  # POST: AI generates test steps
├── components/
│   └── ui/                               # shadcn/ui
├── lib/
│   ├── prisma.ts
│   ├── auth.ts
│   ├── require-auth.ts
│   ├── require-api-key.ts
│   ├── validate.ts
│   ├── cors.ts                          # CORS helper for /api/skill/* route handlers
│   ├── credits.ts                        # Credit operations (all transactional)
│   ├── ai-report.ts
│   ├── ai-test-plan.ts                   # AI generates structured test steps
│   └── webhook.ts
├── prisma/
│   └── schema.prisma
├── ecosystem.config.js                   # PM2 config
└── package.json
```

### Database Schema (5 core tables)

```prisma
model User {
  id           String             @id @default(cuid())
  email        String             @unique
  password     String
  name         String?
  apiKey       String             @unique
  credits      Int                @default(100)  // 100 signup bonus
  createdAt    DateTime           @default(now())
  claims       TaskClaim[]
  tasks        Task[]
  feedbacks    Feedback[]
  transactions CreditTransaction[]
}

model Task {
  id               String     @id @default(cuid())
  title            String     @db.VarChar(200)
  description      String?    @db.Text
  targetUrl        String     @db.VarChar(2000)
  focus            String?    @db.Text
  requirements     Json?      // {feedbackType:{text,screenRec,audio}, steps:[{id,instruction,type}], nps:bool, estimatedMinutes:int}
  maxTesters       Int        @default(5)
  rewardPerTester  Int        @default(20)  // credits paid per tester
  rewardType       String     @default("CREDITS")  // future: "CASH"
  estimatedMinutes Int        @default(10)
  status           TaskStatus @default(OPEN)
  webhookUrl       String?    @db.VarChar(2000)
  creatorId        String
  creator          User       @relation(fields: [creatorId], references: [id])
  report           String?    @db.LongText
  claimDeadline    DateTime?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt
  claims           TaskClaim[]
  feedbacks        Feedback[]

  @@index([status, createdAt])
  @@index([creatorId])
}

model TaskClaim {
  id        String      @id @default(cuid())
  taskId    String
  userId    String
  status    ClaimStatus @default(IN_PROGRESS)
  claimedAt DateTime    @default(now())
  task      Task        @relation(fields: [taskId], references: [id])
  user      User        @relation(fields: [userId], references: [id])
  feedback  Feedback?

  @@unique([taskId, userId])
  @@index([userId])
}

model Feedback {
  id           String    @id @default(cuid())
  taskId       String
  claimId      String    @unique
  userId       String
  textFeedback String?   @db.Text       // AI-concatenated summary of rawData
  screenRecUrl String?   @db.VarChar(2000)
  audioUrl     String?   @db.VarChar(2000)
  rawData      Json?     // Structured answers: {firstImpression:str, steps:[{id,answer}], nps:int, best:str, worst:str}
  createdAt    DateTime  @default(now())
  task         Task      @relation(fields: [taskId], references: [id])
  claim        TaskClaim @relation(fields: [claimId], references: [id])
  user         User      @relation(fields: [userId], references: [id])
}

model CreditTransaction {
  id        String   @id @default(cuid())
  userId    String
  amount    Int      // positive = earned, negative = spent
  type      String   // "SIGNUP_BONUS" | "TASK_REWARD" | "TASK_CREATION" | "TASK_REFUND"
  taskId    String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])

  @@index([userId, createdAt])
}

enum TaskStatus {
  OPEN
  IN_PROGRESS
  COMPLETED
  CANCELLED
}

enum ClaimStatus {
  IN_PROGRESS
  SUBMITTED
  ABANDONED
}
```

### API Design

**Skill Endpoints (for AI agents):**
- `POST /api/skill/human-test` — Create task. Body: `{ url, title?, description?, focus?, requirements?, maxTesters?, webhookUrl? }`. All fields except `url` are optional. Auth: `Bearer <api_key>` (case-insensitive "Bearer" prefix, trim whitespace; missing/malformed prefix → 401). Returns: `{ taskId, status }`. CORS: enabled for all origins on `/api/skill/*` routes.
- `GET /api/skill/status/:id` — Query progress + report. Auth: `Bearer <api_key>`. Returns: `{ taskId, status, title, maxTesters, claimedCount, submittedCount, report }`. CORS: same as above.

**Bearer Token Parsing Rule:** Extract `Authorization` header → split on first space → verify prefix is "bearer" (case-insensitive) → use remainder as token → trim whitespace. Missing header or malformed prefix → 401 `{ error: "Invalid or missing API key" }`.

**Web Endpoints (for testers):**
- `GET /api/tasks?page=1&limit=20` — List available tasks (paginated, default 20 per page). No auth required.
- `POST /api/tasks/:id/claim` — Claim a task (requires auth, creator cannot claim own task)
- `POST /api/tasks/:id/submit` — Submit feedback (requires auth, must be claim owner). Awards credits immediately on each submission.
- `POST /api/tasks/:id/cancel` — Cancel a task (requires auth, must be creator). Refunds credits for unclaimed slots. Only OPEN/IN_PROGRESS tasks can be cancelled.
- `POST /api/tasks/:id/generate-report` — Generate report early (requires auth, must be creator, ≥1 submission required). Sets task to COMPLETED, refunds credits for unclaimed slots.

**Webhook:** On task completion → POST `{ taskId, status: "COMPLETED", title, targetUrl, report, completedAt }` to creator's webhookUrl. SSRF protection: webhookUrl must be valid https:// URL, block private IPs (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1, fc00::/7).

### Authentication Design
- **Skill API**: API Key via Bearer token (auto-generated on registration, viewable in settings page)
- **Tester Web**: NextAuth.js email + password (bcrypt hashed)
- **Unified identity**: Every registered user gets an API Key and can both create tasks (as developer) and claim tasks (as tester)

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `_bmad-output/brainstorming/brainstorming-session-2026-03-02-0040.md` | Full brainstorming session with 147 ideas, strategic decisions, MVP scope |

### Technical Decisions

- **Project name: `human-test`** — clean, memorable, matches the core Skill name
- **Database: `human_test` on Aliyun RDS MySQL 8.0.36** — separate DB from existing chatapp, utf8mb4_unicode_ci charset, already created. Public endpoint: `rm-cn-3ic4nqxx30002fso.rwlb.rds.aliyuncs.com:3306`. Switch to internal IP after go-live.
- **Deployment: Aliyun ECS (47.98.136.200)** — Ubuntu 24.04, 2 vCPU, 3.4GB RAM, Node.js v22, PM2 6.x + Nginx 1.24. Port 3002 (3000/3001 occupied by chatapp). `next.config.js` must set `output: 'standalone'`. PM2 `ecosystem.config.js` manages process. Nginx reverse proxy on port 80/443.
- **Prisma ORM** — schema-first, auto-migration via `prisma db push`
- **NextAuth.js (Auth.js)** — lightweight email + password auth
- **External links for media** — recordings via Loom/similar, no self-hosted storage in MVP
- **API Key auto-generated** — `crypto.randomBytes(32).toString('hex')` on registration; viewable + regeneratable in settings
- **Credits system** — 100 signup bonus, 20 per completed test, 20×maxTesters to create task. `rewardType` field pre-wired for future cash payments
- **AI test plan generation** — on task creation, call Claude/OpenAI to generate structured test steps from URL+focus; stored in `Task.requirements` JSON
- **Guided 3-step feedback** — Step 1: first impression, Step 2: AI-generated task steps with per-step answers, Step 3: NPS + best/worst. Answers stored in `Feedback.rawData` JSON
- **AI report via Claude/OpenAI API** — structured feedbacks aggregated with tester attribution

## Implementation Plan

### Tasks

- [ ] Task 1: Project scaffolding and dependency installation
  - File: `human-test/` (new project root)
  - Action: Run `npx create-next-app@latest human-test --typescript --tailwind --eslint --app`. Install: `prisma @prisma/client next-auth bcryptjs @types/bcryptjs openai zod`. Init shadcn/ui. Add components: `button card input label badge textarea dialog toast progress`. Set `output: 'standalone'` in `next.config.js`.
  - Notes: TypeScript strict mode on. `output: 'standalone'` required for PM2 deployment on ECS.

- [ ] Task 2: Prisma schema and database setup
  - File: `human-test/prisma/schema.prisma`
  - Action: Create schema with MySQL datasource (`url = env("DATABASE_URL")`), 5 models and 2 enums as defined in Database Schema section. Run `npx prisma db push`.
  - File: `human-test/lib/prisma.ts`
  - Action: Prisma client singleton with global cache pattern.
  - File: `human-test/.env`
  - Action: `DATABASE_URL="mysql://chatapp:Heer0423@rm-cn-3ic4nqxx30002fso.rwlb.rds.aliyuncs.com:3306/human_test"`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL="http://47.98.136.200:3002"`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.
  - File: `human-test/ecosystem.config.js`
  - Action: PM2 config: `{ name: 'human-test', script: '.next/standalone/server.js', env: { PORT: 3002, NODE_ENV: 'production' } }`

- [ ] Task 3: Shared auth utilities and input validation
  - File: `human-test/lib/require-auth.ts`
  - Action: `requireAuth()` — gets NextAuth session, returns user or throws 401 NextResponse.
  - File: `human-test/lib/require-api-key.ts`
  - Action: `requireApiKey(request)` — parses Bearer token (case-insensitive), looks up User by apiKey, returns user or throws 401.
  - File: `human-test/lib/validate.ts`
  - Action: Zod schemas + `isPrivateUrl(url)` (block 10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, localhost) + `isSafeTargetUrl(url)` (http/https only).
  - File: `human-test/lib/credits.ts`
  - Action: Three transactional functions: `awardCredits(userId, amount, type, taskId?)` — adds credits + CreditTransaction record. `spendCredits(userId, amount, type, taskId?)` — checks balance first, deducts + records, throws 402 if insufficient. `getBalance(userId)` — returns User.credits. `refundCredits(userId, amount, taskId)` — shorthand for `awardCredits` with type "TASK_REFUND". All wrapped in Prisma transactions.

- [ ] Task 4: NextAuth.js authentication setup
  - File: `human-test/lib/auth.ts`
  - Action: CredentialsProvider. `authorize`: find user by email, bcrypt compare, return `{id, email, name, apiKey}`. Session + JWT callbacks expose `id, email, name, apiKey` to client. **Note:** `credits` is NOT stored in JWT (it changes frequently). Credits balance should be fetched client-side via a separate API call or by reading from session refresh. Nav bar credits display should use a client-side hook that fetches `/api/auth/session` or a dedicated `/api/credits/balance` endpoint.
  - File: `human-test/app/api/auth/[...nextauth]/route.ts`
  - Action: Export GET and POST handlers.

- [ ] Task 5: Registration + onboarding
  - File: `human-test/app/(auth)/register/page.tsx`
  - Action: Form (name, email, password). POST to `/api/auth/register`. On success redirect to `/onboarding`.
  - File: `human-test/app/api/auth/register/route.ts`
  - Action: Validate with Zod. Bcrypt hash. Generate apiKey via `crypto.randomBytes(32).toString('hex')`. Create User (`credits: 100`). Write CreditTransaction `{type: "SIGNUP_BONUS", amount: 100}`. Return success.
  - File: `human-test/app/onboarding/page.tsx`
  - Action: Two-card choice: **"Test a product first"** (→ /tasks, earn credits) | **"Launch my own test"** (→ /tasks/create). Show credits balance (100). Brief copy: "You have 100 credits — enough to launch a 5-person test, or earn more by testing others' products first." Skip link at bottom.

- [ ] Task 6: Login page
  - File: `human-test/app/(auth)/login/page.tsx`
  - Action: Email + password form. `signIn("credentials")`. Redirect to `/tasks` on success.

- [ ] Task 7: Root layout and navigation
  - File: `human-test/app/layout.tsx` + `app/providers.tsx`
  - Action: Nav: logo `human_test()`, Tasks, Create Test, My Tasks, Settings (shows credits balance 🪙). Auth state via `useSession`. Dark theme. Responsive.

- [ ] Task 8: AI test plan generation
  - File: `human-test/lib/ai-test-plan.ts`
  - Action: `generateTestPlan(url, focus, estimatedMinutes)` — calls Claude/OpenAI. Prompt: "Generate a structured usability test plan for {url}. Focus: {focus}. Duration: ~{estimatedMinutes} min. Return JSON: `{steps: [{id, instruction, type: 'open_text'}], nps: true, estimatedMinutes: N}`. Steps should be specific actions a tester should take on the product." Returns parsed JSON.
  - File: `human-test/app/api/ai/generate-test-plan/route.ts`
  - Action: POST handler. Auth required. Body: `{url, focus, estimatedMinutes?}`. Call `generateTestPlan()`. Return plan JSON. Used by web create form for preview before submission.

- [ ] Task 9: Web task creation form
  - File: `human-test/app/tasks/create/page.tsx`
  - Action: Client component. Fields: URL (required), title (optional, auto-fills from URL), focus area, estimated minutes (default 10), reward per tester (default 20), max testers (default 5), screen rec required? audio required?. "Preview Test Plan" button → calls `/api/ai/generate-test-plan` → shows generated steps inline (editable). Cost preview: "This will cost 🪙 {rewardPerTester × maxTesters} credits. Your balance: {credits}." Submit button: "Launch Test".
  - File: `human-test/app/api/tasks/create/route.ts`
  - Action: POST handler. `requireAuth()`. Validate with Zod. `isSafeTargetUrl()` check. Check credits via `spendCredits()` (throws 402 if insufficient). If no requirements provided, call `generateTestPlan()` to auto-generate. If no title provided, auto-generate from URL hostname (e.g. "Test: example.com"). Create Task. Return `{taskId}`, redirect to `/tasks/{taskId}`.

- [ ] Task 10: Skill API — Create Task endpoint
  - File: `human-test/app/api/skill/human-test/route.ts`
  - Action: POST. `requireApiKey()`. Validate with `createTaskSchema`. Check + spend credits. Auto-generate test plan via `generateTestPlan()` if no requirements in body. If no title provided, auto-generate from URL hostname (e.g. "Test: example.com"). Create Task. Return `{taskId, status: "OPEN", testPlan: requirements}`. CORS headers on all responses + OPTIONS handler.

- [ ] Task 11: Skill API — Query Status endpoint
  - File: `human-test/app/api/skill/status/[id]/route.ts`
  - Action: GET. `requireApiKey()`. Verify creator ownership. Return `{taskId, status, title, maxTesters, claimedCount, submittedCount, report}`. CORS headers.

- [ ] Task 12: Task list page
  - File: `human-test/app/tasks/page.tsx`
  - Action: Server component. Paginated (20/page). Card shows: title, hostname, focus, `🪙 {rewardPerTester} credits`, `⏱ ~{estimatedMinutes} min`, spots remaining, feedback type badges. Link to detail. "Login to claim" if unauthenticated.

- [ ] Task 13: Task detail + claim + report display
  - File: `human-test/app/tasks/[id]/page.tsx`
  - Action: Full task info. Full URL (logged-in only). Credits reward prominent. "Claim This Task" button (hidden if viewer is creator). Already claimed → link to submit. Full → "All spots taken". **Report display:** When task status is COMPLETED, render `Task.report` as markdown → HTML below task info. Report section is publicly viewable without auth (shareable URL for cold-start strategy). Creator sees "Generate Report Now" button when ≥1 submission and task not yet completed.
  - File: `human-test/app/api/tasks/[id]/claim/route.ts`
  - Action: `requireAuth()`. **Block self-claim:** if `task.creatorId === session.user.id` → return 403 `{error: "Cannot claim your own task"}`. Prisma create with `@@unique` catch for 409. First claim → Task status IN_PROGRESS. Return `{claimId}`.

- [ ] Task 14: Guided 3-step feedback form + submit success
  - File: `human-test/app/tasks/[id]/submit/page.tsx`
  - Action: Client component. Progress bar showing Step 1/2/3. Verify `claim.userId === session.user.id`.
    - **Step 1 — First Impression** (required): Single textarea. Prompt: "You just opened {targetUrl}. What's your first reaction? (1-3 sentences)"
    - **Step 2 — Task Experience** (required): Render `task.requirements.steps` as individual text inputs. Each step shows the instruction and has a textarea for the tester's answer.
    - **Step 3 — Summary** (required): NPS slider 1-10 ("Would you recommend this product?"), "Best part" textarea, "Worst part / most confusing thing" textarea. Optional: screen recording URL, audio URL (shown if task requires them).
    - Submit posts `{rawData: {firstImpression, steps:[{id, answer}], nps, best, worst}, screenRecUrl?, audioUrl?}` to submit API.
    - **Success state:** After submit, show inline success: "🎉 Thanks! +{rewardPerTester} 🪙 credits earned. Your balance: {newBalance}." + "Test another product" button (→ /tasks) + "View my tasks" link (→ /my-tasks). Use localStorage to save form draft between steps (clear on successful submit).
  - File: `human-test/app/api/tasks/[id]/submit/route.ts`
  - Action: `requireAuth()`. Verify claim ownership. **Check task status:** if task.status is COMPLETED or CANCELLED → return 410 `{error: "Task is no longer accepting submissions"}`. Build `textFeedback` as concatenated summary of all answers. Save Feedback. Update ClaimStatus to SUBMITTED. **Award credits immediately:** `awardCredits(userId, rewardPerTester, "TASK_REWARD", taskId)` on every submission (not just last). If this is the last submission (submittedCount === maxTesters): set Task COMPLETED, call `generateReport(taskId)` synchronously (which handles webhook internally). Return `{success: true, creditsEarned: rewardPerTester, newBalance}`.

- [ ] Task 15: My Tasks page (dual view)
  - File: `human-test/app/my-tasks/page.tsx`
  - Action: `requireAuth()`. **Two tabs: "Testing" and "Created".** "Testing" tab: user's claims with status badges, IN_PROGRESS → link to submit, empty state with CTA. **"Created" tab:** user's created tasks with progress (claimed/submitted counts), status badge, link to task detail (where report is visible). Empty state: "Launch your first test →".

- [ ] Task 16: AI report generation
  - File: `human-test/lib/ai-report.ts`
  - Action: `generateReport(taskId)`. Fetch task + feedbacks with user info. Build structured prompt feeding each tester's rawData (first impression, step answers, NPS, best/worst) as labeled sections. Prompt requests: Executive Summary, Key Findings ranked by severity (cite Tester N), Usability Issues, Positive Highlights, NPS analysis, Recommendations. Save to `Task.report`. Call `sendWebhook()` if webhookUrl set.

- [ ] Task 17: Webhook dispatcher
  - File: `human-test/lib/webhook.ts`
  - Action: `sendWebhook(taskId)`. SSRF check via `isPrivateUrl()`. POST `{taskId, status, title, targetUrl, report, completedAt}`. 10s timeout. Fire-and-forget.

- [ ] Task 18: Settings page + credits history
  - File: `human-test/app/settings/page.tsx`
  - Action: Show credits balance. API Key (masked, show/copy/regenerate). Curl example. **Credits history section:** list CreditTransaction records for user (newest first), showing type icon, amount (+/-), task title if linked, timestamp. Regenerate calls `POST /api/auth/regenerate-key`.
  - File: `human-test/app/api/auth/regenerate-key/route.ts`
  - Action: `requireAuth()`. New key via `crypto.randomBytes(32).toString('hex')`. Update User.

- [ ] Task 19: Landing page
  - File: `human-test/app/page.tsx`
  - Action: Dark theme. Sections: Hero ("human_test() — Let AI hire humans to test your product" + CTA → /register). How It Works (3 steps with icons). For Developers (API code snippet). For Testers ("Earn 🪙 credits by testing products"). **Mock Report Demo** — static markdown-rendered AI report sample showing what a real report looks like. Footer.

- [ ] Task 20: CORS headers + ECS deployment config
  - File: `human-test/lib/cors.ts`
  - Action: Helper `withCors(response)` that adds `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Authorization, Content-Type` to any NextResponse. Used directly in `/api/skill/*` route handlers (not via Edge middleware, to avoid runtime conflicts with Prisma).
  - File: `human-test/app/api/skill/human-test/route.ts` and `status/[id]/route.ts`
  - Action: Add `OPTIONS` handler returning 204 with CORS headers. Wrap all responses with `withCors()`.
  - File: `human-test/ecosystem.config.js`
  - Action: `module.exports = { apps: [{ name: 'human-test', script: '.next/standalone/server.js', env: { PORT: 3002, NODE_ENV: 'production', HOSTNAME: '0.0.0.0' } }] }`
  - Notes: Deploy steps: `npm run build` → `pm2 start ecosystem.config.js` → Nginx config `proxy_pass http://localhost:3002` for domain. Copy `.env` to server before first deploy.

- [ ] Task 21: Task cancel + refund endpoint
  - File: `human-test/app/api/tasks/[id]/cancel/route.ts`
  - Action: POST. `requireAuth()`. Verify creator ownership. Only OPEN or IN_PROGRESS tasks can be cancelled. Calculate refund: `rewardPerTester × (maxTesters - submittedCount)` — refund credits for unclaimed and claimed-but-not-submitted slots. `awardCredits(creatorId, refundAmount, "TASK_REFUND", taskId)`. Set task status CANCELLED. Set all IN_PROGRESS claims to ABANDONED. Return `{refunded: refundAmount, newBalance}`.
  - Notes: Already-submitted testers keep their earned credits (they did the work).

- [ ] Task 22: Early report generation endpoint
  - File: `human-test/app/api/tasks/[id]/generate-report/route.ts`
  - Action: POST. `requireAuth()`. Verify creator ownership. Require ≥1 submitted feedback, otherwise 400. Calculate refund for non-submitted slots: `rewardPerTester × (maxTesters - submittedCount)`. Refund via `awardCredits(creatorId, refundAmount, "TASK_REFUND", taskId)`. Set remaining IN_PROGRESS claims to ABANDONED. Set task status COMPLETED. Call `generateReport(taskId)` synchronously (which handles webhook internally). Return `{report, refunded, newBalance}`.
  - Notes: Testers who already submitted keep their credits. All non-submitted slot credits (unclaimed + claimed-but-not-submitted) are refunded to creator.

### Acceptance Criteria

**Skill API:**
- [ ] AC1: Given a valid API key, when POST `/api/skill/human-test` with `{"url":"https://example.com"}`, then return 200 with `{taskId, status:"OPEN", testPlan:{steps:[...]}}` and task visible on /tasks
- [ ] AC2: Given an invalid API key, when POST `/api/skill/human-test`, then return 401
- [ ] AC3: Given valid API key and missing `url`, then return 400 with Zod validation error
- [ ] AC4: Given a completed task, when GET `/api/skill/status/:id`, then return report field with full AI report
- [ ] AC5: Given task with webhookUrl, when last tester submits, then report POSTed to webhookUrl
- [ ] AC6: Given webhookUrl pointing to private IP, when task completes, then webhook skipped (SSRF protection)
- [ ] AC7: Given OPTIONS request to `/api/skill/*`, then return 204 with CORS headers

**Credits:**
- [ ] AC8: Given new user registration, then User.credits = 100 and CreditTransaction SIGNUP_BONUS record created
- [ ] AC9: Given user creating a 5-person task at 20 credits/tester, then 100 credits deducted and CreditTransaction TASK_CREATION record created
- [ ] AC10: Given insufficient credits (< rewardPerTester × maxTesters), when creating task, then return 402 with balance info
- [ ] AC11: Given tester submitting feedback, then rewardPerTester credits awarded **immediately** to that tester (not deferred to last submission) and CreditTransaction TASK_REWARD record created

**Registration & Auth:**
- [ ] AC12: Given new user registering, then account created with 64-char hex apiKey, 100 credits, redirect to /onboarding
- [ ] AC13: Given user on /onboarding, then see two choices: "Test first" and "Create test", with credits balance shown
- [ ] AC14: Given registered user on /settings, then API Key masked with show/copy/regenerate options and credits balance shown
- [ ] AC15: Given duplicate email registration, then return 409

**Task Lifecycle:**
- [ ] AC16: Given logged-in user on /tasks, then see cards with 🪙 credits and ⏱ estimated time
- [ ] AC17: Given task creation via web form, then "Preview Test Plan" button generates AI steps inline before submission
- [ ] AC18: Given logged-in user claiming task, then DB unique constraint prevents concurrent duplicate claims (409)
- [ ] AC19: Given tester on submit page, then see 3-step form: first impression → task steps → NPS/best/worst
- [ ] AC20: Given user submitting another user's claim, then return 403

**AI Report & Test Plan:**
- [ ] AC21: Given task creation, then test steps auto-generated from URL+focus and stored in requirements JSON
- [ ] AC22: Given all testers submitted, then AI report generated synchronously with tester attribution and NPS analysis
- [ ] AC23: Given two simultaneous "last" submissions, then only one report generated (transaction atomicity)
- [ ] AC24: Given completed task queried via status API, then report field contains full generated report

**Security:**
- [ ] AC25: Given `javascript:` URL as targetUrl, then return 400
- [ ] AC26: Given lowercase "bearer" prefix in Authorization header, then auth succeeds
- [ ] AC27: Given creator attempting to claim own task, then return 403

**Cancel & Early Report:**
- [ ] AC28: Given creator cancelling OPEN task with 0 claims, then full credits refunded and CreditTransaction TASK_REFUND created
- [ ] AC29: Given creator cancelling IN_PROGRESS task with 2/5 submitted, then refund = rewardPerTester × 3 (unclaimed slots), submitted testers keep their credits
- [ ] AC30: Given creator clicking "Generate Report Now" with 3/5 submitted, then report generated from 3 submissions, unclaimed slot credits refunded, task set to COMPLETED
- [ ] AC31: Given creator attempting early report with 0 submissions, then return 400

**Submit Success & Report Display:**
- [ ] AC32: Given tester submitting feedback, then see success message with credits earned and new balance
- [ ] AC33: Given COMPLETED task, then report visible on `/tasks/{id}` without auth (public shareable URL)
- [ ] AC34: Given user on /my-tasks, then see two tabs: "Testing" (claimed tasks) and "Created" (created tasks with progress + report links)
- [ ] AC35: Given user on /settings, then see credits transaction history (type, amount, date)
- [ ] AC36: Given Skill API task creation without title, then title auto-generated as "Test: {hostname}"
- [ ] AC37: Given tester submitting to COMPLETED or CANCELLED task, then return 410 "Task is no longer accepting submissions"

## Additional Context

### Dependencies

**npm packages:**
- `next` (14.x) — framework
- `react`, `react-dom` (18.x) — UI
- `typescript` — type safety
- `tailwindcss`, `postcss`, `autoprefixer` — styling
- `prisma`, `@prisma/client` — ORM + MySQL driver
- `next-auth` (4.x) — authentication
- `bcryptjs`, `@types/bcryptjs` — password hashing
- `zod` — input validation and schema definition
- `openai` or `@anthropic-ai/sdk` — AI report generation
- `react-markdown` + `remark-gfm` — render AI report as HTML on task detail page
- shadcn/ui components (installed via CLI, not npm)

**External services:**
- Aliyun RDS MySQL 8.0.36 — primary database (`human_test` DB, utf8mb4_unicode_ci)
- Claude API or OpenAI API — AI report generation + AI test plan generation
- Aliyun ECS (Ubuntu 24.04) — hosting via PM2 + Nginx (port 3002 → 80/443)

**Deployment config:**
- `ecosystem.config.js` — PM2 process manager config (standalone Next.js output)
- `next.config.js` — `output: 'standalone'` for ECS deployment
- Nginx reverse proxy: `proxy_pass http://localhost:3002`

**Environment variables required:**
- `DATABASE_URL` — MySQL connection string (`mysql://user:pass@rm-cn-3ic4nqxx30002fso.rwlb.rds.aliyuncs.com:3306/human_test`)
- `NEXTAUTH_SECRET` — random secret for JWT signing
- `NEXTAUTH_URL` — app URL (e.g. `http://47.98.136.200` or custom domain)
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` — for AI report and test plan generation

### Testing Strategy

**MVP Testing (manual, focused on critical paths):**

1. **Skill API smoke test:** curl commands to create task, query status, verify webhook
   - `curl -X POST .../api/skill/human-test -H "Authorization: Bearer <key>" -d '{"url":"https://example.com"}'`
   - Verify task appears on web, claim it, submit feedback, verify report generated
2. **Auth flow:** register new user → verify API key is 64-char hex → login → logout → login again → regenerate key → verify old key rejected
3. **Full lifecycle test:** API create task → web claim → web submit feedback (all 3 types) → verify AI report with tester attribution → verify webhook fires
4. **Concurrency tests:** two simultaneous claims by same user (verify only one succeeds), two simultaneous "last" submissions (verify only one report generated)
5. **Security tests:** SSRF — create task with `webhookUrl: "http://169.254.169.254/"` (verify blocked). XSS — submit feedback with `<script>` tags (verify escaped). Invalid URLs — `javascript:alert(1)` as targetUrl (verify rejected).
6. **Edge cases:** duplicate registration, claim full task, submit without claiming, invalid API key, malformed Bearer header, oversized input fields
7. **Cancel + refund flow:** create task → cancel with 0 claims (verify full refund) → cancel with partial submissions (verify correct partial refund, submitted testers keep credits)
8. **Early report generation:** create task → get 2/5 submissions → "Generate Report Now" → verify report generated from 2 submissions, unclaimed credits refunded, remaining claims abandoned
9. **Self-claim prevention:** creator attempts to claim own task (verify 403)
10. **Late submission rejection:** create task → "Generate Report Now" → existing claimer tries to submit (verify 410)

**Post-MVP:** Add Playwright e2e tests for critical flows.

### Notes

**High-risk items:**
- AI report quality depends heavily on prompt engineering — may need iteration after first real tests
- AI test plan generation adds latency to task creation form — show loading state, graceful fallback to empty steps on API error
- Webhook delivery is fire-and-forget in MVP — no retry, no delivery confirmation
- Report generation is synchronous on ECS (last submitter waits) — acceptable for MVP with persistent process (no serverless timeout)
- Credits system: ensure atomic deduction (Prisma transaction) — over-deducting credits on error erodes trust fast

**Known limitations:**
- No real-time updates (testers must refresh to see new tasks)
- No email notifications when task is assigned or report ready
- No file upload — all media via external URLs (Loom, Google Drive, etc.)
- No rate limiting on API — could be abused (add in v2)
- No claim expiration mechanism — a tester who claims but never submits blocks that slot permanently. Mitigation: creator can "Generate Report Now" or "Cancel" to reclaim credits and unblock. V2: add `claimDeadline` with auto-expiration cron job.
- Task list is public (no auth required to browse) — accepted design trade-off for marketplace visibility. Full target URLs only shown to logged-in users on detail page.
- No pagination beyond task list — my-tasks page unbounded (acceptable for MVP scale)
- Credits are non-transferable and have no cash value in MVP — communicate clearly in onboarding
- Feedback form uses localStorage for draft persistence — not cross-device, cleared on submit. Acceptable for MVP.

**Future considerations (out of scope):**
- Payment system (Stripe integration)
- Credit/reputation scoring for testers
- Real-time task feed via WebSocket/SSE
- Built-in screen recording (no external tool needed)
- OpenClaw Skill marketplace listing (ClawHub)
- Mobile-responsive task completion flow optimization
- Claim expiration with cron job (auto-ABANDON after 24h)
- API rate limiting (per-key throttling)
- Async report generation via queue (for scale)
