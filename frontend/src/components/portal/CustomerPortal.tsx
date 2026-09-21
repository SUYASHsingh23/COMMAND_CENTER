import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useConversation } from '@/hooks/useConversation'
import { ConversationHistoryModal } from '@/components/conversation/ConversationHistoryModal'

export function CustomerPortal() {
  const { customer, logout } = useAuth()
  const { startSession } = useConversation()
  const [isStarting, setIsStarting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const [accountInfo, setAccountInfo] = useState<{ status: string; balance: number; plan_name: string } | null>(() => {
    if (customer?.account_status) {
      return {
        status: customer.account_status,
        balance: customer.balance ?? 0,
        plan_name: customer.plan ?? '',
      }
    }
    return null
  })

  // Synchronize account standing directly with the database in real time
  useEffect(() => {
    if (!customer?.customer_id) return
    if (customer.account_status) {
      setAccountInfo({
        status: customer.account_status,
        balance: customer.balance ?? 0,
        plan_name: customer.plan ?? '',
      })
    }

    fetch(`/api/v1/customers/${customer.customer_id}/accounts`)
      .then((res) => (res.ok ? res.json() : null))
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0) {
          const first = accounts[0]
          setAccountInfo({
            status: first.status || 'active',
            balance: Number(first.balance || 0),
            plan_name: first.plan_name || customer.plan || '',
          })
        }
      })
      .catch(() => {})
  }, [customer?.customer_id, customer?.account_status, customer?.balance, customer?.plan])

  const currentStatus = accountInfo?.status || customer?.account_status || 'active'
  const isSuspended = currentStatus.toLowerCase() === 'suspended'
  const planName = accountInfo?.plan_name || customer?.plan || 'Standard Policy'
  const planLower = planName.toLowerCase()

  const isMotor = planLower.includes('motor') || planLower.includes('auto') || planLower.includes('car')
  const isHome = planLower.includes('home') || planLower.includes('property')

  async function handleStartCall() {
    setIsStarting(true)
    try {
      const sess = await startSession(customer?.customer_id ?? undefined)
      if (sess?.session_id) {
        // Navigate to active call page
        window.history.pushState(null, '', '/call')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }
    } catch (err) {
      console.error('Failed to start session:', err)
      setIsStarting(false)
    }
  }

  async function handleLogout() {
    await logout()
    window.location.href = '/auth'
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--text-primary)',
    }}>
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent-primary), #0f766e)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(15,118,110,0.25)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--accent-primary)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              InsureAI Platform
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Customer Portal
            </div>
          </div>
        </div>

        {/* User Info & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right', marginRight: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {customer?.name || 'Valued Policyholder'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {customer?.email || 'Authenticated Account'}
            </div>
          </div>

          {customer?.customer_id && (
            <button
              id="portal-history-btn"
              type="button"
              onClick={() => setShowHistory(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                background: 'rgba(255, 255, 255, 0.03)',
                color: 'var(--text-secondary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </button>
          )}

          <button
            id="portal-logout-btn"
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            style={{
              padding: '7px 12px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#f87171'
              e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main Portal Body ─────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '36px 20px',
        overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 740, display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Welcome Card — Dynamically rendered based on Account Standing */}
          <div style={{
            background: 'var(--bg-secondary)',
            border: isSuspended ? '1px solid rgba(248,113,113,0.3)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-xl)',
            padding: '24px 28px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: 'var(--shadow-sm)',
            transition: 'all 0.2s ease',
          }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 11, fontWeight: 700,
                color: isSuspended ? '#f87171' : 'var(--accent-primary)',
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6,
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: isSuspended ? '#f87171' : 'var(--accent-primary)',
                }} />
                {isSuspended ? 'Suspended Policyholder' : 'Active Policyholder'}
              </div>
              <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                Welcome back, {customer?.name || 'Policyholder'}
              </h1>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, maxWidth: 480 }}>
                {isSuspended
                  ? `Your ${planName} policy is currently suspended due to non-payment of premiums. Connect with InsureAI to reconcile payments and restore coverage.`
                  : `Your ${planName} policy is active. Connect with InsureAI for voice & text assistance.`}
              </p>
            </div>

            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6,
              background: isSuspended ? 'rgba(248,113,113,0.06)' : 'rgba(255,255,255,0.02)',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: isSuspended ? '1px solid rgba(248,113,113,0.25)' : '1px solid var(--border)',
              textAlign: 'right',
            }}>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Account Standing
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: isSuspended ? '#f87171' : '#34d399',
                  boxShadow: isSuspended ? '0 0 8px rgba(248,113,113,0.7)' : '0 0 6px rgba(52,211,153,0.6)',
                }} />
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: isSuspended ? '#f87171' : '#34d399',
                }}>
                  {isSuspended ? 'Suspended' : 'Active & Verified'}
                </span>
              </div>
            </div>
          </div>

          {/* Central Call Trigger Card */}
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl)',
            padding: '44px 36px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 20,
            boxShadow: 'var(--shadow-md)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Subtle radial ambient highlight */}
            <div style={{
              position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)',
              width: 380, height: 260, borderRadius: '50%',
              background: isSuspended
                ? 'radial-gradient(circle, rgba(248,113,113,0.15) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(15,118,110,0.18) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} />

            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20,
              background: isSuspended ? 'rgba(248,113,113,0.12)' : 'rgba(15,118,110,0.12)',
              border: isSuspended ? '1px solid rgba(248,113,113,0.3)' : '1px solid rgba(15,118,110,0.3)',
              fontSize: 11.5, fontWeight: 600,
              color: isSuspended ? '#f87171' : 'var(--accent-primary)',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: isSuspended ? '#f87171' : 'var(--accent-primary)',
              }} />
              {isSuspended ? 'Reinstatement Specialist Ready' : 'Command Center Specialist Ready'}
            </div>

            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                Speak with InsureAI Specialist
              </h2>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 460, margin: 0, lineHeight: 1.5 }}>
                {isSuspended
                  ? 'Real-time voice and text consultation to clear outstanding balances, verify ledger invoices, and restore your coverage immediately.'
                  : 'Real-time voice and text consultation for immediate claim settlements, invoice disputes, policy details, and surveyor scheduling.'}
              </p>
            </div>

            {/* Big Start Call Button */}
            <button
              id="portal-start-call-btn"
              type="button"
              onClick={handleStartCall}
              disabled={isStarting}
              style={{
                marginTop: 8,
                width: 90, height: 90, borderRadius: '50%', border: 'none',
                cursor: isStarting ? 'not-allowed' : 'pointer',
                background: isSuspended
                  ? 'linear-gradient(135deg, #b91c1c, #991b1b)'
                  : 'linear-gradient(135deg, #0f766e, #0d5f58)',
                boxShadow: isSuspended
                  ? '0 0 32px rgba(185,28,28,0.35), var(--shadow-md)'
                  : '0 0 32px rgba(15,118,110,0.32), var(--shadow-md)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: isStarting ? 0.7 : 1,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                if (!isStarting) {
                  e.currentTarget.style.transform = 'scale(1.05)'
                  e.currentTarget.style.boxShadow = isSuspended
                    ? '0 0 40px rgba(185,28,28,0.48), var(--shadow-lg)'
                    : '0 0 40px rgba(15,118,110,0.48), var(--shadow-lg)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = isSuspended
                  ? '0 0 32px rgba(185,28,28,0.35), var(--shadow-md)'
                  : '0 0 32px rgba(15,118,110,0.32), var(--shadow-md)'
              }}
            >
              {isStarting ? (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.2)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.7s linear infinite',
                }} />
              ) : (
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>

            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
              {isStarting ? 'Initiating secure session…' : 'Tap to start call'}
            </div>
          </div>

          {/* Capability Grid — Personalized according to policy type */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}>
            {/* Box 1: Tailored to Insurance Type (Motor vs. Home vs. Health) */}
            {isMotor ? (
              <CapabilityCard
                title="Motor Accidental Claims"
                description="File vehicle collision damages, initiate cashless garage claims, and coordinate repair estimates."
                icon={(
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 11.1 2 11.5 2 12v4c0 .6.4 1 1 1h2" />
                    <circle cx="7" cy="17" r="2" />
                    <path d="M9 17h6" />
                    <circle cx="17" cy="17" r="2" />
                  </svg>
                )}
              />
            ) : isHome ? (
              <CapabilityCard
                title="Property Damage Claims"
                description="Submit structural damage claims, asset loss assessments, and emergency repair coverage."
                icon={(
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                )}
              />
            ) : (
              <CapabilityCard
                title="Cashless & Expense Claims"
                description="Process hospital admissions and medical expense reimbursements within policy limits."
                icon={(
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="15" y2="15" />
                  </svg>
                )}
              />
            )}

            <CapabilityCard
              title="Invoice & Ledger Audit"
              description="Review charges, verify billing lines, and trigger payment reconciliations."
              icon={(
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              )}
            />

            <CapabilityCard
              title="Surveyor Dispatch"
              description="Coordinate on-site physical inspections and surveyor appointments seamlessly."
              icon={(
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              )}
            />
          </div>

        </div>
      </main>

      {/* ── Conversation History Modal ──────────────────────────────────────── */}
      {showHistory && customer?.customer_id && (
        <ConversationHistoryModal
          customerId={customer.customer_id}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* ── Sign Out Confirmation Modal ──────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)', padding: 24, maxWidth: 360, width: '100%',
            boxShadow: 'var(--shadow-xl)',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, color: 'var(--text-primary)' }}>
              Sign out of portal?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Are you sure you want to log out of your InsureAI account?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'transparent',
                  color: 'var(--text-secondary)', fontSize: 12.5, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                id="confirm-portal-logout-btn"
                type="button"
                onClick={handleLogout}
                style={{
                  padding: '7px 14px', borderRadius: 'var(--radius-md)',
                  border: 'none', background: '#f87171', color: '#fff',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CapabilityCard({ title, description, icon }: { title: string; description: string; icon: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      transition: 'border-color 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {icon}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
        {description}
      </div>
    </div>
  )
}
