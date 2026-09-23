import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useConversation } from '@/hooks/useConversation'
import { ConversationHistoryModal } from '@/components/conversation/ConversationHistoryModal'

type PolicyCategory = 'health' | 'motor' | 'home' | 'general'

function getPolicyCategory(plan?: string | null): PolicyCategory {
  if (!plan) return 'general'
  const lower = plan.toLowerCase()
  if (lower.includes('health') || lower.includes('medical') || lower.includes('shield')) return 'health'
  if (lower.includes('motor') || lower.includes('auto') || lower.includes('vehicle') || lower.includes('car') || lower.includes('third party')) return 'motor'
  if (lower.includes('home') || lower.includes('property') || lower.includes('protector')) return 'home'
  return 'general'
}

export function CustomerPortal() {
  const { customer, logout } = useAuth()
  const { theme, isDark, setTheme } = useTheme()
  const { startSession } = useConversation()
  const [isStarting, setIsStarting] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [downloadToast, setDownloadToast] = useState<string | null>(null)
  const [activeServiceModal, setActiveServiceModal] = useState<string | null>(null)

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
  const policyholderName = customer?.name || 'Policyholder'
  const planName = accountInfo?.plan_name || customer?.plan || 'Health Shield Gold'
  const rawAcc = customer?.account_number || (customer?.customer_id ? customer.customer_id.substring(0, 8).toUpperCase() : '001')
  const policyNumber = rawAcc.startsWith('ACC-') ? rawAcc : `ACC-${rawAcc}`
  const customerTier = customer?.customer_tier || 'Gold'
  const customerEmail = customer?.email || 'customer@example.com'
  const customerPhone = customer?.phone || '+91 98765 43210'
  const preferredLanguage = customer?.preferred_language || 'English'
  const balance = accountInfo?.balance ?? customer?.balance ?? 0
  const policyCategory = getPolicyCategory(planName)

  // Service Card 1 Config (Claims)
  const claimConfig = {
    health: {
      title: 'Health & Medical Claims',
      description: 'Submit cashless hospitalization requests, medical bill reimbursements, and pre-authorizations.',
      actionLabel: 'File Claim →',
      modalTitle: 'Health & Medical Claims',
      modalDesc: 'Would you like to initiate a voice call with the InsureAI health claims specialist to verify cashless hospitalization, review medical bills, and process your claim in real time?',
    },
    motor: {
      title: 'Motor Accident Claims',
      description: 'Submit roadside accident claims, vehicle repair estimates, and cashless garage authorizations.',
      actionLabel: 'File Claim →',
      modalTitle: 'Motor Accident Claims',
      modalDesc: 'Would you like to initiate a voice call with the InsureAI motor claims triage agent to record damage photos, garage repair estimates, and file your accident claim in real time?',
    },
    home: {
      title: 'Property Damage Claims',
      description: 'Submit structural damage claims, asset loss assessments, and emergency repair coverage.',
      actionLabel: 'File Claim →',
      modalTitle: 'Property Damage Claims',
      modalDesc: 'Would you like to initiate a voice call with the InsureAI claims triage agent to record photos, asset damage estimates, and file your claim in real time?',
    },
    general: {
      title: 'Insurance Claims & Triage',
      description: 'Submit incident claims, loss assessments, pre-authorizations, and emergency coverage requests.',
      actionLabel: 'File Claim →',
      modalTitle: 'Insurance Claims & Triage',
      modalDesc: 'Would you like to initiate a voice call with the InsureAI claims specialist to submit incident documentation, review coverage, and process your claim in real time?',
    },
  }[policyCategory]

  // Service Card 3 Config (Dispatch/Desk)
  const dispatchConfig = {
    health: {
      title: 'TPA & Medical Desk',
      description: 'Coordinate hospital desk approvals, cashless network access, and specialist consultations seamlessly.',
      actionLabel: 'Connect TPA →',
      modalTitle: 'TPA & Hospital Desk Coordination',
      modalDesc: 'Coordinate hospital admission authorizations and network coverage pre-clearance directly with our AI voice specialist.',
    },
    motor: {
      title: 'Surveyor & Towing Dispatch',
      description: 'Coordinate on-site vehicle damage inspections, roadside towing, and surveyor appointments seamlessly.',
      actionLabel: 'Dispatch Surveyor →',
      modalTitle: 'Surveyor & Towing Dispatch',
      modalDesc: 'Schedule an on-site physical vehicle inspection or emergency roadside towing directly through our AI voice specialist.',
    },
    home: {
      title: 'Surveyor Dispatch',
      description: 'Coordinate on-site physical damage inspections and surveyor appointments seamlessly.',
      actionLabel: 'Dispatch Surveyor →',
      modalTitle: 'Surveyor Dispatch',
      modalDesc: 'Schedule an on-site physical inspection with an accredited surveyor directly through our AI voice specialist.',
    },
    general: {
      title: 'Specialist Dispatch',
      description: 'Coordinate on-site physical inspections, assessor appointments, and claims dispatch seamlessly.',
      actionLabel: 'Dispatch Specialist →',
      modalTitle: 'Specialist Dispatch',
      modalDesc: 'Schedule an on-site physical assessment or expert surveyor inspection directly through our AI voice specialist.',
    },
  }[policyCategory]

  // Dynamic Hero Subtitle
  const heroSubtitle = isSuspended
    ? 'Initiate voice triage to review outstanding balances, verify ledger statements, and instantly reinstate your policy coverage.'
    : policyCategory === 'health'
      ? 'Connect instantly for voice and text triage of cashless hospitalization claims, medical pre-authorizations, real-time invoice audits, and policy coverage verification.'
      : policyCategory === 'motor'
        ? 'Connect instantly for voice and text triage of vehicle accident claims, garage authorizations, real-time invoice audits, and automated surveyor dispatch.'
        : policyCategory === 'home'
          ? 'Connect instantly for voice and text triage of property damage claims, real-time invoice audits, policy adjustments, and automated surveyor dispatch.'
          : 'Connect instantly for voice and text triage of insurance claims, policy coverage inquiries, real-time invoice audits, and expert specialist dispatch.'

  /**
   * Start Call Transition:
   * 1. Left column animates translateX(-120%), opacity: 0 (500ms cubic-bezier(0.4, 0, 0.2, 1))
   * 2. Right column animates translateX(120%), opacity: 0 (500ms cubic-bezier(0.4, 0, 0.2, 1))
   * 3. Center hero outer radar rings expand scale(1) -> scale(3.5), hero card fades to 0 (550ms)
   * 4. Route pushes to /call at t = 500ms
   */
  async function handleStartCall() {
    if (isStarting || isExiting) return
    setIsStarting(true)
    setIsExiting(true)

    // Trigger session creation
    const sessionPromise = startSession(customer?.customer_id ?? undefined, customer?.name).catch((err) => {
      console.error('Failed to start session:', err)
      return null
    })

    // Execute route transition precisely at t = 500ms
    setTimeout(async () => {
      await sessionPromise
      window.history.pushState(null, '', '/call')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }, 500)
  }

  async function handleLogout() {
    await logout()
    window.location.href = '/auth'
  }

  // Handle Download Policy Document
  function handleDownloadPolicyDocs() {
    const docContent = `===============================================================
INSUREAI DIGITAL POLICY SCHEDULE & DECLARATIONS
===============================================================
Policyholder:       ${policyholderName}
Policy/Account ID:  ${policyNumber}
Plan Name:          ${planName}
Tier:               ${customerTier} Tier
Status:             ${isSuspended ? 'SUSPENDED' : 'ACTIVE & VERIFIED'}
Email:              ${customerEmail}
Phone:              ${customerPhone}
Language:           ${preferredLanguage}
Account Balance:    $${balance.toFixed(2)} USD
Underwriter:        InsureAI Autonomous Insurance Contact Center
===============================================================
This document serves as an official digital proof of insurance.
Certified & Digitally Signed by InsureAI Security Protocol.
===============================================================`

    const blob = new Blob([docContent], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `InsureAI_Policy_${policyNumber}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setDownloadToast(`Policy document "${policyNumber}" downloaded successfully.`)
    setTimeout(() => setDownloadToast(null), 4000)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      backgroundImage: isDark
        ? 'linear-gradient(rgba(11, 17, 32, 0.78), rgba(11, 17, 32, 0.88)), url("/assets/bg-dark-city.jpg")'
        : 'linear-gradient(rgba(240, 246, 255, 0.75), rgba(240, 246, 255, 0.88)), url("/assets/bg-light-city.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      color: isDark ? '#f8fafc' : '#0f172a',
      overflow: 'hidden',
      position: 'relative',
      boxSizing: 'border-box',
    }}>
      {/* ── Top Header Bar ──────────────────────────────────────────────────────── */}
      <header style={{
        height: '64px',
        padding: '0 32px',
        borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(226, 232, 240, 0.85)',
        background: isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.88)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 50,
      }}>
        {/* Brand / Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 12,
            background: isSuspended
              ? 'linear-gradient(135deg, #ef4444, #991b1b)'
              : 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #3b82f6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: isSuspended ? '0 4px 14px rgba(239, 68, 68, 0.35)' : '0 4px 14px rgba(37, 99, 235, 0.35)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(255, 255, 255, 0.15)" />
              <path d="M9 12l2 2 4-4" strokeWidth="2.4" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 10.5, color: isDark ? '#38bdf8' : '#2563eb', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              InsureAI Platform
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '-0.01em' }}>
              Customer Portal
            </div>
          </div>
        </div>

        {/* Right Header: Theme Switcher Pill, History, Profile & Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Theme Pill Toggle (Matching Login Page) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '9999px',
            padding: '3px',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            gap: '3px',
          }}>
            <button
              id="portal-theme-light-btn"
              type="button"
              onClick={() => setTheme('light')}
              title="Switch to light theme"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: !isDark ? '#ffffff' : 'transparent',
                color: !isDark ? '#f59e0b' : '#64748b',
                boxShadow: !isDark ? '0 2px 6px rgba(0, 0, 0, 0.1)' : 'none',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 200ms ease',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
              id="portal-theme-dark-btn"
              type="button"
              onClick={() => setTheme('dark')}
              title="Switch to dark theme"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                background: isDark ? '#0284c7' : 'transparent',
                color: isDark ? '#ffffff' : '#64748b',
                boxShadow: isDark ? '0 2px 6px rgba(2, 132, 199, 0.4)' : 'none',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 200ms ease',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={isDark ? '#bae6fd' : 'none'} />
              </svg>
            </button>
          </div>

          {/* History Button */}
          <button
            id="portal-history-btn"
            type="button"
            onClick={() => setShowHistory(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: '10px',
                border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(226, 232, 240, 0.9)',
                background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(10px)',
                color: isDark ? '#e2e8f0' : '#475569',
                fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.08)'
                e.currentTarget.style.color = isDark ? '#38bdf8' : '#2563eb'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.8)'
                e.currentTarget.style.color = isDark ? '#e2e8f0' : '#475569'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </button>

          {/* User Profile Pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '5px 12px 5px 6px', borderRadius: '24px',
            background: isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(10px)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
              color: '#fff', fontSize: 12, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {policyholderName.charAt(0)}
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a', lineHeight: 1.2 }}>
                {policyholderName}
              </div>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            id="portal-logout-btn"
            type="button"
            onClick={() => setShowLogoutConfirm(true)}
            style={{
              padding: '7px 14px', borderRadius: '10px',
              border: isDark ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(239, 68, 68, 0.25)',
              background: isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.7)',
              color: '#ef4444',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#ef4444'
              e.currentTarget.style.color = '#ffffff'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.7)'
              e.currentTarget.style.color = '#ef4444'
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main 3-Column Dashboard Container ────────────────────────────────── */}
      <main style={{
        flex: 1,
        display: 'grid',
        gridTemplateColumns: '1fr 2fr 1fr',
        gap: '24px',
        padding: '24px 32px',
        boxSizing: 'border-box',
        height: 'calc(100vh - 64px)',
        overflow: 'hidden',
        position: 'relative',
        zIndex: 10,
      }}>

        {/* ── LEFT COLUMN (~25% width - Real User Policyholder Data) ─────────── */}
        <div
          className={`portal-col-left ${isExiting ? 'is-exiting' : ''}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          {/* Card: Policyholder Profile & Actual Account Details */}
          <div style={{
            background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(20px)',
            border: isSuspended
              ? '1px solid rgba(239, 68, 68, 0.35)'
              : (isDark ? '1px solid rgba(56, 189, 248, 0.2)' : '1px solid rgba(226, 232, 240, 0.95)'),
            borderRadius: '24px',
            padding: '24px',
            boxShadow: isDark
              ? '0 20px 50px -10px rgba(0, 0, 0, 0.5), 0 0 30px rgba(14, 165, 233, 0.08)'
              : '0 20px 50px -10px rgba(37, 99, 235, 0.12), 0 4px 15px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Top Accent Gradient Bar */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 4,
              background: isSuspended ? '#ef4444' : 'linear-gradient(90deg, #1e40af, #2563eb, #38bdf8)',
            }} />

            {/* Profile Header */}
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: isSuspended
                  ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                  : 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #38bdf8 100%)',
                color: '#fff', fontSize: 22, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 6px 16px rgba(37, 99, 235, 0.35)',
                flexShrink: 0,
              }}>
                {policyholderName.charAt(0)}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: isDark ? '#f8fafc' : '#0f172a', margin: '0 0 4px', letterSpacing: '-0.01em' }}>
                  {policyholderName}
                </h2>
                <div style={{ fontSize: 12, color: isDark ? '#94a3b8' : '#64748b', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {customerEmail}
                </div>
              </div>
            </div>

            {/* Active / Suspended Status Pill */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 14px',
              borderRadius: '9999px',
              background: isSuspended
                ? 'rgba(239, 68, 68, 0.12)'
                : (isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(16, 185, 129, 0.1)'),
              border: isSuspended
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : (isDark ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(16, 185, 129, 0.3)'),
              alignSelf: 'flex-start',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: isSuspended ? '#ef4444' : '#10b981',
                boxShadow: isSuspended ? '0 0 8px #ef4444' : '0 0 8px #10b981',
              }} />
              <span style={{
                fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em',
                color: isSuspended ? '#ef4444' : (isDark ? '#4ade80' : '#059669'),
                textTransform: 'uppercase',
              }}>
                {isSuspended ? 'Suspended Policyholder' : 'Active Policyholder'}
              </span>
            </div>

            {/* Real Customer Information Fields */}
            <div style={{
              background: isDark ? 'rgba(30, 41, 59, 0.5)' : '#f8faff',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(219, 234, 254, 0.8)',
              borderRadius: '16px',
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              {/* Plan Name */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Policy Plan
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? '#38bdf8' : '#2563eb' }}>
                  {planName}
                </span>
              </div>

              {/* Policy Number / Account ID */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Policy Number
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', fontFamily: 'var(--font-mono)' }}>
                  {policyNumber}
                </span>
              </div>

              {/* Customer Tier */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Tier Status
                </span>
                <span style={{
                  fontSize: 11.5, fontWeight: 700, padding: '2px 9px', borderRadius: '6px',
                  background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                  color: isDark ? '#38bdf8' : '#2563eb',
                }}>
                  {customerTier} Tier
                </span>
              </div>

              {/* Phone */}
              {customerPhone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    Phone
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                    {customerPhone}
                  </span>
                </div>
              )}

              {/* Language */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Language
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: isDark ? '#cbd5e1' : '#334155' }}>
                  {preferredLanguage}
                </span>
              </div>

              {/* Account Standing */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(226, 232, 240, 0.6)' }}>
                <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Standing
                </span>
                <span style={{
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: isSuspended ? '#ef4444' : (isDark ? '#4ade80' : '#10b981'),
                }}>
                  {isSuspended ? 'Suspended' : 'Active & Verified'}
                </span>
              </div>
            </div>

            {/* Quick Security Badge */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: '12px',
              background: isDark ? 'rgba(56, 189, 248, 0.08)' : 'rgba(37, 99, 235, 0.05)',
              border: isDark ? '1px solid rgba(56, 189, 248, 0.15)' : '1px solid rgba(37, 99, 235, 0.12)',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#38bdf8' : '#2563eb'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#475569', fontWeight: 500 }}>
                Directly authenticated via InsureAI Security Protocol
              </span>
            </div>
          </div>
        </div>

        {/* ── CENTER COLUMN (~50% width - Hero Voice Launcher) ───────────────── */}
        <div
          className={`portal-hero-card ${isExiting ? 'is-exiting' : ''}`}
          style={{
            height: '100%',
            background: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.94)',
            backdropFilter: 'blur(24px)',
            border: isSuspended
              ? '1px solid rgba(239, 68, 68, 0.35)'
              : (isDark ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(226, 232, 240, 0.95)'),
            borderRadius: '28px',
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            gap: '28px',
            boxShadow: isDark
              ? '0 25px 60px -15px rgba(0, 0, 0, 0.6), 0 0 50px rgba(14, 165, 233, 0.12)'
              : '0 25px 60px -15px rgba(37, 99, 235, 0.16), 0 10px 25px -5px rgba(15, 23, 42, 0.05)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Subtle Ambient Radial Glow */}
          <div style={{
            position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
            width: 500, height: 500, borderRadius: '50%',
            background: isSuspended
              ? 'radial-gradient(circle, rgba(239, 68, 68, 0.12) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(37, 99, 235, 0.14) 0%, transparent 70%)',
            pointerEvents: 'none',
            zIndex: 1,
          }} />

          {/* Top Hero Status Pill */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 18px',
            borderRadius: '9999px',
            background: isSuspended
              ? 'rgba(239, 68, 68, 0.12)'
              : (isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.08)'),
            border: isSuspended
              ? '1px solid rgba(239, 68, 68, 0.3)'
              : (isDark ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(37, 99, 235, 0.25)'),
            zIndex: 2,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isSuspended ? '#ef4444' : '#10b981',
              boxShadow: isSuspended ? '0 0 10px #ef4444' : '0 0 10px #10b981',
            }} />
            <span style={{
              fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: isSuspended ? '#ef4444' : (isDark ? '#38bdf8' : '#2563eb'),
            }}>
              {isSuspended ? 'Reinstatement Specialist Ready' : 'InsureAI Specialist Online'}
            </span>
          </div>

          {/* Hero Typography */}
          <div style={{ zIndex: 2, maxWidth: 540 }}>
            <h1 style={{
              fontSize: 32,
              fontWeight: 800,
              color: isDark ? '#f8fafc' : '#0f172a',
              margin: '0 0 14px',
              letterSpacing: '-0.025em',
              lineHeight: 1.2,
            }}>
              Speak with InsureAI Specialist
            </h1>
            <p style={{
              fontSize: 15,
              color: isDark ? '#94a3b8' : '#475569',
              margin: 0,
              lineHeight: 1.6,
            }}>
              {heroSubtitle}
            </p>
          </div>

          {/* ── Central Microphone Launcher with Multi-Ring Radar Ripple Effects ── */}
          <div style={{
            position: 'relative',
            width: 230,
            height: 230,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 5,
            margin: '8px 0',
          }}>
            {/* Multi-Ring Radar Wave 1 */}
            <div
              className={`radar-ring-1 ${isExiting ? 'portal-radar-expanding' : ''}`}
              style={{
                position: 'absolute',
                width: 110,
                height: 110,
                borderRadius: '50%',
                border: isSuspended ? '2px solid rgba(239, 68, 68, 0.5)' : '2px solid rgba(37, 99, 235, 0.45)',
                pointerEvents: 'none',
              }}
            />

            {/* Multi-Ring Radar Wave 2 */}
            <div
              className={`radar-ring-2 ${isExiting ? 'portal-radar-expanding' : ''}`}
              style={{
                position: 'absolute',
                width: 110,
                height: 110,
                borderRadius: '50%',
                border: isSuspended ? '2px solid rgba(239, 68, 68, 0.4)' : '2px solid rgba(56, 189, 248, 0.4)',
                pointerEvents: 'none',
              }}
            />

            {/* Multi-Ring Radar Wave 3 */}
            <div
              className={`radar-ring-3 ${isExiting ? 'portal-radar-expanding' : ''}`}
              style={{
                position: 'absolute',
                width: 110,
                height: 110,
                borderRadius: '50%',
                border: isSuspended ? '2px solid rgba(239, 68, 68, 0.3)' : '2px solid rgba(14, 165, 233, 0.3)',
                pointerEvents: 'none',
              }}
            />

            {/* Large Interactive Center Microphone Button */}
            <button
              id="portal-start-call-btn"
              type="button"
              onClick={handleStartCall}
              disabled={isStarting}
              aria-label="Start call with InsureAI Specialist"
              style={{
                width: 100,
                height: 100,
                borderRadius: '50%',
                border: 'none',
                cursor: isStarting ? 'not-allowed' : 'pointer',
                background: isSuspended
                  ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                  : 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #38bdf8 100%)',
                boxShadow: isSuspended
                  ? '0 0 40px rgba(239, 68, 68, 0.5), 0 10px 25px rgba(0,0,0,0.2)'
                  : '0 0 45px rgba(37, 99, 235, 0.45), 0 10px 25px rgba(0,0,0,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isStarting ? 0.85 : 1,
                transition: 'all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
                position: 'relative',
                zIndex: 10,
              }}
              onMouseEnter={(e) => {
                if (!isStarting && !isExiting) {
                  e.currentTarget.style.transform = 'scale(1.08)'
                  e.currentTarget.style.boxShadow = isSuspended
                    ? '0 0 54px rgba(239, 68, 68, 0.65), 0 14px 28px rgba(0,0,0,0.25)'
                    : '0 0 55px rgba(37, 99, 235, 0.6), 0 14px 28px rgba(37, 99, 235, 0.3)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = isSuspended
                  ? '0 0 40px rgba(239, 68, 68, 0.5), 0 10px 25px rgba(0,0,0,0.2)'
                  : '0 0 45px rgba(37, 99, 235, 0.45), 0 10px 25px rgba(0,0,0,0.15)'
              }}
            >
              {isStarting ? (
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  border: '3px solid rgba(255,255,255,0.25)',
                  borderTopColor: '#ffffff',
                  animation: 'spin 0.7s linear infinite',
                }} />
              ) : (
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          </div>

          {/* Button Subtitle */}
          <div style={{ zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              fontSize: 15,
              fontWeight: 700,
              color: isSuspended ? '#ef4444' : (isDark ? '#38bdf8' : '#2563eb'),
              letterSpacing: '0.01em',
            }}>
              {isStarting ? 'Initiating secure AI session…' : 'Tap to start call'}
            </div>
            <div style={{ fontSize: 12.5, color: isDark ? '#94a3b8' : '#64748b' }}>
              Encrypted Real-Time Voice &amp; Text Channel
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN (~25% width - Services & Actions Vertical Stack) ───── */}
        <div
          className={`portal-col-right ${isExiting ? 'is-exiting' : ''}`}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          {/* Quick Actions Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2px 4px',
          }}>
            <div style={{
              fontSize: 12,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: isDark ? '#94a3b8' : '#64748b',
            }}>
              Quick Services &amp; Actions
            </div>
            <span style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: isDark ? '#38bdf8' : '#2563eb',
              background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.08)',
              padding: '2px 8px',
              borderRadius: '9999px',
            }}>
              4 Available
            </span>
          </div>

          {/* Service Card 1: Claims (Dynamic by policy type) */}
          <ServiceActionCard
            id="service-card-claims"
            isDark={isDark}
            title={claimConfig.title}
            description={claimConfig.description}
            actionLabel={claimConfig.actionLabel}
            accentColor="#2563eb"
            onClick={() => setActiveServiceModal('claims')}
            icon={
              policyCategory === 'health' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                  <path d="M12 9v6" />
                  <path d="M9 12h6" />
                </svg>
              ) : policyCategory === 'motor' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C2.1 11 2 11.5 2 12v4c0 .6.4 1 1 1h2" />
                  <circle cx="7" cy="17" r="2" />
                  <circle cx="17" cy="17" r="2" />
                </svg>
              ) : policyCategory === 'home' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              )
            }
          />

          {/* Service Card 2: Invoice & Ledger Audit */}
          <ServiceActionCard
            id="service-card-ledger"
            isDark={isDark}
            title="Invoice & Ledger Audit"
            description="Review billing charges, verify premium statements, and trigger payment reconciliations."
            actionLabel="Audit Ledger →"
            accentColor="#10b981"
            onClick={() => setActiveServiceModal('ledger')}
            icon={(
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            )}
          />

          {/* Service Card 3: Dispatch / TPA Desk (Dynamic by policy type) */}
          <ServiceActionCard
            id="service-card-surveyor"
            isDark={isDark}
            title={dispatchConfig.title}
            description={dispatchConfig.description}
            actionLabel={dispatchConfig.actionLabel}
            accentColor="#f59e0b"
            onClick={() => setActiveServiceModal('surveyor')}
            icon={(
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            )}
          />

          {/* Service Card 4: Download Policy Docs */}
          <ServiceActionCard
            id="service-card-download"
            isDark={isDark}
            title="Download Policy Docs"
            description="Retrieve certified digital policy documents, coverage terms, endorsements, and declarations."
            actionLabel="Download PDF ↓"
            accentColor="#8b5cf6"
            onClick={handleDownloadPolicyDocs}
            icon={(
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="12" y2="18" />
                <line x1="15" y1="15" x2="12" y2="18" />
              </svg>
            )}
          />
        </div>
      </main>

      {/* ── Toast Notification for Downloads ─────────────────────────────────── */}
      {downloadToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          background: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
          border: '1px solid #10b981',
          color: isDark ? '#f8fafc' : '#0f172a',
          padding: '12px 20px',
          borderRadius: '14px',
          boxShadow: '0 12px 36px rgba(0,0,0,0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 9999,
          animation: 'slide-up 0.25s ease',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{downloadToast}</span>
        </div>
      )}

      {/* ── Service Detail Quick Modal ────────────────────────────────────────── */}
      {activeServiceModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: isDark ? '#1e293b' : '#ffffff',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(226, 232, 240, 0.9)',
            borderRadius: '24px', padding: 28, maxWidth: 440, width: '100%',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
          }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 700 }}>
              {activeServiceModal === 'claims' && claimConfig.modalTitle}
              {activeServiceModal === 'ledger' && 'Invoice & Ledger Audit'}
              {activeServiceModal === 'surveyor' && dispatchConfig.modalTitle}
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.5 }}>
              {activeServiceModal === 'claims' && claimConfig.modalDesc}
              {activeServiceModal === 'ledger' && 'Our automated ledger auditor will review all historical line items and reconcile any billing disputes live with you on call.'}
              {activeServiceModal === 'surveyor' && dispatchConfig.modalDesc}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setActiveServiceModal(null)}
                style={{
                  padding: '9px 18px', borderRadius: '12px',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #e2e8f0',
                  background: 'transparent',
                  color: isDark ? '#cbd5e1' : '#64748b',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveServiceModal(null)
                  handleStartCall()
                }}
                style={{
                  padding: '9px 18px', borderRadius: '12px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)',
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.35)',
                }}
              >
                Start Voice Consultation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Conversation History Modal ──────────────────────────────────────── */}
      {showHistory && (
        <ConversationHistoryModal
          customerId={customer?.customer_id}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* ── Sign Out Confirmation Modal ──────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: 20,
        }}>
          <div style={{
            background: isDark ? '#1e293b' : '#ffffff',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
            borderRadius: '24px', padding: 28, maxWidth: 380, width: '100%',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 700 }}>
              Sign out of portal?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.5 }}>
              Are you sure you want to log out of your InsureAI account?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                style={{
                  padding: '9px 18px', borderRadius: '12px',
                  border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #e2e8f0',
                  background: 'transparent',
                  color: isDark ? '#cbd5e1' : '#64748b', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                id="confirm-portal-logout-btn"
                type="button"
                onClick={handleLogout}
                style={{
                  padding: '9px 18px', borderRadius: '12px',
                  border: 'none', background: '#ef4444', color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
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

/**
 * Service Action Card Component for Right Column
 */
function ServiceActionCard({
  id,
  isDark,
  title,
  description,
  actionLabel,
  icon,
  accentColor,
  onClick,
}: {
  id: string
  isDark: boolean
  title: string
  description: string
  actionLabel: string
  icon: React.ReactNode
  accentColor: string
  onClick: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <div
      id={id}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: isDark
          ? (isHovered ? 'rgba(30, 41, 59, 0.95)' : 'rgba(15, 23, 42, 0.82)')
          : (isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.9)'),
        backdropFilter: 'blur(16px)',
        border: isHovered
          ? `1px solid ${accentColor}`
          : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(226, 232, 240, 0.9)'),
        borderRadius: '18px',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        cursor: 'pointer',
        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: isHovered
          ? (isDark ? '0 10px 25px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(37, 99, 235, 0.12)')
          : (isDark ? '0 4px 14px rgba(0, 0, 0, 0.2)' : '0 2px 8px rgba(0, 0, 0, 0.03)'),
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        flex: 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: isDark ? 'rgba(255, 255, 255, 0.05)' : '#f0f6ff',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(219, 234, 254, 0.8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
            {title}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.45 }}>
        {description}
      </div>

      <div style={{
        marginTop: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        fontSize: 11.5,
        fontWeight: 700,
        color: isHovered ? accentColor : (isDark ? '#38bdf8' : '#2563eb'),
        transition: 'color 0.15s ease',
      }}>
        <span>{actionLabel}</span>
      </div>
    </div>
  )
}
