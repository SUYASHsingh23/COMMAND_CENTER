import React, { useState, useEffect } from 'react'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { AuthPage } from '@/components/auth/AuthPage'
import { CustomerPortal } from '@/components/portal/CustomerPortal'
import { VoiceInterface } from '@/components/conversation/VoiceInterface'
import { ConversationHistoryModal } from '@/components/conversation/ConversationHistoryModal'
import { CommandCenter } from '@/components/command-center/Dashboard'
import { CRMDashboard } from '@/components/crm/CRMDashboard'
import BillingDashboard from '@/components/billing/BillingDashboard'
import SchedulingDashboard from '@/components/scheduling/SchedulingDashboard'
import { useConversationStore } from '@/store/conversation'

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
        border: '3px solid rgba(15,118,110,0.15)',
        borderTopColor: '#0f766e',
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
    background: '#ffffff',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    boxShadow: '0 1px 4px rgba(120,113,108,0.08)',
  }
  const linkStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '8px',
    background: active ? 'rgba(15,118,110,0.10)' : 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
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
      <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '13px', marginRight: '8px', letterSpacing: '0.06em' }}>
        🛡 InsureAI Admin
      </span>
      <button style={linkStyle(path.startsWith('/supervisor'))} onClick={() => go('/supervisor')}>Dashboard</button>
      <button style={linkStyle(path.startsWith('/crm'))} onClick={() => go('/crm')}>Policy Holders</button>
      <button style={linkStyle(path.startsWith('/billing'))} onClick={() => go('/billing')}>Premium &amp; Claims</button>
      <button style={linkStyle(path.startsWith('/scheduling'))} onClick={() => go('/scheduling')}>Surveyor Scheduling</button>
      <div style={{ flex: 1 }} />
      <button style={linkStyle(false)} onClick={() => go('/portal')}>← Customer Portal</button>
    </nav>
  )
}

// ── Inner router — only rendered once auth context is ready. ────────
function Router() {
  const { isAuthenticated, isLoading } = useAuth()
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const handleLocationChange = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handleLocationChange)
    return () => window.removeEventListener('popstate', handleLocationChange)
  }, [])

  // ── Public supervisor / back-office routes (NO auth required) ─────────────
  if (path.startsWith('/supervisor')) return <><SupervisorNav /><CommandCenter /></>
  if (path.startsWith('/crm'))        return <><SupervisorNav /><CRMDashboard /></>
  if (path.startsWith('/billing'))    return <><SupervisorNav /><BillingDashboard /></>
  if (path.startsWith('/scheduling')) return <><SupervisorNav /><SchedulingDashboard /></>

  // ── Customer portal routes ────────────────────────────────────────────────
  if (isLoading) return <LoadingScreen />

  // Unauthenticated users can only view /auth
  if (!isAuthenticated) {
    if (path !== '/auth') {
      window.history.replaceState(null, '', '/auth')
    }
    return <AuthPage />
  }

  // Authenticated users:
  if (path === '/auth') {
    window.history.replaceState(null, '', '/portal')
    return <CustomerPortal />
  }

  if (path === '/' || path === '/portal') {
    return <CustomerPortal />
  }

  if (path === '/history') {
    return (
      <ConversationHistoryModal
        onClose={() => {
          window.history.pushState(null, '', '/portal')
          window.dispatchEvent(new PopStateEvent('popstate'))
        }}
      />
    )
  }

  if (path === '/call') {
    return <VoiceInterface />
  }

  // Backward compatibility: redirect /chat to /call if active session, else /portal
  if (path === '/chat') {
    const hasActiveSession = !!useConversationStore.getState().session
    const target = hasActiveSession ? '/call' : '/portal'
    window.history.replaceState(null, '', target)
    return hasActiveSession ? <VoiceInterface /> : <CustomerPortal />
  }

  // Fallback for any unknown route
  window.history.replaceState(null, '', '/portal')
  return <CustomerPortal />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router />
      </AuthProvider>
    </ThemeProvider>
  )
}
