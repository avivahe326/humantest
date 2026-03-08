#!/usr/bin/env node

import { execSync, spawn } from 'child_process'
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, resolve } from 'path'
import { randomBytes } from 'crypto'
import * as p from '@clack/prompts'

const REPO_URL = 'https://github.com/avivahe326/humantest.git'
const APP_DIR_NAME = 'humantest'
const PM2_NAME = 'human-test'

const isNonInteractive = process.argv.includes('--non-interactive') || process.argv.includes('--defaults')

function guardCancel(value) {
  if (p.isCancel(value)) {
    p.cancel('Setup cancelled.')
    process.exit(0)
  }
  return value
}

async function ask(message, defaultValue = '') {
  if (isNonInteractive) return defaultValue
  const value = await p.text({
    message,
    initialValue: defaultValue,
    placeholder: defaultValue ? undefined : 'press Enter to skip',
  })
  return guardCancel(value) || defaultValue
}

async function askChoice(message, options) {
  if (isNonInteractive) return options[0].value
  const value = await p.select({
    message,
    options: options.map(opt => ({
      value: opt.value,
      label: opt.label,
      hint: opt.desc,
    })),
  })
  return guardCancel(value)
}

async function askConfirm(message, initial = false) {
  if (isNonInteractive) return initial
  const value = await p.confirm({ message, initialValue: initial })
  return guardCancel(value)
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

function runAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', cmd], { stdio: 'pipe', ...opts })
    let stderr = ''
    if (child.stderr) child.stderr.on('data', d => stderr += d)
    child.on('close', code => {
      if (code !== 0 && !opts.ignoreError) {
        console.error(`\n  Command failed: ${cmd}`)
        if (stderr) console.error(stderr)
        process.exit(1)
      }
      resolve()
    })
    child.on('error', err => {
      if (!opts.ignoreError) {
        console.error(`\n  Command failed: ${cmd}\n  ${err.message}`)
        process.exit(1)
      }
      resolve()
    })
  })
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

function createAdminUser(appDir) {
  console.log('\n  Creating default admin user...')
  const scriptPath = join(appDir, '.humantest-create-admin.cjs')
  const script = `
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
async function main() {
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: 'admin@humantest.local' } });
    if (existing) {
      console.log('  Admin user already exists, skipping.');
      return;
    }
    const hash = await bcrypt.hash('admin', 10);
    await prisma.user.create({
      data: {
        name: 'admin',
        email: 'admin@humantest.local',
        password: hash,
        apiKey: crypto.randomBytes(32).toString('hex'),
      },
    });
    console.log('  Admin user created (admin@humantest.local / admin)');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error('  Warning: could not create admin user:', e.message); });
`
  writeFileSync(scriptPath, script)
  run(`node "${scriptPath}"`, { cwd: appDir, ignoreError: true })
  try { run(`rm -f "${scriptPath}"`, { ignoreError: true }) } catch {}
}

function seedSettings(appDir) {
  console.log('\n  Seeding settings from .env...')
  const scriptPath = join(appDir, '.humantest-seed-settings.cjs')
  const script = `
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
async function main() {
  const prisma = new PrismaClient();
  try {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const settingKeys = [
      'AI_PROVIDER', 'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL',
      'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
      'OSS_REGION', 'OSS_BUCKET', 'OSS_ROLE_NAME',
      'GITHUB_TOKEN', 'DEFAULT_LOCALE',
      'DEFAULT_MAX_TESTERS', 'DEFAULT_ESTIMATED_MINUTES',
    ];
    for (const key of settingKeys) {
      const match = envContent.match(new RegExp('^' + key + '="([^"]*)"', 'm'));
      if (match && match[1]) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: match[1] },
          create: { key, value: match[1] },
        });
      }
    }
    console.log('  Settings seeded from .env');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(e => { console.error('  Warning: could not seed settings:', e.message); });
`
  writeFileSync(scriptPath, script)
  run(`node "${scriptPath}"`, { cwd: appDir, ignoreError: true })
  try { run(`rm -f "${scriptPath}"`, { ignoreError: true }) } catch {}
}

// Auto-detect AI provider from environment variables
function detectAiFromEnv() {
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY, baseUrl: '', model: '' }
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY, baseUrl: '', model: '' }
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { provider: 'openai', apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: 'https://api.deepseek.com/v1', model: '' }
  }
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'openai', apiKey: process.env.GEMINI_API_KEY, baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: '' }
  }
  return null
}

// ─── COMMANDS ───

async function init() {
  p.intro('human_test() Setup')

  const installDir = join(process.cwd(), APP_DIR_NAME)

  if (existsSync(installDir)) {
    if (isNonInteractive) {
      p.log.warn(`Directory "${APP_DIR_NAME}" already exists, removing...`)
      run(`rm -rf "${installDir}"`)
    } else {
      const overwrite = await askConfirm(`Directory "${APP_DIR_NAME}" already exists. Overwrite?`)
      if (!overwrite) {
        p.cancel('Setup cancelled.')
        process.exit(0)
      }
      p.log.step('Removing old installation...')
      run(`rm -rf "${installDir}"`)
    }
  }

  let mode, dbUrl, providerValue, aiApiKey, aiBaseUrl, aiModel, port, domain
  let smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom
  let ossRegion, ossBucket, ossRoleName, githubToken, defaultLocale

  if (isNonInteractive) {
    // Non-interactive: local mode, auto-detect AI, port 3000, skip everything else
    mode = 'local'
    dbUrl = 'file:./data/humantest.db'
    port = '3000'
    domain = ''
    smtpHost = ''
    ossRegion = ''
    githubToken = ''
    defaultLocale = 'en'

    const detected = detectAiFromEnv()
    if (detected) {
      providerValue = detected.provider
      aiApiKey = detected.apiKey
      aiBaseUrl = detected.baseUrl
      aiModel = detected.model
      console.log(`  AI provider: ${detected.provider}${detected.baseUrl ? ` (${detected.baseUrl})` : ''} (auto-detected from env)`)
    } else {
      providerValue = 'anthropic'
      aiApiKey = ''
      aiBaseUrl = ''
      aiModel = ''
      console.log('  Warning: No AI API key found in environment. Report generation will not work.')
      console.log('  Set ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, or GEMINI_API_KEY and re-run.')
    }
  } else {
    // Interactive mode (existing flow)

    // 1. Choose mode
    mode = await askChoice('Deployment mode:', [
      { label: 'Local', desc: 'SQLite, zero config — for dev/small teams', value: 'local' },
      { label: 'Cloud', desc: 'MySQL — for production', value: 'cloud' },
    ])

    // 2. Database
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

    aiApiKey = ''
    aiBaseUrl = ''
    aiModel = ''

    if (aiProvider === 'anthropic') {
      aiApiKey = await ask('Anthropic API Key (required for AI reports)')
      if (!aiApiKey) {
        p.log.warn('No API key provided. Report generation will not work.\n  You can add AI_API_KEY to .env later.')
      }
      aiBaseUrl = await ask('Anthropic Base URL (press Enter for official API)')
      if (aiBaseUrl) {
        aiModel = await ask('Model name (press Enter for claude-sonnet-4-6)')
      }
    } else if (aiProvider === 'openai') {
      aiApiKey = await ask('OpenAI API Key (required for AI reports)')
      if (!aiApiKey) {
        p.log.warn('No API key provided. Report generation will not work.\n  You can add AI_API_KEY to .env later.')
      }
      aiBaseUrl = await ask('OpenAI Base URL (press Enter for official API)')
      if (aiBaseUrl) {
        aiModel = await ask('Model name (press Enter for gpt-4o)')
      }
    } else {
      // openai-compat
      aiApiKey = await ask('API Key')
      aiBaseUrl = await ask('Base URL (e.g. https://api.deepseek.com/v1)')
      aiModel = await ask('Model name (e.g. deepseek-chat)')
      if (!aiApiKey || !aiBaseUrl) {
        p.log.warn('Incomplete config. You can update .env later.')
      }
    }

    providerValue = aiProvider === 'openai-compat' ? 'openai' : aiProvider

    // 4. Port
    port = await ask('Port', '3000')

    // 5. Domain (cloud mode)
    domain = ''
    if (mode === 'cloud') {
      domain = await ask('Domain (e.g. example.com, press Enter to skip)')
    }

    // 6. Optional: SMTP
    p.log.info('SMTP settings (optional, skip to disable email verification)')
    smtpHost = await ask('SMTP host')
    smtpPort = ''
    smtpUser = ''
    smtpPass = ''
    smtpFrom = ''
    if (smtpHost) {
      smtpPort = await ask('SMTP port', '465')
      smtpUser = await ask('SMTP user (email)')
      smtpPass = await ask('SMTP password')
      smtpFrom = await ask('SMTP from address', smtpUser)
    }

    // 7. Optional: OSS (Alibaba Cloud Object Storage)
    p.log.info('Recording storage (optional, skip to store recordings on local disk)')
    ossRegion = await ask('OSS Region')
    ossBucket = ''
    ossRoleName = ''
    if (ossRegion) {
      ossBucket = await ask('OSS Bucket')
      ossRoleName = await ask('OSS RAM Role Name', 'humantest')
    }

    // 8. Optional: GitHub token
    githubToken = await ask('GitHub token for code fix PRs')

    // 9. Default language
    defaultLocale = await askChoice('Default language for AI-generated content', [
      { label: 'English', desc: 'en', value: 'en' },
      { label: '中文', desc: 'zh', value: 'zh' },
    ])
  }

  // 5. NEXTAUTH_SECRET
  const secret = randomBytes(32).toString('base64')

  // ─── Clone repo ───
  const s = p.spinner()
  s.start('Downloading human_test()...')
  await runAsync(`git clone --depth 1 ${REPO_URL} "${installDir}"`)
  s.stop('Downloaded human_test()')

  // ─── Generate .env ───
  const envLines = [
    `DATABASE_URL="${dbUrl}"`,
    `NEXTAUTH_SECRET="${secret}"`,
    `NEXTAUTH_URL="${domain ? `https://${domain}` : `http://localhost:${port}`}"`,
    `PORT=${port}`,
  ]

  if (aiApiKey) {
    envLines.push(`AI_PROVIDER="${providerValue}"`)
    envLines.push(`AI_API_KEY="${aiApiKey}"`)
    // Backward compat: also set ANTHROPIC_API_KEY for existing code paths
    if (providerValue === 'anthropic') envLines.push(`ANTHROPIC_API_KEY="${aiApiKey}"`)
    if (aiBaseUrl) {
      envLines.push(`AI_BASE_URL="${aiBaseUrl}"`)
      if (providerValue === 'anthropic') envLines.push(`ANTHROPIC_BASE_URL="${aiBaseUrl}"`)
    }
    if (aiModel) envLines.push(`AI_MODEL="${aiModel}"`)
  }
  if (smtpHost) {
    envLines.push(`SMTP_HOST="${smtpHost}"`)
    envLines.push(`SMTP_PORT=${smtpPort}`)
    envLines.push(`SMTP_USER="${smtpUser}"`)
    envLines.push(`SMTP_PASS="${smtpPass}"`)
    if (smtpFrom) envLines.push(`SMTP_FROM="${smtpFrom}"`)
  }
  if (githubToken) envLines.push(`GITHUB_TOKEN="${githubToken}"`)
  if (defaultLocale) envLines.push(`DEFAULT_LOCALE="${defaultLocale}"`)
  if (ossRegion) {
    envLines.push(`OSS_REGION="${ossRegion}"`)
    envLines.push(`OSS_BUCKET="${ossBucket}"`)
    if (ossRoleName) envLines.push(`OSS_ROLE_NAME="${ossRoleName}"`)
  }
  writeFileSync(join(installDir, '.env'), envLines.join('\n') + '\n')

  // ─── Generate correct Prisma schema ───
  if (mode === 'local') {
    const schemaPath = join(installDir, 'prisma', 'schema.prisma')
    let schema = readFileSync(schemaPath, 'utf-8')
    schema = schema.replace('provider = "mysql"', 'provider = "sqlite"')
    schema = schema.replace(/@db\.\w+(\(\d+\))?/g, '')
    writeFileSync(schemaPath, schema)
    mkdirSync(join(installDir, 'prisma', 'data'), { recursive: true })

    // Remove standalone output for local mode (not needed, avoids cp errors)
    const nextConfigPath = join(installDir, 'next.config.ts')
    let nextConfig = readFileSync(nextConfigPath, 'utf-8')
    nextConfig = nextConfig.replace(/\s*output:\s*'standalone',?\n?/, '\n')
    writeFileSync(nextConfigPath, nextConfig)
  }

  // ─── Local recording storage setup (when OSS not configured) ───
  if (!ossRegion) {
    mkdirSync(join(installDir, 'data', 'recordings'), { recursive: true })
    const gitignorePath = join(installDir, '.gitignore')
    try {
      let gitignore = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf-8') : ''
      if (!gitignore.includes('data/recordings')) {
        gitignore += '\ndata/recordings\n'
        writeFileSync(gitignorePath, gitignore)
      }
    } catch {}
  }

  // ─── Install dependencies ───
  s.start('Installing dependencies...')
  await runAsync('npm install', { cwd: installDir })
  s.stop('Dependencies installed')

  // ─── Setup database ───
  s.start('Setting up database...')
  await runAsync('npx prisma db push', { cwd: installDir })
  s.stop('Database ready')

  // ─── Create admin user ───
  createAdminUser(installDir)

  // ─── Seed settings from .env ───
  seedSettings(installDir)

  // ─── Build ───
  s.start('Building application...')
  await runAsync('npm run build', { cwd: installDir })
  s.stop('Build complete')

  // ─── Ensure pm2 is available ───
  ensurePm2()

  p.outro(`Setup complete!

  Default admin account: admin@humantest.local / admin

  Start the server:
    cd ${APP_DIR_NAME} && humantest start

  The server will run at http://localhost:${port}`)
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
      const running = procs.find(proc => proc.name === PM2_NAME && proc.pm2_env?.status === 'online')
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
    run(`PORT=${port} HOSTNAME=0.0.0.0 NODE_ENV=production pm2 start "${standaloneServer}" --name "${PM2_NAME}"`, { cwd: appDir })
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
    run(`rsync -a --exclude='.git' ${preserveList.map(item => `--exclude='${item}'`).join(' ')} "${tmpDir}/" "${appDir}/"`)
    run(`rm -rf "${tmpDir}"`)
  }

  console.log('  Installing dependencies...')
  run('npm install', { cwd: appDir })

  // Re-apply local mode patches after pull (git may overwrite them)
  try {
    const envContent = readFileSync(join(appDir, '.env'), 'utf-8')
    const isLocal = envContent.includes('file:./data/humantest.db') || envContent.includes('file:./data/')
    if (isLocal) {
      // Ensure Prisma uses SQLite
      const schemaPath = join(appDir, 'prisma', 'schema.prisma')
      let schema = readFileSync(schemaPath, 'utf-8')
      if (schema.includes('provider = "mysql"')) {
        schema = schema.replace('provider = "mysql"', 'provider = "sqlite"')
        schema = schema.replace(/@db\.\w+(\(\d+\))?/g, '')
        writeFileSync(schemaPath, schema)
      }
      // Remove standalone output
      const nextConfigPath = join(appDir, 'next.config.ts')
      let nextConfig = readFileSync(nextConfigPath, 'utf-8')
      if (nextConfig.includes("output: 'standalone'")) {
        nextConfig = nextConfig.replace(/\s*output:\s*'standalone',?\n?/, '\n')
        writeFileSync(nextConfigPath, nextConfig)
      }
    }
  } catch {}

  console.log('  Updating database...')
  run('npx prisma db push', { cwd: appDir, ignoreError: true })

  // Ensure admin user exists
  createAdminUser(appDir)

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
      const proc = procs.find(item => item.name === PM2_NAME)
      if (proc) {
        const st = proc.pm2_env?.status || 'unknown'
        console.log(`  human_test() — ${st} (PID ${proc.pid}, uptime: ${proc.pm2_env?.pm_uptime ? Math.round((Date.now() - proc.pm2_env.pm_uptime) / 1000) + 's' : 'N/A'})`)
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

async function uninstall() {
  const appDir = getAppDir()
  if (!appDir) {
    console.error('  human_test() installation not found.')
    process.exit(1)
  }

  const doUninstall = await askConfirm('This will stop the server and delete all files. Continue?')
  if (!doUninstall) {
    p.cancel('Aborted.')
    return
  }

  // Stop pm2 process
  if (hasPm2()) {
    run(`pm2 stop "${PM2_NAME}"`, { ignoreError: true })
    run(`pm2 delete "${PM2_NAME}"`, { ignoreError: true })
  }

  // Remove the directory
  console.log(`  Removing ${appDir}...`)
  run(`rm -rf "${appDir}"`)
  console.log('  human_test() uninstalled.')
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
  case 'uninstall':
    uninstall()
    break
  default:
    console.log(`
  human_test() CLI

  Usage:
    humantest init [--non-interactive]  Setup wizard (--non-interactive for auto mode)
    humantest start                     Start the server (pm2)
    humantest stop                      Stop the server
    humantest restart                   Restart the server
    humantest status                    Check server status
    humantest update                    Update to latest version and restart
    humantest logs                      View server logs
    humantest uninstall                 Stop server and remove all files
`)
}
