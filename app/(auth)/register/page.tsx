'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const { t } = useTranslation()

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const validateForm = useCallback(() => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!name.trim()) {
      setError(t('register.nameRequired'))
      return false
    }
    if (!emailRegex.test(email)) {
      setError(t('register.invalidEmail'))
      return false
    }
    if (password.length < 6) {
      setError(t('register.passwordLength'))
      return false
    }
    if (password !== confirmPassword) {
      setError(t('register.passwordMismatch'))
      return false
    }
    return true
  }, [name, email, password, confirmPassword, t])

  async function handleSendCode() {
    setError('')
    if (!validateForm()) return

    setSendingCode(true)
    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 429 && data.retryAfter) {
          setCooldown(data.retryAfter)
          setError(t('register.waitRetry', { seconds: data.retryAfter }))
        } else {
          setError(data.error || t('register.sendCodeFailed'))
        }
        return
      }

      setCodeSent(true)
      setCooldown(60)
      toast.success(t('register.codeSent'))
    } catch {
      setError(t('register.somethingWrong'))
    } finally {
      setSendingCode(false)
    }
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (!code || code.length !== 6) {
      setError(t('register.enterVerificationCode'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, code }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Registration failed')
        return
      }

      toast.success(t('register.accountCreated'))

      const signInRes = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (signInRes?.error) {
        setError(t('register.autoLoginFailed'))
        router.push('/login')
      } else {
        router.push('/onboarding')
      }
    } catch {
      setError(t('register.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">{t('register.title')}</CardTitle>
          <CardDescription>
            {codeSent
              ? t('register.subtitleCode')
              : t('register.subtitle')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('register.name')}</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={codeSent}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('register.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={codeSent}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('register.password')}</Label>
              <Input
                id="password"
                type="password"
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={codeSent}
                required
              />
            </div>
            {!codeSent && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('register.confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  minLength={6}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {codeSent && (
              <div className="space-y-2">
                <Label htmlFor="code">{t('register.verificationCode')}</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('register.enterCode')}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoFocus
                  required
                />
              </div>
            )}

            {error && <p className="text-sm text-red-500">{error}</p>}

            {!codeSent ? (
              <Button
                type="button"
                className="w-full"
                disabled={sendingCode}
                onClick={handleSendCode}
              >
                {sendingCode ? t('register.sendingCode') : t('register.sendCode')}
              </Button>
            ) : (
              <div className="space-y-3">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? t('register.creatingAccount') : t('register.signUp')}
                </Button>
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    className="text-muted-foreground underline hover:text-foreground"
                    onClick={() => {
                      setCodeSent(false)
                      setCode('')
                      setError('')
                    }}
                  >
                    {t('register.editDetails')}
                  </button>
                  <button
                    type="button"
                    className={`underline ${cooldown > 0 ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground'}`}
                    disabled={cooldown > 0 || sendingCode}
                    onClick={handleSendCode}
                  >
                    {cooldown > 0 ? t('register.resendIn', { seconds: cooldown }) : t('register.resendCode')}
                  </button>
                </div>
              </div>
            )}
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('register.hasAccount')}{' '}
            <Link href="/login" className="underline hover:text-foreground">
              {t('register.logIn')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
