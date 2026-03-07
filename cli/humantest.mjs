#!/usr/bin/env node

import { execSync, spawn } from 'child_process'
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { createInterface } from 'readline'
import { randomBytes } from 'crypto'

const REPO_URL = 'https://github.com/avivahe326/humantest.git'
const APP_DIR_NAME = 'humantest'
const PM2_NAME = 'human-test'

function rl() {
  return createInterface({ input: process.stdin, output: process.stdout })
}

function ask(question, defaultValue = '') {
  return new Promise((resolve) => {
    const r = rl()
    const prompt = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `
    r.question(prompt, (answer) => {
      r.close()
      resolve(answer.trim() || defaultValue)
    })
  })
}

function askChoice(question, options) {
  return new Promise((resolve) => {
    const r = rl()
    console.log(`\n${question}`)
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.label} — ${opt.desc}`))
    r.question(`Choose [1-${options.length}]: `, (answer) => {
      r.close()
      const idx = parseInt(answer) - 1
      resolve(options[idx]?.value || options[0].value)
    })
  })
}

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: 'inherit', ...opts })
  } catch (e) {
    if (!opts.ignoreError) {
      console.error(`Command failed: ${cmd}`)
      process.exit(1)
    }
  }
}

function runCapture(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf-8', ...opts }).trim()
  } catch {
    return ''
  }
}

function hasPm2() {
  return !!runCapture('which pm2 2>/dev/null || where pm2 2>/dev/null')
}

function ensurePm2() {
  if (!hasPm2()) {
    console.log('  Installing pm2...')
    run('npm i -g pm2')
  }
}

function getAppDir() {
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, APP_DIR_NAME)
    if (existsSync(join(candidate, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(candidate, 'package.json'), 'utf-8'))
        if (pkg.name === 'human-test') return candidate
      } catch {}
    }
    if (existsSync(join(dir, 'package.json'))) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))
        if (pkg.name === 'human-test') return dir
      } catch {}
    }
    dir = resolve(dir, '..')
  }
  return null
}

function getPort(appDir) {
  try {
    const env = readFileSync(join(appDir, '.env'), 'utf-8')
    const match = env.match(/^PORT=(\d+)/m)
    if (match) return match[1]
  } catch {}
  return '3000'
}

// ─── COMMANDS ───

async function init() {
  console.log('\n  human_test() Setup\n')

  const installDir = join(process.cwd(), APP_DIR_NAME)

  if (existsSync(installDir)) {
    console.log(`  Directory "${APP_DIR_NAME}" already exists.`)
    const overwrite = await ask('  Overwrite? (y/N)', 'N')
    if (overwrite.toLowerCase() !== 'y') {
      console.log('  Aborted.')
      process.exit(0)
    }
    console.log('  Removing old installation...')
    run(`rm -rf "${installDir}"`)
  }

  // 1. Choose mode
  const mode = await askChoice('Deployment mode:', [
    { label: 'Local', desc: 'SQLite, zero config — for dev/small teams', value: 'local' },
    { label: 'Cloud', desc: 'MySQL — for production', value: 'cloud' },
  ])

  // 2. Database
  let dbUrl
  if (mode === 'local') {
    dbUrl = 'file:./data/humantest.db'
  } else {
    dbUrl = await ask('MySQL connection URL', 'mysql://user:password@localhost:3306/humantest')
  }

  // 3. AI Provider
  const aiProvider = await askChoice('AI Provider:', [
    { label: 'Anthropic (Claude)', desc: 'recommended', value: 'anthropic' },
    { label: 'OpenAI (GPT-4o)', desc: 'OpenAI official API', value: 'openai' },
    { label: 'OpenAI-compatible', desc: 'DeepSeek, Ollama, etc.', value: 'openai-compat' },
  ])

  let aiApiKey = ''
  let aiBaseUrl = ''
  let aiModel = ''

  if (aiProvider === 'anthropic') {
    aiApiKey = await ask('Anthropic API Key (required for AI reports)')
    if (!aiApiKey) {
      console.log('\n  Warning: No API key provided. Report generation will not work.')
      console.log('  You can add AI_API_KEY to .env later.\n')
    }
  } else if (aiProvider === 'openai') {
    aiApiKey = await ask('OpenAI API Key (required for AI reports)')
    if (!aiApiKey) {
      console.log('\n  Warning: No API key provided. Report generation will not work.')
      console.log('  You can add AI_API_KEY to .env later.\n')
    }
  } else {
    // openai-compat
    aiApiKey = await ask('API Key')
    aiBaseUrl = await ask('Base URL (e.g. https://api.deepseek.com/v1)')
    aiModel = await ask('Model name (e.g. deepseek-chat)')
    if (!aiApiKey || !aiBaseUrl) {
      console.log('\n  Warning: Incomplete config. You can update .env later.\n')
    }
  }

  const providerValue = aiProvider === 'openai-compat' ? 'openai' : aiProvider

  // 4. Port
  const port = await ask('Port', '3000')

  // 5. NEXTAUTH_SECRET
  const secret = randomBytes(32).toString('base64')

  // 6. Optional: SMTP
  console.log('\n  SMTP settings (optional, skip to disable email verification)')
  const smtpHost = await ask('SMTP host (press Enter to skip)')
  let smtpPort = '', smtpUser = '', smtpPass = ''
  if (smtpHost) {
    smtpPort = await ask('SMTP port', '465')
    smtpUser = await ask('SMTP user (email)')
    smtpPass = await ask('SMTP password')
  }

  // 7. Optional: GitHub token
  const githubToken = await ask('GitHub token for code fix PRs (press Enter to skip)')

  // ─── Clone repo ───
  console.log('\n  Downloading human_test()...')
  run(`git clone --depth 1 ${REPO_URL} "${installDir}"`)

  // ─── Generate .env ───
  const envLines = [
    `DATABASE_URL="${dbUrl}"`,
    `NEXTAUTH_SECRET="${secret}"`,
    `NEXTAUTH_URL="http://localhost:${port}"`,
    `PORT=${port}`,
  ]

  if (aiApiKey) {
    envLines.push(`AI_PROVIDER="${providerValue}"`)
    envLines.push(`AI_API_KEY="${aiApiKey}"`)
    // Backward compat: also set ANTHROPIC_API_KEY for existing code paths
    if (providerValue === 'anthropic') envLines.push(`ANTHROPIC_API_KEY="${aiApiKey}"`)
    if (aiBaseUrl) envLines.push(`AI_BASE_URL="${aiBaseUrl}"`)
    if (aiModel) envLines.push(`AI_MODEL="${aiModel}"`)
  }
  if (smtpHost) {
    envLines.push(`SMTP_HOST="${smtpHost}"`)
    envLines.push(`SMTP_PORT=${smtpPort}`)
    envLines.push(`SMTP_USER="${smtpUser}"`)
    envLines.push(`SMTP_PASS="${smtpPass}"`)
  }
  if (githubToken) envLines.push(`GITHUB_TOKEN="${githubToken}"`)

  writeFileSync(join(installDir, '.env'), envLines.join('\n') + '\n')

  // ─── Generate correct Prisma schema ───
  if (mode === 'local') {
    const schemaPath = join(installDir, 'prisma', 'schema.prisma')
    let schema = readFileSync(schemaPath, 'utf-8')
    schema = schema.replace('provider = "mysql"', 'provider = "sqlite"')
    schema = schema.replace(/@db\.\w+(\(\d+\))?/g, '')
    writeFileSync(schemaPath, schema)
    mkdirSync(join(installDir, 'prisma', 'data'), { recursive: true })
  }

  // ─── Install dependencies ───
  console.log('\n  Installing dependencies...')
  run('npm install', { cwd: installDir })

  // ─── Setup database ───
  console.log('\n  Setting up database...')
  run('npx prisma db push', { cwd: installDir })

  // ─── Build ───
  console.log('\n  Building application...')
  run('npm run build', { cwd: installDir })

  // ─── Ensure pm2 is available ───
  ensurePm2()

  console.log(`
  Setup complete!

  Start the server:
    cd ${APP_DIR_NAME} && humantest start

  The server will run at http://localhost:${port}
`)
}

function start() {
  const appDir = getAppDir()
  if (!appDir) {
    console.error('  human_test() installation not found. Run "humantest init" first.')
    process.exit(1)
  }

  ensurePm2()

  // Check if already running
  const pm2List = runCapture(`pm2 jlist 2>/dev/null`)
  if (pm2List) {
    try {
      const procs = JSON.parse(pm2List)
      const running = procs.find(p => p.name === PM2_NAME && p.pm2_env?.status === 'online')
      if (running) {
        console.log(`  human_test() is already running (PID ${running.pid}).`)
        return
      }
    } catch {}
  }

  const port = getPort(appDir)

  // Detect standalone mode
  const standaloneServer = join(appDir, '.next', 'standalone', 'server.js')
  const useStandalone = existsSync(standaloneServer)

  console.log(`  Starting human_test() on port ${port}...`)

  if (useStandalone) {
    run(`pm2 start "${standaloneServer}" --name "${PM2_NAME}" --env PORT=${port} --env HOSTNAME=0.0.0.0 --env NODE_ENV=production`, { cwd: appDir })
  } else {
    run(`pm2 start npm --name "${PM2_NAME}" -- start -- -p ${port}`, { cwd: appDir })
  }
  console.log(`  http://localhost:${port}`)
}

function stop() {
  const appDir = getAppDir()
  if (!appDir) {
    console.error('  human_test() installation not found.')
    process.exit(1)
  }

  if (!hasPm2()) {
    console.log('  pm2 not installed. Nothing to stop.')
    return
  }

  run(`pm2 stop "${PM2_NAME}"`, { ignoreError: true })
  run(`pm2 delete "${PM2_NAME}"`, { ignoreError: true })
  console.log('  human_test() stopped.')
}

function restart() {
  const appDir = getAppDir()
  if (!appDir) {
    console.error('  human_test() installation not found.')
    process.exit(1)
  }

  ensurePm2()
  run(`pm2 restart "${PM2_NAME}"`, { cwd: appDir })
  console.log('  human_test() restarted.')
}

function update() {
  const appDir = getAppDir()
  if (!appDir) {
    console.error('  human_test() installation not found.')
    process.exit(1)
  }

  const hasGit = existsSync(join(appDir, '.git'))

  if (hasGit) {
    console.log('  Pulling latest changes...')
    run('git pull', { cwd: appDir })
  } else {
    console.log('  Downloading latest version...')
    const tmpDir = join(appDir, '.humantest-update-tmp')
    run(`git clone --depth 1 ${REPO_URL} "${tmpDir}"`)
    const preserveList = ['.env', 'prisma/data', 'node_modules', '.next']
    run(`rsync -a --exclude='.git' ${preserveList.map(p => `--exclude='${p}'`).join(' ')} "${tmpDir}/" "${appDir}/"`)
    run(`rm -rf "${tmpDir}"`)
  }

  console.log('  Installing dependencies...')
  run('npm install', { cwd: appDir })

  console.log('  Updating database...')
  run('npx prisma db push', { cwd: appDir, ignoreError: true })

  console.log('  Building...')
  run('npm run build', { cwd: appDir })

  if (hasPm2()) {
    run(`pm2 restart "${PM2_NAME}"`, { cwd: appDir, ignoreError: true })
  }

  console.log('  Update complete.')
}

function status() {
  const appDir = getAppDir()
  if (!appDir) {
    console.log('  human_test() installation not found.')
    return
  }

  if (!hasPm2()) {
    console.log('  pm2 not installed. Cannot check status.')
    return
  }

  const pm2List = runCapture(`pm2 jlist 2>/dev/null`)
  if (pm2List) {
    try {
      const procs = JSON.parse(pm2List)
      const proc = procs.find(p => p.name === PM2_NAME)
      if (proc) {
        const s = proc.pm2_env?.status || 'unknown'
        console.log(`  human_test() — ${s} (PID ${proc.pid}, uptime: ${proc.pm2_env?.pm_uptime ? Math.round((Date.now() - proc.pm2_env.pm_uptime) / 1000) + 's' : 'N/A'})`)
        return
      }
    } catch {}
  }

  console.log('  human_test() is not running.')
}

function logs() {
  const appDir = getAppDir()
  if (!appDir) {
    console.error('  human_test() installation not found.')
    process.exit(1)
  }

  if (!hasPm2()) {
    console.error('  pm2 not installed.')
    process.exit(1)
  }

  run(`pm2 logs "${PM2_NAME}" --lines 50`)
}

// ─── MAIN ───

const command = process.argv[2]

switch (command) {
  case 'init':
    init()
    break
  case 'start':
    start()
    break
  case 'stop':
    stop()
    break
  case 'restart':
    restart()
    break
  case 'update':
    update()
    break
  case 'status':
    status()
    break
  case 'logs':
    logs()
    break
  default:
    console.log(`
  human_test() CLI

  Usage:
    humantest init        Interactive setup wizard
    humantest start       Start the server (pm2)
    humantest stop        Stop the server
    humantest restart     Restart the server
    humantest status      Check server status
    humantest update      Update to latest version and restart
    humantest logs        View server logs
`)
}
