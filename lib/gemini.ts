import { GoogleGenAI, FileState, createPartFromUri } from '@google/genai'
import { writeFile, unlink, mkdtemp } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

let client: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI {
  if (client) return client
  client = new GoogleGenAI({
    apiKey: process.env.ANTHROPIC_API_KEY,
    httpOptions: {
      baseUrl: process.env.GEMINI_BASE_URL || 'https://api.aicodewith.com',
    },
  })
  return client
}

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
  const dir = await mkdtemp(join(tmpdir(), 'gemini-'))
  const filePath = join(dir, `file${ext}`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  await writeFile(filePath, buffer)
  return filePath
}

function getMimeType(url: string): string {
  const lower = url.toLowerCase()
  if (lower.includes('.webm')) return 'video/webm'
  if (lower.includes('.mp4')) return 'video/mp4'
  if (lower.includes('.mov')) return 'video/quicktime'
  if (lower.includes('.avi')) return 'video/x-msvideo'
  if (lower.includes('.ogg') && lower.includes('audio')) return 'audio/ogg'
  if (lower.includes('.ogg')) return 'video/ogg'
  if (lower.includes('.webm') && lower.includes('audio')) return 'audio/webm'
  if (lower.includes('.mp3')) return 'audio/mpeg'
  if (lower.includes('.wav')) return 'audio/wav'
  if (lower.includes('.m4a')) return 'audio/mp4'
  // Default based on context
  return 'video/webm'
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

async function uploadAndWaitForActive(
  ai: GoogleGenAI,
  filePath: string,
  mimeType: string,
): Promise<string> {
  const uploaded = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  })

  if (!uploaded.name) throw new Error('Upload returned no file name')

  // Poll until ACTIVE (max 5 minutes)
  const maxWait = 5 * 60 * 1000
  const interval = 2000
  const start = Date.now()

  let file = uploaded
  while (file.state === FileState.PROCESSING) {
    if (Date.now() - start > maxWait) {
      throw new Error(`File ${uploaded.name} stuck in PROCESSING after 5 minutes`)
    }
    await new Promise((r) => setTimeout(r, interval))
    file = await ai.files.get({ name: uploaded.name! })
  }

  if (file.state === FileState.FAILED) {
    throw new Error(`File processing failed: ${uploaded.name}`)
  }

  return uploaded.name
}

async function cleanupFile(ai: GoogleGenAI, fileName: string) {
  try {
    await ai.files.delete({ name: fileName })
  } catch (e) {
    console.warn('Failed to delete Gemini file:', fileName, e)
  }
}

async function cleanupTempFile(filePath: string) {
  try {
    await unlink(filePath)
  } catch {
    // ignore
  }
}

export async function analyzeMediaForFeedback(
  feedback: FeedbackForAnalysis,
  task: TaskForAnalysis,
): Promise<string> {
  const ai = getGeminiClient()
  const raw = feedback.rawData as RawData | null
  const tempFiles: string[] = []
  const geminiFileNames: string[] = []

  try {
    const fileParts: Array<ReturnType<typeof createPartFromUri>> = []

    // Upload screen recording
    if (feedback.screenRecUrl) {
      const mimeType = getMimeType(feedback.screenRecUrl)
      const ext = getExtension(feedback.screenRecUrl)
      const tempPath = await downloadToTemp(feedback.screenRecUrl, ext)
      tempFiles.push(tempPath)

      const fileName = await uploadAndWaitForActive(ai, tempPath, mimeType)
      geminiFileNames.push(fileName)

      const fileInfo = await ai.files.get({ name: fileName })
      if (fileInfo.uri) {
        fileParts.push(createPartFromUri(fileInfo.uri, mimeType))
      }
    }

    // Upload audio
    if (feedback.audioUrl) {
      const mimeType = getMimeType(feedback.audioUrl)
      const ext = getExtension(feedback.audioUrl)
      const tempPath = await downloadToTemp(feedback.audioUrl, ext)
      tempFiles.push(tempPath)

      const fileName = await uploadAndWaitForActive(ai, tempPath, mimeType)
      geminiFileNames.push(fileName)

      const fileInfo = await ai.files.get({ name: fileName })
      if (fileInfo.uri) {
        fileParts.push(createPartFromUri(fileInfo.uri, mimeType))
      }
    }

    if (fileParts.length === 0) {
      return 'No media files were submitted for analysis.'
    }

    const testerName = feedback.user.name || 'Anonymous Tester'

    const promptText = `You are a UX research analyst reviewing a usability test recording.
This is a screen recording of a real user testing the product "${task.title}" at ${task.targetUrl}.
${task.focus ? `Focus area: ${task.focus}` : ''}

The tester (${testerName}) also provided this structured feedback:
- First Impression: ${raw?.firstImpression || 'N/A'}
- NPS Score: ${raw?.nps ?? 'N/A'}/10
- Best Part: ${raw?.best || 'N/A'}
- Worst Part: ${raw?.worst || 'N/A'}
${raw?.steps?.length ? `- Task Steps:\n${raw.steps.map((s) => `  - Step ${s.id}: ${s.answer}`).join('\n')}` : ''}
${feedback.textFeedback ? `- Additional Feedback: ${feedback.textFeedback}` : ''}

Analyze the video and audio carefully. Provide:
1. **Timeline Summary** — key moments with approximate timestamps
2. **Excitement Points** — moments where the user showed positive engagement, delight, or satisfaction
3. **Frustration Points** — moments where the user showed confusion, hesitation, or frustration
4. **Usage Friction** — specific UI/UX blockers where the user got stuck or couldn't proceed
5. **Behavioral Observations** — navigation patterns, mouse movements, repeated actions, verbal reactions
6. **Tester Verdict** — overall assessment based on video behavior + written feedback

Use markdown formatting. Be specific about what you observed.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro-preview-06-05',
      contents: [
        {
          role: 'user',
          parts: [...fileParts, { text: promptText }],
        },
      ],
      config: {
        temperature: 0.5,
      },
    })

    return response.text ?? 'Analysis produced no output.'
  } finally {
    // Cleanup
    for (const f of tempFiles) await cleanupTempFile(f)
    for (const f of geminiFileNames) await cleanupFile(ai, f)
  }
}

export async function generateAggregateReport(
  task: TaskForAnalysis,
  feedbackAnalyses: Array<{
    testerName: string
    mediaAnalysis: string | null
    textFeedback: string | null
    rawData: unknown
    nps: number | null
  }>,
): Promise<string> {
  const ai = getGeminiClient()

  const testerSections = feedbackAnalyses
    .map((fb, i) => {
      const raw = fb.rawData as RawData | null
      return `---
### Tester ${i + 1}: ${fb.testerName}
**NPS Score:** ${fb.nps ?? 'N/A'}/10
**First Impression:** ${raw?.firstImpression || 'N/A'}
**Best Part:** ${raw?.best || 'N/A'}
**Worst Part:** ${raw?.worst || 'N/A'}
${raw?.steps?.length ? `**Task Steps:**\n${raw.steps.map((s) => `- Step ${s.id}: ${s.answer}`).join('\n')}` : ''}
${fb.textFeedback ? `**Additional Feedback:** ${fb.textFeedback}` : ''}

**Media Analysis:**
${fb.mediaAnalysis || '_No media analysis available_'}`
    })
    .join('\n\n')

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

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-pro-preview-06-05',
    contents: prompt,
    config: {
      temperature: 0.5,
    },
  })

  return response.text ?? 'Aggregate report generation produced no output.'
}
