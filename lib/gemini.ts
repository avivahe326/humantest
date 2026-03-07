import { chat, type ContentBlock } from '@/lib/ai-client'
import { getLanguageInstruction } from '@/lib/ai-locale'
import { writeFile, unlink, mkdtemp, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface RawData {
  firstImpression: string
  steps: { id: string; answer: string }[]
  nps: number
  best: string
  worst: string
}

interface FeedbackForAnalysis {
  id: string
  screenRecUrl: string | null
  audioUrl: string | null
  textFeedback: string | null
  rawData: unknown
  user: { name: string | null }
}

interface TaskForAnalysis {
  title: string
  targetUrl: string
  focus: string | null
}

async function downloadToTemp(url: string, ext: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'media-'))
  const filePath = join(dir, `file${ext}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  await writeFile(filePath, buffer)
  return filePath
}

function getExtension(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('.webm')) return '.webm'
  if (lower.includes('.mp4')) return '.mp4'
  if (lower.includes('.mov')) return '.mov'
  if (lower.includes('.mp3')) return '.mp3'
  if (lower.includes('.wav')) return '.wav'
  if (lower.includes('.m4a')) return '.m4a'
  if (lower.includes('.ogg')) return '.ogg'
  return '.webm'
}

async function extractKeyFrames(videoPath: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'frames-'))
  const outputPattern = join(dir, 'frame-%04d.jpg')

  // Get video duration first
  let durationSec = 60
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
    ])
    durationSec = Math.max(1, Math.floor(parseFloat(stdout.trim())))
  } catch {}

  // Extract 1 frame every 3 seconds, resize to 1280px wide, lower quality
  const interval = 3

  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-vf', `fps=1/${interval},scale=1280:-2`,
    '-q:v', '8',
    outputPattern,
    '-y',
  ])

  const files = await readdir(dir)
  const framePaths = files
    .filter(f => f.startsWith('frame-') && f.endsWith('.jpg'))
    .sort()
    .map(f => join(dir, f))

  return framePaths
}

async function transcribeAudio(audioPath: string): Promise<string | null> {
  // Extract audio to wav, then use a simple approach:
  // Send audio description request to Claude with context
  // Since we can't directly transcribe, we'll note that audio exists
  // and rely on the text feedback for content
  return null
}

async function cleanupFiles(paths: string[]) {
  for (const p of paths) {
    try { await unlink(p) } catch {}
  }
}

export async function analyzeMediaForFeedback(
  feedback: FeedbackForAnalysis,
  task: TaskForAnalysis,
  locale?: string | null,
): Promise<string> {
  const raw = feedback.rawData as RawData | null
  const tempFiles: string[] = []

  try {
    let allFramePaths: string[] = []

    // Extract key frames from screen recording
    if (feedback.screenRecUrl) {
      const ext = getExtension(feedback.screenRecUrl)
      const videoPath = await downloadToTemp(feedback.screenRecUrl, ext)
      tempFiles.push(videoPath)

      try {
        const framePaths = await extractKeyFrames(videoPath)
        tempFiles.push(...framePaths)
        allFramePaths = framePaths
      } catch (e) {
        console.warn('Failed to extract frames:', e)
      }
    }

    if (allFramePaths.length === 0 && !feedback.audioUrl) {
      return 'No media files were submitted for analysis.'
    }

    const testerName = feedback.user.name || 'Anonymous Tester'
    const totalFrames = allFramePaths.length

    const contextText = `You are a UX research analyst reviewing screenshots from a usability test screen recording.
These are key frames extracted every 3 seconds from a screen recording of a real user testing the product "${task.title}" at ${task.targetUrl}.
${task.focus ? `Focus area: ${task.focus}` : ''}

The tester (${testerName}) also provided this structured feedback:
- First Impression: ${raw?.firstImpression || 'N/A'}
- NPS Score: ${raw?.nps ?? 'N/A'}/10
- Best Part: ${raw?.best || 'N/A'}
- Worst Part: ${raw?.worst || 'N/A'}
${raw?.steps?.length ? `- Task Steps:\n${raw.steps.map((s) => `  - Step ${s.id}: ${s.answer}`).join('\n')}` : ''}
${feedback.textFeedback ? `- Additional Feedback: ${feedback.textFeedback}` : ''}
${feedback.audioUrl ? `- Audio feedback was also recorded (URL: ${feedback.audioUrl})` : ''}`

    // Split frames into batches of 8 (keep total request under 4.5MB proxy limit)
    const BATCH_SIZE = 8
    const batches: string[][] = []
    for (let i = 0; i < allFramePaths.length; i += BATCH_SIZE) {
      batches.push(allFramePaths.slice(i, i + BATCH_SIZE))
    }

    if (batches.length <= 1) {
      // Single batch — analyze directly
      const contentBlocks: ContentBlock[] = []
      for (let i = 0; i < allFramePaths.length; i++) {
        const frameData = await readFile(allFramePaths[i])
        const b64 = frameData.toString('base64')
        const timeSec = i * 3
        contentBlocks.push({
          type: 'text',
          text: `[Screenshot ${i + 1}/${totalFrames} — ~${timeSec}s]`,
        })
        contentBlocks.push({
          type: 'image',
          mediaType: 'image/jpeg',
          base64Data: b64,
        })
      }

      contentBlocks.push({
        type: 'text',
        text: `${contextText}

Analyze the screenshots carefully. They are in chronological order (one every 3 seconds). Provide:
1. **Timeline Summary** — key moments based on what you see in each screenshot
2. **Excitement Points** — moments where the user appeared to engage positively with the product
3. **Frustration Points** — moments showing confusion, errors, or dead ends
4. **Usage Friction** — specific UI/UX blockers visible in the screenshots
5. **Behavioral Observations** — navigation patterns, page transitions, areas of focus
6. **Tester Verdict** — overall assessment based on screenshots + written feedback

Use markdown formatting. Be specific about what you observed in each screenshot.${getLanguageInstruction(locale)}`,
      })

      const response = await chat(
        [{ role: 'user', content: contentBlocks }],
        { maxTokens: 4096, temperature: 0.3, timeoutMs: 300000 }
      )

      return response.text || 'Analysis produced no output.'
    }

    // Multiple batches — analyze each batch, then merge
    const batchAnalyses: string[] = []
    let frameOffset = 0

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b]
      const contentBlocks: ContentBlock[] = []

      for (let i = 0; i < batch.length; i++) {
        const frameData = await readFile(batch[i])
        const b64 = frameData.toString('base64')
        const globalIdx = frameOffset + i
        const timeSec = globalIdx * 3
        contentBlocks.push({
          type: 'text',
          text: `[Screenshot ${globalIdx + 1}/${totalFrames} — ~${timeSec}s]`,
        })
        contentBlocks.push({
          type: 'image',
          mediaType: 'image/jpeg',
          base64Data: b64,
        })
      }

      contentBlocks.push({
        type: 'text',
        text: `${contextText}

This is batch ${b + 1}/${batches.length} of screenshots (frames ${frameOffset + 1}-${frameOffset + batch.length} of ${totalFrames} total, one every 3 seconds).

Describe what you observe in these screenshots: what pages/screens are shown, what the user is doing, any signs of confusion or delight, UI issues, and notable interactions. Be specific and reference screenshot numbers.${getLanguageInstruction(locale)}`,
      })

      const response = await chat(
        [{ role: 'user', content: contentBlocks }],
        { maxTokens: 2048, temperature: 0.3, timeoutMs: 300000 }
      )

      if (response.text) {
        batchAnalyses.push(`### Batch ${b + 1} (Screenshots ${frameOffset + 1}-${frameOffset + batch.length}, ~${frameOffset * 3}s-${(frameOffset + batch.length) * 3}s)\n${response.text}`)
      }
      frameOffset += batch.length
    }

    // Merge batch analyses into final report
    const mergeResponse = await chat(
      [{
        role: 'user',
        content: `${contextText}

Below are observations from ${batches.length} batches of screenshots extracted from the screen recording (${totalFrames} frames total, one every 3 seconds):

${batchAnalyses.join('\n\n---\n\n')}

---

Now synthesize all observations into a single cohesive analysis:
1. **Timeline Summary** — key moments with approximate timestamps
2. **Excitement Points** — moments where the user appeared to engage positively
3. **Frustration Points** — moments showing confusion, errors, or dead ends
4. **Usage Friction** — specific UI/UX blockers observed
5. **Behavioral Observations** — navigation patterns, page transitions, areas of focus
6. **Tester Verdict** — overall assessment based on screenshots + written feedback

Use markdown formatting. Be specific and reference timestamps.${getLanguageInstruction(locale)}`,
      }],
      { maxTokens: 4096, temperature: 0.3, timeoutMs: 300000 }
    )

    return mergeResponse.text || 'Analysis produced no output.'
  } finally {
    await cleanupFiles(tempFiles)
  }
}

interface FeedbackAnalysisInput {
  testerName: string
  mediaAnalysis: string | null
  textFeedback: string | null
  nps: number | null
}

export async function generateAggregateReport(
  task: TaskForAnalysis,
  feedbackAnalyses: FeedbackAnalysisInput[],
  locale?: string | null,
): Promise<string> {
  const testerSections = feedbackAnalyses
    .map((fb, i) => {
      const label = fb.testerName || `Tester ${i + 1}`
      return `## ${label}
**NPS Score:** ${fb.nps ?? 'N/A'}/10
${fb.mediaAnalysis ? `### Video Analysis:\n${fb.mediaAnalysis}` : '### Video Analysis:\nNo recording submitted.'}
${fb.textFeedback ? `### Text Feedback:\n${fb.textFeedback}` : ''}`
    })
    .join('\n\n---\n\n')

  const npsScores = feedbackAnalyses
    .map((fb) => fb.nps)
    .filter((n): n is number => n !== null && n !== undefined)
  const avgNps =
    npsScores.length > 0
      ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1)
      : 'N/A'

  const prompt = `You are a senior UX research analyst. Generate a structured report optimized for AI agents to parse and act on.

Below are individual analyses from ${feedbackAnalyses.length} usability testers who tested "${task.title}" (${task.targetUrl}).
${task.focus ? `Focus area: ${task.focus}` : ''}

Average NPS: ${avgNps}/10

${testerSections}

---

Generate the report with these EXACT section headers and formats:

## Metadata
| Field | Value |
|-------|-------|
| Product | ${task.title} |
| URL | ${task.targetUrl} |
| Testers | ${feedbackAnalyses.length} |
| Avg NPS | ${avgNps}/10 |
${task.focus ? `| Focus | ${task.focus} |` : ''}

## Executive Summary
(3-5 sentences. State the most critical finding first.)

## Issues
(List ALL issues found. Each issue MUST follow this exact format:)
### [SEVERITY] Issue title
- **Evidence:** (cite specific testers by name and reference their video observations/timestamps)
- **Impact:** (how it affects users — conversion, trust, task completion, etc.)
- **Recommendation:** (specific, actionable fix)
SEVERITY must be one of: CRITICAL, MAJOR, MINOR

## Positive Highlights
(What users loved, with evidence from video analysis. Cite testers by name.)

## NPS Analysis
(Score breakdown per tester, interpretation, correlation with observed issues)

## Recommendations
(Prioritized action items. Each must use a priority tag and reference the issue it addresses:)
- **P0** (fix immediately): ...
- **P1** (fix this sprint): ...
- **P2** (next sprint): ...
- **P3** (backlog): ...` + getLanguageInstruction(locale)

  const response = await chat(
    [{ role: 'user', content: prompt }],
    { maxTokens: 4096, temperature: 0.5, timeoutMs: 300000 }
  )

  return response.text || 'Aggregate report generation produced no output.'
}
