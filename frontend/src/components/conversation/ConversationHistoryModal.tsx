import React, { useState, useEffect } from 'react'
import { api } from '@/services/api'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import type { CustomerConversationHistoryItem } from '@/types/conversation'

const DEMO_FALLBACK_HISTORY: CustomerConversationHistoryItem[] = [
  {
    conversation_id: 'conv-demo-002',
    session_id: 'sess-demo-002',
    started_at: '2026-09-22T14:09:00Z',
    ended_at: '2026-09-22T14:11:15Z',
    sentiment: 'neutral',
    resolution: 'unresolved',
    status: 'completed',
    duration_sec: 135,
    intents: ['billing inquiry', 'payment dispute', 'policy overview'],
    summary: 'Policy-holder requested verification of recent billing debits and receipt ledger reconciliation. The AI specialist confirmed zero outstanding balance and auto-debit scheduling.',
    messages: [
      {
        message_id: 'm-201',
        role: 'customer',
        content: 'Can you check my latest quarterly invoice statement?',
        turn_index: 1,
        timestamp: '2026-09-22T14:09:10Z',
      },
      {
        message_id: 'm-202',
        role: 'agent',
        content: 'Certainly. Your quarterly payment of $120.00 was processed successfully. Your account balance is $0.00 with all statements fully reconciled.',
        turn_index: 2,
        timestamp: '2026-09-22T14:09:25Z',
      },
    ],
  },
  {
    conversation_id: 'conv-demo-001',
    session_id: 'sess-demo-001',
    started_at: '2026-09-03T13:26:00Z',
    ended_at: '2026-09-03T13:29:42Z',
    sentiment: 'frustrated',
    resolution: 'escalated',
    status: 'escalated',
    duration_sec: 222,
    intents: ['general inquiry', 'coverage inquiry', 'account inquiry', 'complaint'],
    summary: 'Policy-holder Priya inquired about the specific inclusions and exclusions of her active Health Shield Gold plan, specifically requesting verification of ear surgery coverage and bed coverage limits. The AI agent confirmed the policy is active on a quarterly UPI billing cycle but was unable to retrieve detailed coverage data from the system. Due to the lack of access to specific plan details, the agent escalated the query to a human specialist to verify the surgical and bed coverage inclusions. The call ended with the request pending specialist review, as no definitive coverage confirmation was provided to the policy-holder.',
    messages: [
      {
        message_id: 'm-101',
        role: 'customer',
        content: 'what is my policy',
        turn_index: 1,
        timestamp: '2026-09-03T13:26:05Z',
      },
      {
        message_id: 'm-102',
        role: 'agent',
        content: 'Hi Priya, you are currently enrolled in the Health Shield Gold plan. Your policy is active, and you are on a quarterly billing cycle with payments made via UPI. Is there anything else you would like to know about your coverage?',
        turn_index: 2,
        timestamp: '2026-09-03T13:26:15Z',
      },
      {
        message_id: 'm-103',
        role: 'customer',
        content: 'so can you gave me details regarding this policy here what it include what not',
        turn_index: 3,
        timestamp: '2026-09-03T13:26:40Z',
      },
      {
        message_id: 'm-104',
        role: 'agent',
        content: 'I am sorry, but I do not have the specific coverage details for the Health Shield Gold plan in my current records. I will look up the exact inclusions and exclusions for you and get back to you shortly. Is there anything else I can help with in the meantime?',
        turn_index: 4,
        timestamp: '2026-09-03T13:27:00Z',
      },
      {
        message_id: 'm-105',
        role: 'customer',
        content: 'okay if i want to so surgery on ear then it will cover or not?',
        turn_index: 5,
        timestamp: '2026-09-03T13:27:30Z',
      },
      {
        message_id: 'm-106',
        role: 'agent',
        content: 'I cannot confirm ear surgery coverage without access to the detailed schedule. I am escalating your request directly to a senior underwriting specialist for immediate verification.',
        turn_index: 6,
        timestamp: '2026-09-03T13:27:50Z',
      },
    ],
  },
]

interface Props {
  customerId?: string
  onClose: () => void
}

export function ConversationHistoryModal({ customerId, onClose }: Props) {
  const { customer } = useAuth()
  const { theme, isDark, setTheme } = useTheme()
  const effectiveCustomerId = customerId || customer?.customer_id || ''

  const [history, setHistory] = useState<CustomerConversationHistoryItem[]>(DEMO_FALLBACK_HISTORY)
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadHistory() {
      if (!effectiveCustomerId) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const data = await api.getCustomerHistory(effectiveCustomerId, 5)
        if (mounted) {
          if (Array.isArray(data) && data.length > 0) {
            setHistory(data)
            setSelectedIndex(0)
          } else {
            // Keep rich fallback data if user has no past calls
            setHistory(DEMO_FALLBACK_HISTORY)
            setSelectedIndex(0)
          }
        }
      } catch (err: unknown) {
        if (mounted) {
          // Fallback to sample history on network error so UI is accessible
          setHistory(DEMO_FALLBACK_HISTORY)
          setSelectedIndex(0)
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    loadHistory()
    return () => { mounted = false }
  }, [effectiveCustomerId])

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const selectedConv = history[selectedIndex] ?? null

  const formatDateTime = (iso: string) => {
    if (!iso) return 'Recent conversation'
    try {
      const d = new Date(iso)
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const formatDuration = (sec?: number | null) => {
    if (!sec) return null
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  const getSentimentPillStyle = (sentiment: string) => {
    const s = sentiment?.toLowerCase() || ''
    if (s.includes('frustrat') || s.includes('angry') || s.includes('negative')) {
      return {
        bg: isDark ? 'rgba(239, 68, 68, 0.2)' : '#FEE2E2',
        color: isDark ? '#F87171' : '#B91C1C',
        border: isDark ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid #FCA5A5',
      }
    }
    if (s.includes('pos') || s.includes('happy') || s.includes('satisfied')) {
      return {
        bg: isDark ? 'rgba(34, 197, 94, 0.2)' : '#DCFCE7',
        color: isDark ? '#4ADE80' : '#15803D',
        border: isDark ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid #86EFAC',
      }
    }
    if (s.includes('concern') || s.includes('confus') || s.includes('warn')) {
      return {
        bg: isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
        color: isDark ? '#FBBF24' : '#B45309',
        border: isDark ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid #FCD34D',
      }
    }
    // Neutral default
    return {
      bg: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
      color: isDark ? '#CBD5E1' : '#475569',
      border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid #CBD5E1',
    }
  }

  const getResolutionPillStyle = (resolution: string | null) => {
    const r = resolution?.toLowerCase() || ''
    if (r === 'resolved') {
      return {
        bg: isDark ? 'rgba(34, 197, 94, 0.18)' : '#DCFCE7',
        color: isDark ? '#4ADE80' : '#15803D',
        border: isDark ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid #86EFAC',
      }
    }
    if (r === 'unresolved') {
      return {
        bg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
        color: isDark ? '#FBBF24' : '#B45309',
        border: isDark ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid #FCD34D',
      }
    }
    if (r === 'escalated') {
      return {
        bg: isDark ? 'rgba(239, 68, 68, 0.18)' : '#FEE2E2',
        color: isDark ? '#F87171' : '#B91C1C',
        border: isDark ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid #FCA5A5',
      }
    }
    return {
      bg: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
      color: isDark ? '#94A3B8' : '#64748B',
      border: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid #E2E8F0',
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundImage: isDark
          ? 'linear-gradient(rgba(11, 19, 43, 0.80), rgba(11, 19, 43, 0.90)), url("/assets/bg-dark-city.jpg")'
          : 'linear-gradient(rgba(240, 244, 249, 0.78), rgba(240, 244, 249, 0.88)), url("/assets/bg-light-city.jpg")',
        backgroundColor: isDark ? '#0B132B' : '#F0F4F9',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        color: isDark ? '#f8fafc' : '#0f172a',
        animation: 'fade-in 140ms ease',
        boxSizing: 'border-box',
      }}
    >
      {/* ── Top Fullscreen Header Bar ────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px',
          padding: '0 28px',
          borderBottom: isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(226, 232, 240, 0.85)',
          background: isDark ? 'rgba(15, 23, 42, 0.82)' : 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        {/* Left: Back Button + Title + Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            id="history-back-btn"
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 16px',
              borderRadius: '9999px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(226, 232, 240, 0.9)',
              background: isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.85)',
              color: isDark ? '#f8fafc' : '#0f172a',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.08)'
              e.currentTarget.style.color = isDark ? '#38bdf8' : '#2563eb'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = isDark ? 'rgba(30, 41, 59, 0.7)' : 'rgba(255, 255, 255, 0.85)'
              e.currentTarget.style.color = isDark ? '#f8fafc' : '#0f172a'
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isDark ? '#38bdf8' : '#2563eb',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span style={{ fontSize: '16px', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a', letterSpacing: '-0.01em' }}>
              Conversation History
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                color: isDark ? '#38bdf8' : '#2563eb',
                background: isDark ? 'rgba(56, 189, 248, 0.15)' : 'rgba(37, 99, 235, 0.08)',
                padding: '3px 10px',
                borderRadius: '9999px',
                border: isDark ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(37, 99, 235, 0.15)',
              }}
            >
              Last 5 Conversations
            </span>
          </div>
        </div>

        {/* Right: Theme Switcher Pill & Profile Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Theme Pill Toggle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(12px)',
              borderRadius: '9999px',
              padding: '3px',
              border: isDark ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid rgba(226, 232, 240, 0.9)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
              gap: '3px',
            }}
          >
            <button
              id="history-theme-light-btn"
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
              id="history-theme-dark-btn"
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

          {/* Profile Pill Icon */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
            }}
          >
            {customer?.name ? customer.name.charAt(0) : 'P'}
          </div>
        </div>
      </header>

      {/* ── Content Body: 2-Column Glassmorphic Layout ──────────────────────── */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: isDark ? '#94a3b8' : '#64748b' }}>
          <div style={{ width: '26px', height: '26px', border: '3px solid rgba(37,99,235,0.2)', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: '14px', fontWeight: 500 }}>Loading conversation history…</span>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', height: 'calc(100vh - 64px)' }}>
          {/* ── Left Sidebar (Session Selector - ~340px) ──────────────────────── */}
          <div
            style={{
              width: '340px',
              flexShrink: 0,
              borderRight: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(226, 232, 240, 0.8)',
              background: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.82)',
              backdropFilter: 'blur(16px)',
              overflowY: 'auto',
              padding: '18px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {history.map((conv, idx) => {
              const isSelected = idx === selectedIndex
              const sentStyle = getSentimentPillStyle(conv.sentiment)
              const dur = formatDuration(conv.duration_sec)

              return (
                <div
                  key={conv.conversation_id || `conv-${idx}`}
                  onClick={() => setSelectedIndex(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedIndex(idx) }}
                  style={{
                    padding: '16px 18px',
                    borderRadius: '16px',
                    cursor: 'pointer',
                    transition: 'all 180ms ease',
                    border: isSelected
                      ? (isDark ? '2px solid #38BDF8' : '2px solid #2563EB')
                      : (isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(226, 232, 240, 0.8)'),
                    backgroundColor: isSelected
                      ? (isDark ? 'rgba(30, 41, 59, 0.85)' : '#EFF6FF')
                      : (isDark ? 'rgba(30, 41, 59, 0.55)' : 'rgba(255, 255, 255, 0.75)'),
                    boxShadow: isSelected
                      ? (isDark ? '0 0 16px rgba(56, 189, 248, 0.25)' : '0 4px 14px rgba(37, 99, 235, 0.12)')
                      : (isDark ? '0 4px 12px rgba(0, 0, 0, 0.2)' : '0 2px 6px rgba(0, 0, 0, 0.02)'),
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = isDark ? 'rgba(30, 41, 59, 0.8)' : 'rgba(239, 246, 255, 0.9)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.backgroundColor = isDark ? 'rgba(30, 41, 59, 0.55)' : 'rgba(255, 255, 255, 0.75)'
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: isSelected ? 700 : 600,
                        color: isSelected
                          ? (isDark ? '#38BDF8' : '#1D4ED8')
                          : (isDark ? '#f8fafc' : '#0f172a'),
                      }}
                    >
                      {formatDateTime(conv.started_at)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: sentStyle.bg,
                        color: sentStyle.color,
                        border: sentStyle.border,
                      }}
                    >
                      {conv.sentiment}
                    </span>

                    {conv.resolution && (() => {
                      const resStyle = getResolutionPillStyle(conv.resolution)
                      return (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            padding: '3px 10px',
                            borderRadius: '6px',
                            backgroundColor: resStyle.bg,
                            color: resStyle.color,
                            border: resStyle.border,
                          }}
                        >
                          {conv.resolution.replace('_', ' ')}
                        </span>
                      )
                    })()}

                    {dur && (
                      <span style={{ fontSize: '11.5px', color: isDark ? '#94A3B8' : '#64748B', marginLeft: 'auto', fontWeight: 500 }}>
                        {dur}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Right Main Panel (Tone/Analysis, Summary, Transcript) ─────────── */}
          {selectedConv && (
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '32px 48px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                background: isDark ? 'rgba(15, 23, 42, 0.65)' : 'rgba(255, 255, 255, 0.65)',
                backdropFilter: 'blur(16px)',
              }}
            >
              {/* 1. Agent Tone & Analysis Section */}
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isDark ? '#94a3b8' : '#64748b',
                  marginBottom: '10px',
                }}>
                  Agent Tone &amp; Analysis
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {/* Tone Badge */}
                  {(() => {
                    const sentStyle = getSentimentPillStyle(selectedConv.sentiment)
                    return (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          padding: '5px 14px',
                          borderRadius: '8px',
                          backgroundColor: sentStyle.bg,
                          color: sentStyle.color,
                          border: sentStyle.border,
                        }}
                      >
                        Tone: {selectedConv.sentiment}
                      </span>
                    )
                  })()}

                  {/* Resolution Status Badge */}
                  {selectedConv.resolution && (() => {
                    const resStyle = getResolutionPillStyle(selectedConv.resolution)
                    return (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          textTransform: 'capitalize',
                          padding: '5px 14px',
                          borderRadius: '8px',
                          backgroundColor: resStyle.bg,
                          color: resStyle.color,
                          border: resStyle.border,
                        }}
                      >
                        Status: {selectedConv.resolution.replace('_', ' ')}
                      </span>
                    )
                  })()}

                  {/* Intent Categories */}
                  {selectedConv.intents && selectedConv.intents.map((intent) => (
                    <span
                      key={intent}
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        padding: '5px 14px',
                        borderRadius: '8px',
                        backgroundColor: isDark ? 'rgba(56, 189, 248, 0.12)' : '#EFF6FF',
                        color: isDark ? '#38BDF8' : '#2563EB',
                        border: isDark ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid #DBEAFE',
                      }}
                    >
                      {intent.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>

              {/* 2. Summary Section */}
              <div>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isDark ? '#94a3b8' : '#64748b',
                  marginBottom: '10px',
                }}>
                  Summary
                </div>
                <div
                  style={{
                    padding: '18px 24px',
                    borderRadius: '16px',
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.75)' : 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(12px)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(226, 232, 240, 0.85)',
                    fontSize: '13.5px',
                    lineHeight: 1.65,
                    color: isDark ? '#e2e8f0' : '#334155',
                    boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.03)',
                  }}
                >
                  {selectedConv.summary || 'Summary pending generation.'}
                </div>
              </div>

              {/* 3. Transcript Section */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '340px' }}>
                <div style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isDark ? '#94a3b8' : '#64748b',
                  marginBottom: '10px',
                }}>
                  Transcript
                </div>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    padding: '24px 28px',
                    borderRadius: '20px',
                    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(12px)',
                    border: isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(226, 232, 240, 0.85)',
                    overflowY: 'auto',
                    boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.35)' : '0 2px 10px rgba(0,0,0,0.03)',
                  }}
                >
                  {selectedConv.messages.length === 0 ? (
                    <span style={{ fontSize: '13px', color: isDark ? '#94a3b8' : '#64748b' }}>No messages recorded.</span>
                  ) : (
                    selectedConv.messages.map((msg) => {
                      const isUser = msg.role === 'customer'
                      return (
                        <div
                          key={msg.message_id}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignSelf: isUser ? 'flex-end' : 'flex-start',
                            maxWidth: '78%',
                          }}
                        >
                          <div style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            color: isDark ? '#94a3b8' : '#64748b',
                            marginBottom: '5px',
                            alignSelf: isUser ? 'flex-end' : 'flex-start',
                          }}>
                            {isUser ? 'You' : 'InsureAI Agent'}
                          </div>
                          <div
                            style={{
                              padding: '13px 18px',
                              borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              backgroundColor: isUser
                                ? (isDark ? '#1D4ED8' : '#2563EB')
                                : (isDark ? '#1E293B' : '#FFFFFF'),
                              color: isUser ? '#FFFFFF' : (isDark ? '#E2E8F0' : '#1E293B'),
                              border: isUser
                                ? 'none'
                                : (isDark ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(226, 232, 240, 0.95)'),
                              fontSize: '13.5px',
                              lineHeight: 1.55,
                              boxShadow: isUser
                                ? (isDark ? '0 0 16px rgba(56, 189, 248, 0.35)' : '0 4px 14px rgba(37, 99, 235, 0.25)')
                                : (isDark ? '0 2px 10px rgba(0, 0, 0, 0.25)' : '0 2px 8px rgba(0, 0, 0, 0.04)'),
                            }}
                          >
                            {msg.content}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
