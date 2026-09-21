import React, { useState, useId, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

interface PolicyHolderAccount {
  name: string
  username: string
  pass: string
}

const POLICY_HOLDERS: PolicyHolderAccount[] = [
  { name: 'Anita Desai', username: 'anita.desai@example.com', pass: 'AnitaPass123!' },
  { name: 'Rajan Mehta', username: 'rajan.mehta@example.com', pass: 'RajanPass123!' },
  { name: 'Suresh Kumar', username: 'suresh.kumar@example.com', pass: 'SureshPass123!' },
  { name: 'Kavitha Nair', username: 'kavitha.nair@example.com', pass: 'KavithaPass123!' },
  { name: 'Priya Sharma', username: 'priya.sharma@example.com', pass: 'PriyaPass123!' },
  { name: 'Amit Patel', username: 'amit.patel@email.com', pass: 'AmitPass123!' },
  { name: 'Priya Nair', username: 'priya.nair@email.com', pass: 'PriyaPass123!' },
  { name: 'Rahul Sharma', username: 'rahul.sharma@email.com', pass: 'RahulPass123!' },
  { name: 'Sneha Reddy', username: 'sneha.reddy@email.com', pass: 'SnehaPass123!' },
  { name: 'Vikram Singh', username: 'vikram.singh@email.com', pass: 'VikramPass123!' },
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

  const filteredAccounts = POLICY_HOLDERS.filter(acc => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return true
    return (
      acc.name.toLowerCase().includes(q) ||
      acc.username.toLowerCase().includes(q)
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
    <div style={styles.root}>
      {/* Animated background orbs */}
      <div style={styles.orb1} />
      <div style={styles.orb2} />
      <div style={styles.orb3} />

      <div style={styles.card}>
        {/* Logo / Brand */}
        <div style={styles.brand}>
          <div style={styles.logoRing}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L4 6v6c0 5.25 3.5 10.15 8 11.5C16.5 22.15 20 17.25 20 12V6l-8-4z" fill="rgba(15,118,110,0.15)" stroke="#0f766e" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M9 12l2 2 4-4" stroke="#0f766e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 style={styles.brandName}>InsureAI</h1>
            <p style={styles.brandSub}>AI-Powered Insurance Command Center</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div style={styles.tabBar}>
          <button
            id={`${id}-tab-login`}
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => reset('login')}
            type="button"
          >
            Sign In
          </button>
          <button
            id={`${id}-tab-register`}
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => reset('register')}
            type="button"
          >
            Create Account
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate style={styles.form}>
          {/* Name field (register only) */}
          {mode === 'register' && (
            <div style={styles.field}>
              <label htmlFor={`${id}-name`} style={styles.label}>Full Name</label>
              <input
                id={`${id}-name`}
                type="text"
                autoComplete="name"
                placeholder="Arjun Sharma"
                value={name}
                onChange={e => setName(e.target.value)}
                style={{ ...styles.input, ...(errors.name ? styles.inputError : {}) }}
              />
              {errors.name && <span style={styles.errorMsg}>{errors.name}</span>}
            </div>
          )}

          {/* Email */}
          <div style={styles.field}>
            <label htmlFor={`${id}-email`} style={styles.label}>Email Address</label>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              placeholder="arjun@insureai.in"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                ...styles.input,
                ...(errors.email ? styles.inputError : {}),
                ...(justFilled ? { borderColor: '#10b981', boxShadow: '0 0 0 3px rgba(16,185,129,0.25)', transition: 'all 200ms ease' } : {}),
              }}
            />
            {errors.email && <span style={styles.errorMsg}>{errors.email}</span>}
          </div>

          {/* Phone (register only, optional) */}
          {mode === 'register' && (
            <div style={styles.field}>
              <label htmlFor={`${id}-phone`} style={styles.label}>
                Phone <span style={styles.optional}>(optional)</span>
              </label>
              <input
                id={`${id}-phone`}
                type="tel"
                autoComplete="tel"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={styles.input}
              />
            </div>
          )}

          {/* Password */}
          <div style={styles.field}>
            <label htmlFor={`${id}-password`} style={styles.label}>Password</label>
            <div style={styles.passwordWrapper}>
              <input
                id={`${id}-password`}
                type={showPass ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={{
                  ...styles.input,
                  ...styles.passwordInput,
                  ...(errors.password ? styles.inputError : {}),
                  ...(justFilled ? { borderColor: '#10b981', boxShadow: '0 0 0 3px rgba(16,185,129,0.25)', transition: 'all 200ms ease' } : {}),
                }}
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                style={styles.eyeBtn}
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
            {errors.password && <span style={styles.errorMsg}>{errors.password}</span>}
          </div>

          {/* Confirm Password (register only) */}
          {mode === 'register' && (
            <div style={styles.field}>
              <label htmlFor={`${id}-confirm`} style={styles.label}>Confirm Password</label>
              <input
                id={`${id}-confirm`}
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ ...styles.input, ...(errors.confirmPassword ? styles.inputError : {}) }}
              />
              {errors.confirmPassword && <span style={styles.errorMsg}>{errors.confirmPassword}</span>}
            </div>
          )}

          {/* General error */}
          {errors.general && (
            <div style={styles.generalError} role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {errors.general}
            </div>
          )}

          {/* Submit */}
          <button
            id={`${id}-submit`}
            type="submit"
            disabled={loading}
            style={{ ...styles.submitBtn, ...(loading ? styles.submitBtnLoading : {}) }}
          >
            {loading ? (
              <span style={styles.spinner} />
            ) : (
              mode === 'login' ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <p style={styles.switchText}>
          {mode === 'login' ? "Don't have an account? " : 'Already registered? '}
          <button
            style={styles.switchLink}
            onClick={() => reset(mode === 'login' ? 'register' : 'login')}
            type="button"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        {/* Policy Holder Accounts Dropdown with Instant Auto-Fill */}
        {mode === 'login' && (
          <div ref={dropdownRef} style={{ position: 'relative', marginTop: '16px' }}>
            {/* Main Toggle Button */}
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
                borderRadius: '10px',
                background: isDropdownOpen ? 'rgba(15,118,110,0.08)' : 'rgba(15,118,110,0.04)',
                border: isDropdownOpen ? '1px solid rgba(15,118,110,0.35)' : '1px solid rgba(15,118,110,0.18)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 180ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-primary)' }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-primary)' }}>
                  Policy Holder Accounts
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: '12px',
                  background: 'rgba(15,118,110,0.10)',
                  color: 'var(--accent-primary)',
                }}>
                  {POLICY_HOLDERS.length}
                </span>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    color: 'var(--accent-primary)',
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
              <div style={{
                marginTop: '8px',
                background: '#ffffff',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.10)',
                overflow: 'hidden',
                animation: 'fade-in 160ms ease',
                zIndex: 50,
              }}>
                {/* Search Bar */}
                <div style={{
                  padding: '8px 10px',
                  borderBottom: '1px solid var(--border-subtle)',
                  background: '#faf9f7',
                }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--text-muted)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }}
                    >
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search accounts..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      autoFocus
                      style={{
                        width: '100%',
                        padding: '6px 28px 6px 30px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        background: '#ffffff',
                        color: 'var(--text-primary)',
                        fontSize: '12px',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          padding: '2px',
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* Account List */}
                <div style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  padding: '4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}>
                  {filteredAccounts.length === 0 ? (
                    <div style={{
                      padding: '16px',
                      textAlign: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '12px',
                    }}>
                      No accounts found
                    </div>
                  ) : (
                    filteredAccounts.map(account => (
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
                          e.currentTarget.style.background = 'rgba(15, 118, 110, 0.06)'
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'transparent'
                        }}
                      >
                        <div style={{ minWidth: 0, textAlign: 'left' }}>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}>
                            {account.name}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                            marginTop: '2px',
                            display: 'flex',
                            gap: '8px',
                          }}>
                            <span>{account.username}</span>
                            <span>•</span>
                            <span style={{ color: 'var(--text-secondary)' }}>{account.pass}</span>
                          </div>
                        </div>

                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ color: 'var(--text-muted)', opacity: 0.5, flexShrink: 0, marginLeft: '8px' }}
                        >
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stuck session recovery */}
        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <button
            type="button"
            onClick={clearSession}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: '11px', padding: '4px 8px',
              textDecoration: 'underline', opacity: 0.7,
            }}
          >
            Having trouble? Clear session &amp; reload
          </button>
        </div>
      </div>
    </div>
  )
}


// ─── Styles ───────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  root: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #fef9f0 0%, #f7f5f2 50%, #f0ebe2 100%)',
    position: 'relative',
    overflow: 'hidden',
    padding: '24px',
  },
  orb1: {
    position: 'absolute', top: '-120px', left: '-120px', width: '480px', height: '480px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(15,118,110,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute', bottom: '-80px', right: '-80px', width: '400px', height: '400px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(180,83,9,0.07) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb3: {
    position: 'absolute', top: '40%', left: '60%', width: '300px', height: '300px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(29,111,164,0.05) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative', zIndex: 1,
    width: '100%', maxWidth: '440px',
    background: '#ffffff',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    padding: '40px 36px',
    boxShadow: '0 8px 40px rgba(120,113,108,0.14)',
    animation: 'fade-in 300ms ease forwards',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px',
  },
  logoRing: {
    width: '52px', height: '52px',
    borderRadius: '14px',
    background: 'rgba(15,118,110,0.08)',
    border: '1px solid rgba(15,118,110,0.20)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  brandName: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 },
  brandSub: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' },

  tabBar: {
    display: 'flex', gap: '4px',
    background: 'var(--border-subtle)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    padding: '4px',
    marginBottom: '28px',
  },
  tab: {
    flex: 1, padding: '9px', border: 'none', borderRadius: '7px',
    background: 'transparent', color: 'var(--text-muted)',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer',
    transition: 'all 200ms ease',
  },
  tabActive: {
    background: '#ffffff',
    color: 'var(--accent-primary)',
    boxShadow: '0 1px 4px rgba(120,113,108,0.12)',
    fontWeight: 600,
  },

  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' },
  optional: { fontWeight: 400, color: 'var(--text-muted)' },
  input: {
    width: '100%', padding: '11px 14px',
    background: 'var(--bg-primary)',
    border: '1px solid var(--border)',
    borderRadius: '9px',
    color: 'var(--text-primary)',
    fontSize: '14px',
    outline: 'none',
    transition: 'border-color 200ms',
    boxSizing: 'border-box',
  },
  inputError: { borderColor: 'var(--accent-red)' },
  passwordWrapper: { position: 'relative' },
  passwordInput: { paddingRight: '44px' },
  eyeBtn: {
    position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
    padding: '4px',
  },
  errorMsg: { fontSize: '12px', color: 'var(--accent-red)' },
  generalError: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '11px 14px',
    background: 'rgba(239,68,68,0.08)',
    border: '1px solid rgba(239,68,68,0.25)',
    borderRadius: '9px',
    color: 'var(--accent-red)',
    fontSize: '13px',
  },
  submitBtn: {
    marginTop: '4px',
    padding: '13px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #0f766e 0%, #0d5f58 100%)',
    color: '#fff',
    fontSize: '15px', fontWeight: 600,
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '48px',
    transition: 'opacity 200ms, transform 100ms',
    boxShadow: '0 4px 16px rgba(15,118,110,0.25)',
  },
  submitBtnLoading: { opacity: 0.7, cursor: 'not-allowed' },
  spinner: {
    width: '20px', height: '20px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTopColor: '#fff',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
  },
  switchText: { marginTop: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' },
  switchLink: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--accent-primary)', fontWeight: 500, fontSize: '13px', padding: 0,
  },
}
