import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { sendWebhook } from '@/lib/webhook'
import { mkdtemp, readdir, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.aicodewith.com',
})

interface ReportIssue {
  severity: string
  title: string
  evidence: string
  impact: string
  recommendation: string
}

function parseReportIssues(report: string): ReportIssue[] {
  const issues: ReportIssue[] = []
  const issueRegex = /###\s*\[(CRITICAL|MAJOR|MINOR)\]\s*(.+)/g
  let match: RegExpExecArray | null

  while ((match = issueRegex.exec(report)) !== null) {
    const severity = match[1]
    const title = match[2].trim()
    // Extract the section after this header until the next ### or ##
    const startIdx = match.index + match[0].length
    const nextSection = report.slice(startIdx).search(/^##/m)
    const section = nextSection === -1
      ? report.slice(startIdx)
      : report.slice(startIdx, startIdx + nextSection)

    const evidenceMatch = section.match(/\*\*Evidence:\*\*\s*([\s\S]+)/)
    const impactMatch = section.match(/\*\*Impact:\*\*\s*([\s\S]+?)(?=\n-\s*\*\*|$)/)
    const recMatch = section.match(/\*\*Recommendation:\*\*\s*([\s\S]+?)(?=\n###|\n##|$)/)

    issues.push({
      severity,
      title,
      evidence: evidenceMatch?.[1]?.trim() || '',
      impact: impactMatch?.[1]?.trim() || '',
      recommendation: recMatch?.[1]?.trim() || '',
    })
  }

  return issues
}

function getAuthCloneUrl(repoUrl: string): string {
  const url = new URL(repoUrl)
  const host = url.hostname.toLowerCase()

  if (host === 'github.com' && process.env.GITHUB_TOKEN) {
    return `https://x-access-token:${process.env.GITHUB_TOKEN}@github.com${url.pathname.replace(/\.git$/, '')}.git`
  }
  if (host === 'gitee.com' && process.env.GITEE_TOKEN) {
    return `https://oauth2:${process.env.GITEE_TOKEN}@gitee.com${url.pathname.replace(/\.git$/, '')}.git`
  }
  // Fallback: clone without auth (public repos)
  return repoUrl
}

function getRepoHost(repoUrl: string): 'github' | 'gitee' {
  return new URL(repoUrl).hostname.toLowerCase() === 'gitee.com' ? 'gitee' : 'github'
}

function getOwnerRepo(repoUrl: string): { owner: string; repo: string } {
  const parts = new URL(repoUrl).pathname.replace(/\.git$/, '').split('/').filter(Boolean)
  return { owner: parts[0], repo: parts[1] }
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', '.next', 'build', '.cache',
  'coverage', '.turbo', 'vendor', '__pycache__', '.venv',
])

const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.vue', '.svelte',
  '.css', '.scss', '.html', '.py', '.go', '.rs',
  '.java', '.kt', '.rb', '.php', '.swift', '.c', '.cpp', '.h',
])

async function walkSourceFiles(dir: string, base: string = dir): Promise<string[]> {
  const files: string[] = []
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...await walkSourceFiles(fullPath, base))
    } else if (entry.isFile()) {
      const ext = entry.name.slice(entry.name.lastIndexOf('.'))
      if (CODE_EXTENSIONS.has(ext)) {
        files.push(fullPath.slice(base.length + 1)) // relative path
      }
    }
  }

  return files
}

async function findRelevantFiles(
  repoDir: string,
  issues: ReportIssue[],
  maxFiles: number = 20,
): Promise<{ path: string; content: string }[]> {
  const allFiles = await walkSourceFiles(repoDir)

  // Extract keywords from issue recommendations and titles
  const keywords = issues.flatMap(issue => {
    const text = `${issue.title} ${issue.recommendation}`.toLowerCase()
    return text.split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['that', 'this', 'with', 'from', 'should', 'could', 'would', 'have', 'been', 'more', 'when', 'also', 'such', 'each', 'make', 'like'].includes(w))
  })
  const uniqueKeywords = [...new Set(keywords)]

  // Score each file by keyword matches in path + content
  const scored: { path: string; content: string; score: number }[] = []

  for (const relPath of allFiles) {
    const fullPath = join(repoDir, relPath)
    let content: string
    try {
      content = await readFile(fullPath, 'utf-8')
    } catch {
      continue
    }
    // Skip very large files
    if (content.length > 100_000) continue

    const lowerPath = relPath.toLowerCase()
    const lowerContent = content.toLowerCase()
    let score = 0

    for (const kw of uniqueKeywords) {
      if (lowerPath.includes(kw)) score += 3
      // Count occurrences in content (cap at 5 per keyword)
      const matches = lowerContent.split(kw).length - 1
      score += Math.min(matches, 5)
    }

    if (score > 0) {
      scored.push({ path: relPath, content, score })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxFiles).map(({ path, content }) => ({ path, content }))
}

async function generateCodeSuggestions(
  issues: ReportIssue[],
  files: { path: string; content: string }[],
  targetUrl: string,
): Promise<string> {
  const fileContents = files.map(f => {
    // Truncate very long files to first 500 lines
    const lines = f.content.split('\n')
    const truncated = lines.length > 500
      ? lines.slice(0, 500).join('\n') + '\n// ... (truncated)'
      : f.content
    return `### ${f.path}\n\`\`\`\n${truncated}\n\`\`\``
  }).join('\n\n')

  const issueDescriptions = issues.map(i =>
    `### [${i.severity}] ${i.title}\n- Evidence: ${i.evidence}\n- Impact: ${i.impact}\n- Recommendation: ${i.recommendation}`
  ).join('\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: `You are an expert code reviewer. Given usability issues found by real human testers and the relevant source code files, generate specific code-level fix suggestions.

For each issue that can be addressed in code, produce a unified diff. If an issue requires design/copy changes rather than code changes, describe the change in prose instead.

Output format — for each fixable issue:

### [SEVERITY] Issue title
**File:** \`path/to/file.ext\`
**Lines:** ~N-M

\`\`\`diff
--- a/path/to/file.ext
+++ b/path/to/file.ext
@@ -N,X +N,Y @@
 context line
-old line
+new line
 context line
\`\`\`

**Explanation:** Brief description of why this fix addresses the issue.

If an issue cannot be fixed in code (e.g., requires new assets, infrastructure changes, or policy decisions), say so briefly and skip it.`,
    messages: [{
      role: 'user',
      content: `## Usability Issues Found by Human Testers
Product URL: ${targetUrl}

${issueDescriptions}

## Source Code Files

${fileContents}

Generate code fix suggestions for the issues above. Focus on CRITICAL and MAJOR issues first.`,
    }],
    temperature: 0.3,
  }, { timeout: 300000 })

  const text = response.content[0]
  return (text && text.type === 'text') ? text.text : 'No code suggestions generated.'
}

async function tryCreatePR(
  repoDir: string,
  repoUrl: string,
  taskId: string,
  suggestions: string,
): Promise<string | null> {
  const host = getRepoHost(repoUrl)
  const { owner, repo } = getOwnerRepo(repoUrl)

  // Test write access with dry-run push
  try {
    await execFileAsync('git', [
      'push', '--dry-run', 'origin', 'HEAD',
    ], { cwd: repoDir, timeout: 15000 })
  } catch {
    // No write access — Mode 1
    return null
  }

  const branchName = `human-test/fixes-${taskId}`

  try {
    // Create branch
    await execFileAsync('git', ['checkout', '-b', branchName], { cwd: repoDir })

    // Extract diffs from suggestions and try to apply them
    const diffBlocks = extractDiffsFromSuggestions(suggestions)
    if (diffBlocks.length === 0) return null

    let appliedAny = false
    for (const diff of diffBlocks) {
      try {
        await applyDiff(repoDir, diff)
        appliedAny = true
      } catch (err) {
        console.warn(`[CodeFix ${taskId}] Failed to apply diff for ${diff.file}:`, err)
      }
    }

    if (!appliedAny) return null

    // Commit and push
    await execFileAsync('git', ['add', '-A'], { cwd: repoDir })
    await execFileAsync('git', [
      'commit', '-m', `fix: apply human_test() usability fixes for task ${taskId}\n\nAutomated fixes based on real human usability testing feedback.\nSee: https://human-test.work/tasks/${taskId}`,
    ], { cwd: repoDir, env: { ...process.env, GIT_AUTHOR_NAME: 'human_test', GIT_AUTHOR_EMAIL: 'bot@human-test.work', GIT_COMMITTER_NAME: 'human_test', GIT_COMMITTER_EMAIL: 'bot@human-test.work' } })

    await execFileAsync('git', ['push', '-u', 'origin', branchName], { cwd: repoDir, timeout: 30000 })

    // Create PR via API
    const prUrl = await createPullRequest(host, owner, repo, branchName, taskId)
    return prUrl
  } catch (err) {
    console.error(`[CodeFix ${taskId}] Failed to create PR:`, err)
    return null
  }
}

interface DiffBlock {
  file: string
  diff: string
}

function extractDiffsFromSuggestions(suggestions: string): DiffBlock[] {
  const blocks: DiffBlock[] = []
  const diffRegex = /```diff\n([\s\S]*?)```/g
  let match: RegExpExecArray | null

  while ((match = diffRegex.exec(suggestions)) !== null) {
    const diffContent = match[1].trim()
    // Extract file from --- a/ line
    const fileMatch = diffContent.match(/^---\s*a\/(.+)/m)
    if (fileMatch) {
      blocks.push({ file: fileMatch[1].trim(), diff: diffContent })
    }
  }

  return blocks
}

async function applyDiff(repoDir: string, diff: DiffBlock): Promise<void> {
  const { writeFile: writeFileAsync } = await import('fs/promises')
  const patchPath = join(repoDir, '.human-test-patch.diff')

  try {
    await writeFileAsync(patchPath, diff.diff + '\n')
    await execFileAsync('git', ['apply', '--check', '.human-test-patch.diff'], { cwd: repoDir })
    await execFileAsync('git', ['apply', '.human-test-patch.diff'], { cwd: repoDir })
  } finally {
    try { await rm(patchPath) } catch {}
  }
}

async function createPullRequest(
  host: 'github' | 'gitee',
  owner: string,
  repo: string,
  branch: string,
  taskId: string,
): Promise<string> {
  const title = `fix: usability issues found by human_test()`
  const body = `## Automated Usability Fixes

These fixes were generated based on real human usability testing feedback from [human_test()](https://human-test.work).

**Task:** https://human-test.work/tasks/${taskId}

### What happened
1. Real human testers used the product and provided structured feedback
2. AI analyzed the feedback and generated a usability report with severity-ranked issues
3. The source code was analyzed against those issues
4. This PR contains automated fix suggestions for the most impactful issues

Please review each change carefully before merging.`

  if (host === 'github') {
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('GITHUB_TOKEN not set')

    // Get default branch
    const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    })
    if (!repoRes.ok) throw new Error(`GitHub repo API failed: ${repoRes.status}`)
    const repoData = await repoRes.json() as { default_branch: string }

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body,
        head: branch,
        base: repoData.default_branch,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`GitHub PR creation failed: ${res.status} ${errText}`)
    }

    const prData = await res.json() as { html_url: string }
    return prData.html_url
  } else {
    // Gitee
    const token = process.env.GITEE_TOKEN
    if (!token) throw new Error('GITEE_TOKEN not set')

    const res = await fetch(`https://gitee.com/api/v5/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: token,
        title,
        body,
        head: branch,
        base: 'master',
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Gitee PR creation failed: ${res.status} ${errText}`)
    }

    const prData = await res.json() as { html_url: string }
    return prData.html_url
  }
}

export async function runCodeFixAnalysis(taskId: string): Promise<void> {
  let tempDir: string | null = null

  try {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        report: true,
        repoUrl: true,
        repoBranch: true,
        targetUrl: true,
        webhookUrl: true,
      },
    })

    if (!task?.report || !task.repoUrl) {
      throw new Error('Task missing report or repoUrl')
    }

    // 1. Parse report issues
    const issues = parseReportIssues(task.report)
    if (issues.length === 0) {
      console.log(`[CodeFix ${taskId}] No parseable issues found in report`)
      await prisma.task.update({
        where: { id: taskId },
        data: { codeFixStatus: 'COMPLETED' },
      })
      if (task.webhookUrl) {
        try { await sendWebhook(taskId) } catch (err) { console.error('Webhook error:', err) }
      }
      return
    }

    // 2. Clone repo
    tempDir = await mkdtemp(join(tmpdir(), 'code-fix-'))
    const cloneUrl = getAuthCloneUrl(task.repoUrl)
    const cloneArgs = ['clone', '--depth', '1', '--single-branch']
    if (task.repoBranch) {
      cloneArgs.push('--branch', task.repoBranch)
    }
    cloneArgs.push(cloneUrl, tempDir)

    console.log(`[CodeFix ${taskId}] Cloning repo...`)
    await execFileAsync('git', cloneArgs, { timeout: 60000 })

    // 3. Find relevant source files
    console.log(`[CodeFix ${taskId}] Finding relevant files for ${issues.length} issues...`)
    const relevantFiles = await findRelevantFiles(tempDir, issues)
    console.log(`[CodeFix ${taskId}] Found ${relevantFiles.length} relevant files`)

    if (relevantFiles.length === 0) {
      await prisma.task.update({
        where: { id: taskId },
        data: {
          codeFixStatus: 'COMPLETED',
          report: task.report + '\n\n## Code Fix Suggestions\n\nNo relevant source files found in the repository to generate code-level fix suggestions.',
        },
      })
      if (task.webhookUrl) {
        try { await sendWebhook(taskId) } catch (err) { console.error('Webhook error:', err) }
      }
      return
    }

    // 4. Generate code suggestions via Claude
    console.log(`[CodeFix ${taskId}] Generating code suggestions...`)
    const suggestions = await generateCodeSuggestions(issues, relevantFiles, task.targetUrl)

    // 5. Try Mode 2: create PR
    let prUrl: string | null = null
    try {
      prUrl = await tryCreatePR(tempDir, task.repoUrl, taskId, suggestions)
      if (prUrl) {
        console.log(`[CodeFix ${taskId}] PR created: ${prUrl}`)
      } else {
        console.log(`[CodeFix ${taskId}] Mode 1 (read-only): no PR created`)
      }
    } catch (err) {
      console.warn(`[CodeFix ${taskId}] PR creation failed:`, err)
    }

    // 6. Append suggestions to report
    const prSection = prUrl
      ? `\n\n> **Pull Request:** [View PR](${prUrl}) — automated fixes have been pushed for review.`
      : ''

    const updatedReport = task.report + `\n\n## Code Fix Suggestions${prSection}\n\n${suggestions}`

    await prisma.task.update({
      where: { id: taskId },
      data: {
        report: updatedReport,
        codeFixStatus: 'COMPLETED',
        codeFixPrUrl: prUrl,
      },
    })

    // 7. Send webhook with updated report
    if (task.webhookUrl) {
      try { await sendWebhook(taskId) } catch (err) { console.error('Webhook error:', err) }
    }

    console.log(`[CodeFix ${taskId}] Code fix analysis complete`)
  } catch (err) {
    console.error(`[CodeFix ${taskId}] Failed:`, err)
    await prisma.task.update({
      where: { id: taskId },
      data: { codeFixStatus: 'FAILED' },
    }).catch(() => {})

    // Still send webhook on failure so consumer knows
    try {
      const task = await prisma.task.findUnique({ where: { id: taskId }, select: { webhookUrl: true } })
      if (task?.webhookUrl) {
        await sendWebhook(taskId)
      }
    } catch {}
  } finally {
    // Cleanup temp dir
    if (tempDir) {
      try { await rm(tempDir, { recursive: true, force: true }) } catch {}
    }
  }
}
