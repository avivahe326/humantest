import Anthropic from '@anthropic-ai/sdk'
import { writeFile, unlink, mkdtemp, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.aicodewith.com',
})

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

async function extractKeyFrames(videoPath: string, maxFrames: number = 15): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'frames-'))
  const outputPattern = join(dir, 'frame-%03d.jpg')

  // Get video duration first
  let durationSec = 60
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', videoPath,
    ])
    durationSec = Math.max(1, Math.floor(parseFloat(stdout.trim())))
  } catch {}

  // Calculate interval to get evenly spaced frames
  const interval = Math.max(1, Math.floor(durationSec / maxFrames))

  await execFileAsync('ffmpeg', [
    '-i', videoPath,
    '-vf', `fps=1/${interval}`,
    '-q:v', '5',
    '-frames:v', String(maxFrames),
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
): Promise<string> {
  const raw = feedback.rawData as RawData | null
  const tempFiles: string[] = []

  try {
    const contentBlocks: Anthropic.Messages.ContentBlockParam[] = []

    // Extract key frames from screen recording
    if (feedback.screenRecUrl) {
      const ext = getExtension(feedback.screenRecUrl)
      const videoPath = await downloadToTemp(feedback.screenRecUrl, ext)
      tempFiles.push(videoPath)

      try {
        const framePaths = await extractKeyFrames(videoPath)
        tempFiles.push(...framePaths)

        for (let i = 0; i < framePaths.length; i++) {
          const frameData = await readFile(framePaths[i])
          const b64 = frameData.toString('base64')
          contentBlocks.push({
            type: 'text',
            text: `[Screenshot ${i + 1}/${framePaths.length}]`,
          })
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
          })
        }
      } catch (e) {
        console.warn('Failed to extract frames:', e)
        contentBlocks.push({
          type: 'text',
          text: '[Video frame extraction failed — analyzing text feedback only]',
        })
      }
    }

    if (contentBlocks.length === 0 && !feedback.audioUrl) {
      return 'No media files were submitted for analysis.'
    }

    const testerName = feedback.user.name || 'Anonymous Tester'

    const promptText = `You are a UX research analyst reviewing screenshots from a usability test screen recording.
These are evenly-spaced key frames extracted from a screen recording of a real user testing the product "${task.title}" at ${task.targetUrl}.
${task.focus ? `Focus area: ${task.focus}` : ''}

The tester (${testerName}) also provided this structured feedback:
- First Impression: ${raw?.firstImpression || 'N/A'}
- NPS Score: ${raw?.nps ?? 'N/A'}/10
- Best Part: ${raw?.best || 'N/A'}
- Worst Part: ${raw?.worst || 'N/A'}
${raw?.steps?.length ? `- Task Steps:\n${raw.steps.map((s) => `  - Step ${s.id}: ${s.answer}`).join('\n')}` : ''}
${feedback.textFeedback ? `- Additional Feedback: ${feedback.textFeedback}` : ''}
${feedback.audioUrl ? `- Audio feedback was also recorded (URL: ${feedback.audioUrl})` : ''}

Analyze the screenshots carefully. They are in chronological order from the screen recording. Provide:
1. **Timeline Summary** — key moments based on what you see in each screenshot
2. **Excitement Points** — moments where the user appeared to engage positively with the product
3. **Frustration Points** — moments showing confusion, errors, or dead ends
4. **Usage Friction** — specific UI/UX blockers visible in the screenshots
5. **Behavioral Observations** — navigation patterns, page transitions, areas of focus
6. **Tester Verdict** — overall assessment based on screenshots + written feedback

Use markdown formatting. Be specific about what you observed in each screenshot.`

    contentBlocks.push({ type: 'text', text: promptText })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: contentBlocks }],
      temperature: 0.5,
    }, { timeout: 300000 })

    const text = response.content[0]
    return (text && text.type === 'text') ? text.text : 'Analysis produced no output.'
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

  const prompt = `You are a senior UX research analyst. Below are individual analyses from ${feedbackAnalyses.length} usability testers who tested "${task.title}" (${task.targetUrl}).
${task.focus ? `Focus area: ${task.focus}` : ''}

Average NPS: ${avgNps}/10

${testerSections}

---

Generate a comprehensive usability test report with:
1. **Executive Summary** (3-5 sentences)
2. **Key Findings** (ranked by severity, cite specific testers by name)
3. **Excitement Points** (what users loved, with evidence from video analysis)
4. **Friction & Pain Points** (critical blockers, with severity: Critical/Major/Minor)
5. **Usability Issues Timeline** (common patterns across testers)
6. **NPS Analysis** (breakdown + correlation with observed behavior)
7. **Recommendations** (prioritized actionable next steps)

Use markdown formatting. Reference specific testers and their video observations when citing evidence.`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
  }, { timeout: 300000 })

  const text = response.content[0]
  return (text && text.type === 'text') ? text.text : 'Aggregate report generation produced no output.'
}
