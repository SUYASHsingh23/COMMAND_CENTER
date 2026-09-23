import React, { useState, useId, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'

interface PolicyHolderAccount {
  name: string
  username: string
  pass: string
  plan?: string
  tier?: string
}

const POLICY_HOLDERS: PolicyHolderAccount[] = [
  { name: 'Sneha Reddy', username: 'sneha.reddy@email.com', pass: 'SnehaPass123!', plan: 'Home Protector Elite', tier: 'Elite' },
  { name: 'Anita Desai', username: 'anita.desai@example.com', pass: 'AnitaPass123!', plan: 'Home Protector Elite', tier: 'Premium' },
  { name: 'Priya Sharma', username: 'priya.sharma@example.com', pass: 'PriyaPass123!', plan: 'Health Shield Gold', tier: 'Gold' },
  { name: 'Rajan Mehta', username: 'rajan.mehta@example.com', pass: 'RajanPass123!', plan: 'Health Shield Premium', tier: 'Premium' },
  { name: 'Suresh Kumar', username: 'suresh.kumar@example.com', pass: 'SureshPass123!', plan: 'Motor Third Party', tier: 'Standard' },
  { name: 'Kavitha Nair', username: 'kavitha.nair@example.com', pass: 'KavithaPass123!', plan: 'Health Shield Gold', tier: 'Gold' },
  { name: 'Amit Patel', username: 'amit.patel@email.com', pass: 'AmitPass123!', plan: 'Health Shield Basic', tier: 'Standard' },
  { name: 'Priya Nair', username: 'priya.nair@email.com', pass: 'PriyaPass123!', plan: 'Motor Comprehensive', tier: 'Gold' },
  { name: 'Rahul Sharma', username: 'rahul.sharma@email.com', pass: 'RahulPass123!', plan: 'Home Protector Basic', tier: 'Standard' },
  { name: 'Vikram Singh', username: 'vikram.singh@email.com', pass: 'VikramPass123!', plan: 'Motor Comprehensive', tier: 'Gold' },
]

type Mode = 'login' | 'register'

interface FieldError {
  email?: string
  password?: string
  name?: string
  confirmPassword?: string
  general?: string
}

function validate(mode: Mode, fields: Record<string, string>): FieldError {
  const errors: FieldError = {}
  if (mode === 'register' && !fields.name?.trim()) {
    errors.name = 'Full name is required'
  }
  if (!fields.email?.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    errors.email = 'Enter a valid email address'
  }
  if (!fields.password || fields.password.length < 8) {
    errors.password = 'Password must be at least 8 characters'
  }
  if (mode === 'register' && fields.password !== fields.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match'
  }
  return errors
}

export function AuthPage() {
  const { login, register } = useAuth()
  const { theme, isDark, setTheme } = useTheme()
  const id = useId()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [errors, setErrors] = useState<FieldError>({})
  const [loading, setLoading] = useState(false)

  // Policy holder dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [justFilled, setJustFilled] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Toggle theme class on body
  useEffect(() => {
    document.body.classList.toggle('dark-mode', theme === 'dark')
  }, [theme])

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDropdownOpen])

  const handleSelectAccount = (acc: PolicyHolderAccount) => {
    setEmail(acc.username)
    setPassword(acc.pass)
    setErrors({})
    setIsDropdownOpen(false)
    setJustFilled(true)
    setTimeout(() => setJustFilled(false), 1200)
  }

  const handleGetStarted = () => {
    setIsDropdownOpen(true)
    emailInputRef.current?.focus()
  }

  const filteredAccounts = POLICY_HOLDERS.filter(acc => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      acc.name.toLowerCase().includes(q) ||
      acc.username.toLowerCase().includes(q) ||
      (acc.plan && acc.plan.toLowerCase().includes(q))
    )
  })

  const reset = (nextMode: Mode) => {
    setMode(nextMode)
    setErrors({})
    setPassword('')
    setConfirmPassword('')
    setIsDropdownOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const fields = { name, email, password, confirmPassword }
    const errs = validate(mode, fields)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(name, email, phone || null, password)
      }
    } catch (err: unknown) {
      setErrors({ general: err instanceof Error ? err.message : 'Something went wrong' })
    } finally {
      setLoading(false)
    }
  }

  const clearSession = () => {
    localStorage.removeItem('cc_refresh')
    window.location.reload()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundImage: isDark
          ? 'linear-gradient(rgba(11, 17, 32, 0.75), rgba(11, 17, 32, 0.85)), url("/assets/bg-dark-city.jpg")'
          : 'linear-gradient(rgba(240, 245, 255, 0.45), rgba(240, 245, 255, 0.65)), url("/assets/bg-light-city.jpg")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        color: isDark ? '#f8fafc' : '#0f172a',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        padding: '32px 48px',
        overflowX: 'hidden',
        boxSizing: 'border-box',
        transition: 'background-image 300ms ease',
      }}
    >
      {/* ── Top Header Navigation Bar (Theme switcher) ────────────────────────── */}
      <header
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            position: 'relative',
          }}
        >
          <span
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: isDark ? '#94a3b8' : '#475569',
            }}
          >
            Theme
          </span>

          {/* Theme Pill Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(12px)',
              borderRadius: '9999px',
              padding: '4px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(226, 232, 240, 0.9)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              gap: '4px',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => setTheme('light')}
              title="Switch to light theme"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: !isDark ? '#ffffff' : 'transparent',
                color: !isDark ? '#f59e0b' : '#64748b',
                boxShadow: !isDark ? '0 2px 6px rgba(0, 0, 0, 0.12)' : 'none',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 200ms ease',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" fill={!isDark ? '#fef3c7' : 'none'} />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => setTheme('dark')}
              title="Switch to dark theme"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                background: isDark ? '#0284c7' : 'transparent',
                color: isDark ? '#ffffff' : '#64748b',
                boxShadow: isDark ? '0 2px 6px rgba(2, 132, 199, 0.4)' : 'none',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 200ms ease',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={isDark ? '#bae6fd' : 'none'} />
              </svg>
            </button>
          </div>

          {/* Theme tooltip helper badge */}
          <div
            style={{
              position: 'absolute',
              top: '46px',
              right: '0',
              background: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(226, 232, 240, 0.8)',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 500,
              color: isDark ? '#94a3b8' : '#64748b',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              opacity: 0.85,
            }}
          >
            Click to transition theme
          </div>
        </div>
      </header>

      {/* ── Main Two-Part Split Layout ────────────────────────────────────────── */}
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(420px, 1.25fr) minmax(380px, 460px)',
          gap: '48px',
          alignItems: 'center',
          maxWidth: '1360px',
          width: '100%',
          margin: '24px auto',
          position: 'relative',
          zIndex: 5,
        }}
      >
        {/* ── Left Hero Section (Branding, Titles & Policy Overview Bar) ───── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            paddingRight: '20px',
          }}
        >
          {/* InsureAI Shield Badge Logo */}
          <div
            style={{
              width: '68px',
              height: '68px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
              marginBottom: '32px',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(255, 255, 255, 0.15)" />
              <path d="M9 12l2 2 4-4" strokeWidth="2.5" />
            </svg>
          </div>

          {/* Hero Typography */}
          <h1
            style={{
              fontSize: '46px',
              fontWeight: 800,
              lineHeight: 1.18,
              letterSpacing: '-0.03em',
              color: isDark ? '#f8fafc' : '#0f172a',
              marginBottom: '28px',
              textShadow: isDark
                ? '0 2px 20px rgba(0, 0, 0, 0.8)'
                : '0 1px 2px rgba(255, 255, 255, 0.8)',
            }}
          >
            InsureAI - Powered<br />
            Insurance Contact Center.<br />
            Secure access to your<br />
            policy details.
          </h1>

          {/* Bottom Policy Overview Card */}
          <div
            style={{
              marginTop: '40px',
              background: isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(16px)',
              borderRadius: '22px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.85)',
              padding: '20px 26px',
              boxShadow: isDark
                ? '0 16px 36px -10px rgba(0, 0, 0, 0.5)'
                : '0 16px 36px -10px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(226, 232, 240, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              maxWidth: '640px',
            }}
          >
            <div style={{ flex: 1 }}>
              <h2
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: isDark ? '#f8fafc' : '#0f172a',
                  marginBottom: '4px',
                  lineHeight: 1.2,
                }}
              >
                Policy Overview
              </h2>
              <p
                style={{
                  fontSize: '13px',
                  color: isDark ? '#94a3b8' : '#64748b',
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                Policy Holder Accounts. To access your policy details.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGetStarted}
              style={{
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '14px',
                padding: '12px 22px',
                borderRadius: '14px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                whiteSpace: 'nowrap',
                transition: 'all 200ms ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.45)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(37, 99, 235, 0.35)'
              }}
            >
              Get Started with AI
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Right Column: Floating Login Box Card (700ms Entrance Animation) ── */}
        <div
          className="animate-login-card"
          style={{
            background: isDark ? 'rgba(15, 23, 42, 0.88)' : '#ffffff',
            backdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: isDark ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(226, 232, 240, 0.9)',
            padding: '36px 32px',
            boxShadow: isDark
              ? '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 40px rgba(14, 165, 233, 0.12)'
              : '0 25px 60px -15px rgba(15, 23, 42, 0.16), 0 10px 25px -5px rgba(15, 23, 42, 0.06)',
            width: '100%',
            position: 'relative',
          }}
        >
          {/* Card Header */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  padding: '3px 10px',
                  borderRadius: '9999px',
                  background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.08)',
                  color: isDark ? '#38bdf8' : '#2563eb',
                }}
              >
                Secure Portal
              </span>
              <span style={{ fontSize: '12px', color: isDark ? '#64748b' : '#94a3b8' }}>v3.0</span>
            </div>

            <h2
              style={{
                fontSize: '22px',
                fontWeight: 700,
                color: isDark ? '#f8fafc' : '#0f172a',
                lineHeight: 1.2,
                margin: '4px 0',
              }}
            >
              {mode === 'login' ? 'Sign in to your account' : 'Create policyholder account'}
            </h2>
            <p style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b', margin: 0 }}>
              {mode === 'login'
                ? 'Enter your policyholder credentials to access AI services'
                : 'Get instantaneous access to claims, billing, and AI voice'}
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              background: isDark ? 'rgba(30, 41, 59, 0.6)' : '#f1f5f9',
              borderRadius: '12px',
              padding: '4px',
              marginBottom: '22px',
            }}
          >
            <button
              id={`${id}-tab-login`}
              type="button"
              onClick={() => reset('login')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: mode === 'login' ? 600 : 500,
                cursor: 'pointer',
                background: mode === 'login' ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                color: mode === 'login' ? (isDark ? '#38bdf8' : '#1d4ed8') : (isDark ? '#94a3b8' : '#64748b'),
                boxShadow: mode === 'login' ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 180ms ease',
              }}
            >
              Sign In
            </button>
            <button
              id={`${id}-tab-register`}
              type="button"
              onClick={() => reset('register')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                fontSize: '13px',
                fontWeight: mode === 'register' ? 600 : 500,
                cursor: 'pointer',
                background: mode === 'register' ? (isDark ? '#1e293b' : '#ffffff') : 'transparent',
                color: mode === 'register' ? (isDark ? '#38bdf8' : '#1d4ed8') : (isDark ? '#94a3b8' : '#64748b'),
                boxShadow: mode === 'register' ? '0 2px 6px rgba(0, 0, 0, 0.08)' : 'none',
                transition: 'all 180ms ease',
              }}
            >
              Create Account
            </button>
          </div>

          {/* Quick-Fill Policy Holders Section (Demo helper) */}
          {mode === 'login' && (
            <div ref={dropdownRef} style={{ position: 'relative', marginBottom: '18px' }}>
              <button
                id={`${id}-policy-holders-btn`}
                type="button"
                onClick={() => setIsDropdownOpen(prev => !prev)}
                aria-expanded={isDropdownOpen}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: isDark
                    ? (isDropdownOpen ? 'rgba(30, 41, 59, 0.9)' : 'rgba(30, 41, 59, 0.5)')
                    : (isDropdownOpen ? 'rgba(37, 99, 235, 0.08)' : 'rgba(37, 99, 235, 0.04)'),
                  border: isDropdownOpen
                    ? (isDark ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(37, 99, 235, 0.35)')
                    : (isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(37, 99, 235, 0.15)'),
                  color: isDark ? '#f8fafc' : '#0f172a',
                  cursor: 'pointer',
                  transition: 'all 180ms ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: isDark ? '#38bdf8' : '#2563eb' }}>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#38bdf8' : '#2563eb' }}>
                    Policy Holder Accounts
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                      color: isDark ? '#38bdf8' : '#2563eb',
                    }}
                  >
                    {POLICY_HOLDERS.length} demo accounts
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      color: isDark ? '#38bdf8' : '#2563eb',
                      transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 200ms ease',
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div
                  style={{
                    marginTop: '8px',
                    background: isDark ? '#1e293b' : '#ffffff',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(226, 232, 240, 0.9)',
                    borderRadius: '14px',
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.2)',
                    overflow: 'hidden',
                    zIndex: 50,
                    animation: 'fade-in 160ms ease',
                  }}
                >
                  {/* Search bar inside dropdown */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
                      background: isDark ? '#0f172a' : '#f8fafc',
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Search name, email, or policy..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #e2e8f0',
                        background: isDark ? '#1e293b' : '#ffffff',
                        color: isDark ? '#f8fafc' : '#0f172a',
                        fontSize: '12px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {/* Accounts List */}
                  <div
                    style={{
                      maxHeight: '240px',
                      overflowY: 'auto',
                      padding: '4px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                  >
                    {filteredAccounts.map(account => (
                      <div
                        key={account.username}
                        onClick={() => handleSelectAccount(account)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleSelectAccount(account) }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          transition: 'background 120ms ease',
                          background: 'transparent',
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(37, 99, 235, 0.06)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div style={{ minWidth: 0, textAlign: 'left' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
                              {account.name}
                            </span>
                            {account.tier && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 6px',
                                  borderRadius: '9999px',
                                  background: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(37, 99, 235, 0.1)',
                                  color: isDark ? '#38bdf8' : '#2563eb',
                                  fontWeight: 600,
                                }}
                              >
                                {account.tier}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: isDark ? '#94a3b8' : '#64748b', marginTop: '2px' }}>
                            {account.username} · <span style={{ fontFamily: 'monospace' }}>{account.pass}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Full Name (Register only) */}
            {mode === 'register' && (
              <div>
                <label htmlFor={`${id}-name`} style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  id={`${id}-name`}
                  type="text"
                  autoComplete="name"
                  placeholder="Arjun Sharma"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: errors.name ? '1px solid #ef4444' : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                    background: isDark ? '#0f172a' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {errors.name && <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.name}</span>}
              </div>
            )}

            {/* Email Address */}
            <div>
              <label htmlFor={`${id}-email`} style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                Email Address
              </label>
              <input
                ref={emailInputRef}
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                placeholder="policyholder@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  borderRadius: '10px',
                  border: errors.email ? '1px solid #ef4444' : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                  background: isDark ? '#0f172a' : '#f8fafc',
                  color: isDark ? '#f8fafc' : '#0f172a',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  ...(justFilled ? { borderColor: '#10b981', boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)' } : {}),
                }}
              />
              {errors.email && <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.email}</span>}
            </div>

            {/* Phone (Register only) */}
            {mode === 'register' && (
              <div>
                <label htmlFor={`${id}-phone`} style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                  Phone Number <span style={{ color: isDark ? '#64748b' : '#94a3b8', fontWeight: 400 }}>(optional)</span>
                </label>
                <input
                  id={`${id}-phone`}
                  type="tel"
                  autoComplete="tel"
                  placeholder="+91 98765 43210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1',
                    background: isDark ? '#0f172a' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Password */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label htmlFor={`${id}-password`} style={{ fontSize: '13px', fontWeight: 500, color: isDark ? '#cbd5e1' : '#334155' }}>
                  Password
                </label>
                {mode === 'login' && (
                  <span style={{ fontSize: '12px', color: isDark ? '#38bdf8' : '#2563eb', cursor: 'pointer' }}>
                    Forgot password?
                  </span>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  id={`${id}-password`}
                  type={showPass ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 44px 11px 14px',
                    borderRadius: '10px',
                    border: errors.password ? '1px solid #ef4444' : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                    background: isDark ? '#0f172a' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    ...(justFilled ? { borderColor: '#10b981', boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.25)' } : {}),
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: isDark ? '#94a3b8' : '#64748b',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.password}</span>}
            </div>

            {/* Confirm Password (Register only) */}
            {mode === 'register' && (
              <div>
                <label htmlFor={`${id}-confirm`} style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: isDark ? '#cbd5e1' : '#334155', marginBottom: '6px' }}>
                  Confirm Password
                </label>
                <input
                  id={`${id}-confirm`}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '11px 14px',
                    borderRadius: '10px',
                    border: errors.confirmPassword ? '1px solid #ef4444' : (isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #cbd5e1'),
                    background: isDark ? '#0f172a' : '#f8fafc',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {errors.confirmPassword && <span style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px', display: 'block' }}>{errors.confirmPassword}</span>}
              </div>
            )}

            {/* General Error */}
            {errors.general && (
              <div
                role="alert"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '10px',
                  color: '#ef4444',
                  fontSize: '13px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {errors.general}
              </div>
            )}

            {/* Submit Button */}
            <button
              id={`${id}-submit`}
              type="submit"
              disabled={loading}
              style={{
                marginTop: '6px',
                padding: '13px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                color: '#ffffff',
                fontSize: '15px',
                fontWeight: 600,
                border: 'none',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '48px',
                boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
                transition: 'all 180ms ease',
                opacity: loading ? 0.75 : 1,
              }}
            >
              {loading ? (
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid rgba(255, 255, 255, 0.3)',
                    borderTopColor: '#ffffff',
                    borderRadius: '50%',
                    display: 'inline-block',
                    animation: 'spin 0.7s linear infinite',
                  }}
                />
              ) : (
                mode === 'login' ? 'Sign In to Dashboard' : 'Create Policyholder Account'
              )}
            </button>
          </form>

          {/* Session Clear helper */}
          <div
            style={{
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid #f1f5f9',
              textAlign: 'center',
              fontSize: '12px',
            }}
          >
            <button
              type="button"
              onClick={clearSession}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isDark ? '#64748b' : '#94a3b8',
                fontSize: '11px',
                textDecoration: 'underline',
              }}
            >
              Clear Session &amp; Reload
            </button>
          </div>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
      <footer
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: isDark ? '#64748b' : '#64748b',
          zIndex: 10,
          marginTop: '16px',
        }}
      >
        <span>© 2026 InsureAI Contact Center 3.0 — Enterprise Voice &amp; Claim Automation</span>
        <span>Secured with 256-bit TLS encryption</span>
      </footer>

    </div>
  )
}
