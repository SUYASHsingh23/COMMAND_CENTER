import React from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AuthPage } from '@/components/auth/AuthPage'
import { VoiceInterface } from '@/components/conversation/VoiceInterface'
import { CommandCenter } from '@/components/command-center/Dashboard'
import { CRMDashboard } from '@/components/crm/CRMDashboard'
import BillingDashboard from '@/components/billing/BillingDashboard'
import SchedulingDashboard from '@/components/scheduling/SchedulingDashboard'

/** Full-screen loading spinner shown while restoring session from stored refresh token. */
function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-primary)', gap: '16px',
    }}>
      <div style={{
        width: '36px', height: '36px',
        border: '3px solid rgba(59,130,246,0.2)',
        borderTopColor: '#3b82f6',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <p style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Restoring session…</p>
    </div>
  )
}

/** Top navigation bar shown on supervisor/internal pages */
function SupervisorNav() {
  const path = window.location.pathname
  const navStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '4px',
    padding: '8px 16px',
    background: 'var(--bg-secondary)',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  }
  const linkStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '8px',
    background: active ? 'rgba(59,130,246,0.15)' : 'transparent',
    color: active ? 'var(--accent-blue)' : 'var(--text-secondary)',
    fontSize: '13px',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    border: 'none',
    textDecoration: 'none',
    display: 'inline-block',
    transition: 'all 150ms ease',
  })
  const go = (url: string) => { window.location.href = url }
  return (
    <nav style={navStyle}>
      <span style={{ fontWeight: 700, color: 'var(--accent-blue)', fontSize: '13px', marginRight: '8px', letterSpacing: '0.06em' }}>
        🖥 SUPERVISOR
      </span>
      <button style={linkStyle(path.startsWith('/supervisor'))} onClick={() => go('/supervisor')}>Dashboard</button>
      <button style={linkStyle(path.startsWith('/crm'))} onClick={() => go('/crm')}>CRM</button>
      <button style={linkStyle(path.startsWith('/billing'))} onClick={() => go('/billing')}>Billing</button>
      <button style={linkStyle(path.startsWith('/scheduling'))} onClick={() => go('/scheduling')}>Scheduling</button>
      <div style={{ flex: 1 }} />
      <button style={linkStyle(false)} onClick={() => go('/')}>← Customer Portal</button>
    </nav>
  )
}

/** Inner router — only rendered once auth context is ready. */
function Router() {
  const { isAuthenticated, isLoading } = useAuth()

  const path = window.location.pathname

  // ── Public supervisor / back-office routes (NO auth required) ─────────────
  if (path.startsWith('/supervisor')) return <><SupervisorNav /><CommandCenter /></>
  if (path.startsWith('/crm'))        return <><SupervisorNav /><CRMDashboard /></>
  if (path.startsWith('/billing'))    return <><SupervisorNav /><BillingDashboard /></>
  if (path.startsWith('/scheduling')) return <><SupervisorNav /><SchedulingDashboard /></>

  // ── Customer portal routes (auth required) ────────────────────────────────
  if (isLoading) return <LoadingScreen />
  if (!isAuthenticated) return <AuthPage />
  return <VoiceInterface />
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  )
}
