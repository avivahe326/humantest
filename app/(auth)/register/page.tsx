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

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

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
      setError('Name is required')
      return false
    }
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address')
      return false
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return false
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return false
    }
    return true
  }, [name, email, password, confirmPassword])

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
          setError(`Please wait ${data.retryAfter}s before requesting another code`)
        } else {
          setError(data.error || 'Failed to send verification code')
        }
        return
      }

      setCodeSent(true)
      setCooldown(60)
      toast.success('Verification code sent to your email')
    } catch {
      setError('Something went wrong')
    } finally {
      setSendingCode(false)
    }
  }

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit verification code')
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

      toast.success('Account created successfully!')

      const signInRes = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (signInRes?.error) {
        setError('Registration succeeded but auto-login failed. Please log in.')
        router.push('/login')
      } else {
        router.push('/onboarding')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            {codeSent
              ? 'Enter the verification code sent to your email'
              : 'Join human_test() and start testing or creating tests'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                disabled={codeSent}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
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
              <Label htmlFor="password">Password</Label>
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
                <Label htmlFor="confirmPassword">Confirm Password</Label>
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
                <Label htmlFor="code">Verification Code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
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
                {sendingCode ? 'Sending code...' : 'Send Verification Code'}
              </Button>
            ) : (
              <div className="space-y-3">
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating account...' : 'Sign Up'}
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
                    Edit details
                  </button>
                  <button
                    type="button"
                    className={`underline ${cooldown > 0 ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground hover:text-foreground'}`}
                    disabled={cooldown > 0 || sendingCode}
                    onClick={handleSendCode}
                  >
                    {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                  </button>
                </div>
              </div>
            )}
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="underline hover:text-foreground">
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
