import React, { useState, useId } from 'react'
import { useAuth } from '@/contexts/AuthContext'

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

  const reset = (nextMode: Mode) => {
    setMode(nextMode)
    setErrors({})
    setPassword('')
    setConfirmPassword('')
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
              <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M2 17l10 5 10-5" stroke="#3b82f6" strokeWidth="1.5" strokeLinejoin="round"/>
              <path d="M2 12l10 5 10-5" stroke="#06b6d4" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h1 style={styles.brandName}>Command Center</h1>
            <p style={styles.brandSub}>AI-Powered Contact Center</p>
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
              placeholder="arjun@connectplus.in"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ ...styles.input, ...(errors.email ? styles.inputError : {}) }}
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
                style={{ ...styles.input, ...styles.passwordInput, ...(errors.password ? styles.inputError : {}) }}
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

        {/* Test credentials hint */}
        {mode === 'login' && (
          <div style={{
            marginTop: '16px',
            padding: '12px 14px',
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '10px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
            maxHeight: '180px',
            overflowY: 'auto',
          }}>
            <div style={{ fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '8px', fontSize: '12px', position: 'sticky', top: 0, paddingBottom: '4px', zIndex: 1, borderBottom: '1px solid var(--border-subtle)' }}>🔑 Available Customers</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                { name: 'Anita Desai', email: 'anita.desai@example.com', pass: 'AnitaPass123!' },
                { name: 'Rajan Mehta', email: 'rajan.mehta@example.com', pass: 'RajanPass123!' },
                { name: 'Suresh Kumar', email: 'suresh.kumar@example.com', pass: 'SureshPass123!' },
                { name: 'Kavitha Nair', email: 'kavitha.nair@example.com', pass: 'KavithaPass123!' },
                { name: 'Priya Sharma', email: 'priya.sharma@example.com', pass: 'PriyaPass123!' },
                { name: 'Amit Patel', email: 'amit.patel@email.com', pass: 'AmitPass123!' },
                { name: 'Priya Nair', email: 'priya.nair@email.com', pass: 'PriyaPass123!' },
                { name: 'Rahul Sharma', email: 'rahul.sharma@email.com', pass: 'RahulPass123!' },
                { name: 'Sneha Reddy', email: 'sneha.reddy@email.com', pass: 'SnehaPass123!' },
                { name: 'Vikram Singh', email: 'vikram.singh@email.com', pass: 'VikramPass123!' },
              ].map(c => (
                <div key={c.email} style={{ display: 'flex', flexDirection: 'column', padding: '6px', background: 'var(--surface-2)', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>{c.name}</div>
                  <div><span style={{opacity:0.7}}>Email:</span> <code style={{ color: 'var(--text-secondary)' }}>{c.email}</code></div>
                  <div><span style={{opacity:0.7}}>Password:</span> <code style={{ color: 'var(--text-secondary)' }}>{c.pass}</code></div>
                </div>
              ))}
            </div>
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
    background: 'var(--bg-primary)',
    position: 'relative',
    overflow: 'hidden',
    padding: '24px',
  },
  orb1: {
    position: 'absolute', top: '-120px', left: '-120px', width: '480px', height: '480px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb2: {
    position: 'absolute', bottom: '-80px', right: '-80px', width: '400px', height: '400px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.10) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  orb3: {
    position: 'absolute', top: '40%', left: '60%', width: '300px', height: '300px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative', zIndex: 1,
    width: '100%', maxWidth: '440px',
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    padding: '40px 36px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
    animation: 'fade-in 300ms ease forwards',
  },
  brand: {
    display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px',
  },
  logoRing: {
    width: '52px', height: '52px',
    borderRadius: '14px',
    background: 'rgba(59,130,246,0.10)',
    border: '1px solid rgba(59,130,246,0.25)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  brandName: { fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 },
  brandSub: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' },

  tabBar: {
    display: 'flex', gap: '4px',
    background: 'var(--bg-secondary)',
    border: '1px solid var(--border-subtle)',
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
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
  },

  form: { display: 'flex', flexDirection: 'column', gap: '18px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' },
  optional: { fontWeight: 400, color: 'var(--text-muted)' },
  input: {
    width: '100%', padding: '11px 14px',
    background: 'var(--bg-secondary)',
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
    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    color: '#fff',
    fontSize: '15px', fontWeight: 600,
    border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: '48px',
    transition: 'opacity 200ms, transform 100ms',
    boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
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
    color: 'var(--accent-blue)', fontWeight: 500, fontSize: '13px', padding: 0,
  },
}
