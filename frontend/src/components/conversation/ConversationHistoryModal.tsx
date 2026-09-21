import React, { useState, useEffect } from 'react'
import { api } from '@/services/api'
import type { CustomerConversationHistoryItem } from '@/types/conversation'

interface Props {
  customerId: string
  onClose: () => void
}

export function ConversationHistoryModal({ customerId, onClose }: Props) {
  const [history, setHistory] = useState<CustomerConversationHistoryItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function loadHistory() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await api.getCustomerHistory(customerId, 5)
        if (mounted) {
          setHistory(data)
          if (data.length > 0) setSelectedIndex(0)
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load conversation history')
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }
    loadHistory()
    return () => { mounted = false }
  }, [customerId])

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

  const getSentimentStyle = (sentiment: string) => {
    switch (sentiment?.toLowerCase()) {
      case 'positive':
        return { bg: 'rgba(16, 185, 129, 0.12)', color: '#065f46', border: 'rgba(16, 185, 129, 0.25)' }
      case 'frustrated':
      case 'angry':
        return { bg: 'rgba(239, 68, 68, 0.12)', color: '#991b1b', border: 'rgba(239, 68, 68, 0.25)' }
      default:
        return { bg: 'rgba(107, 114, 128, 0.12)', color: '#374151', border: 'rgba(107, 114, 128, 0.22)' }
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: '#ffffff',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fade-in 140ms ease',
      }}
    >
      {/* Top Fullscreen Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 28px',
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: '#ffffff',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.03)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Back</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: 'rgba(15, 118, 110, 0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary)',
              }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Conversation History
            </span>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--accent-primary)',
                background: 'rgba(15, 118, 110, 0.10)',
                padding: '2px 9px',
                borderRadius: '12px',
              }}
            >
              Last 5 Conversations
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '6px',
            lineHeight: 1,
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.05)' }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
        >
          ✕
        </button>
      </div>

      {/* Content Body */}
      {isLoading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)' }}>
          <div style={{ width: '22px', height: '22px', border: '2px solid rgba(15,118,110,0.2)', borderTopColor: '#0f766e', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: '14px' }}>Loading conversation history…</span>
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', color: 'var(--accent-red)', fontSize: '14px' }}>
          {error}
        </div>
      ) : history.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          No previous conversations recorded.
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Column: 5 Recent Conversations List */}
          <div
            style={{
              width: '360px',
              flexShrink: 0,
              borderRight: '1px solid var(--border-subtle)',
              backgroundColor: '#faf9f7',
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {history.map((conv, idx) => {
              const isSelected = idx === selectedIndex
              const sentStyle = getSentimentStyle(conv.sentiment)
              const dur = formatDuration(conv.duration_sec)

              return (
                <div
                  key={conv.conversation_id}
                  onClick={() => setSelectedIndex(idx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedIndex(idx) }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    backgroundColor: isSelected ? 'rgba(15, 118, 110, 0.08)' : '#ffffff',
                    boxShadow: isSelected ? '0 2px 10px rgba(15, 118, 110, 0.14)' : '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(15, 118, 110, 0.04)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#ffffff'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13.5px', fontWeight: 600, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                      {formatDateTime(conv.started_at)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        backgroundColor: sentStyle.bg,
                        color: sentStyle.color,
                        border: `1px solid ${sentStyle.border}`,
                      }}
                    >
                      {conv.sentiment}
                    </span>

                    {conv.resolution && (
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(0,0,0,0.04)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {conv.resolution.replace('_', ' ')}
                      </span>
                    )}

                    {dur && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {dur}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right Column: Detail Inspector */}
          {selectedConv && (
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '28px 48px',
                display: 'flex',
                flexDirection: 'column',
                gap: '24px',
                backgroundColor: '#ffffff',
              }}
            >
              {/* Tone & Sentiment Analysis */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Agent Tone &amp; Analysis
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {(() => {
                    const sentStyle = getSentimentStyle(selectedConv.sentiment)
                    return (
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          textTransform: 'capitalize',
                          padding: '4px 12px',
                          borderRadius: '8px',
                          backgroundColor: sentStyle.bg,
                          color: sentStyle.color,
                          border: `1px solid ${sentStyle.border}`,
                        }}
                      >
                        Tone: {selectedConv.sentiment}
                      </span>
                    )
                  })()}

                  {selectedConv.intents && selectedConv.intents.map((intent) => (
                    <span
                      key={intent}
                      style={{
                        fontSize: '12px',
                        fontWeight: 500,
                        padding: '4px 10px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(15, 118, 110, 0.08)',
                        color: 'var(--accent-primary)',
                      }}
                    >
                      {intent.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Summary
                </div>
                <div
                  style={{
                    padding: '16px 20px',
                    borderRadius: '12px',
                    backgroundColor: '#faf9f7',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedConv.summary || 'Summary pending generation.'}
                </div>
              </div>

              {/* Transcript */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '360px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  Transcript
                </div>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '20px',
                    borderRadius: '12px',
                    backgroundColor: '#fbfbfa',
                    border: '1px solid var(--border-subtle)',
                    overflowY: 'auto',
                  }}
                >
                  {selectedConv.messages.length === 0 ? (
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No messages recorded.</span>
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
                            maxWidth: '80%',
                          }}
                        >
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px', alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
                            {isUser ? 'You' : 'InsureAI Agent'}
                          </div>
                          <div
                            style={{
                              padding: '12px 16px',
                              borderRadius: isUser ? '16px 16px 3px 16px' : '16px 16px 16px 3px',
                              backgroundColor: isUser ? 'var(--accent-primary)' : '#ffffff',
                              color: isUser ? '#ffffff' : 'var(--text-primary)',
                              border: isUser ? 'none' : '1px solid var(--border)',
                              fontSize: '13.5px',
                              lineHeight: 1.5,
                              boxShadow: isUser ? '0 2px 8px rgba(15, 118, 110, 0.22)' : '0 1px 4px rgba(0,0,0,0.04)',
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
