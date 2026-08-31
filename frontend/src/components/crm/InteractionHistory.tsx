import React from 'react'

interface Interaction {
  interaction_id: string
  conversation_id?: string | null
  channel: string
  direction: string
  duration_sec: number
  outcome: string
  sentiment: string
  resolution: string
  summary?: string | null
  started_at: string
}

interface Props {
  interactions: Interaction[]
}

const SENTIMENT_COLOR: Record<string, string> = {
  positive:   'var(--accent-green)',
  neutral:    'var(--accent-blue)',
  frustrated: 'var(--accent-amber)',
  angry:      'var(--accent-red)',
}

const RESOLUTION_ICON: Record<string, string> = {
  resolved:           '✅',
  partially_resolved: '⚠️',
  unresolved:         '❌',
  escalated:          '🚨',
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function localDate(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const CHANNEL_ICON: Record<string, string> = {
  voice: '📞',
  chat:  '💬',
  email: '📧',
  ticket:'🎫',
}

export function InteractionHistory({ interactions }: Props) {
  if (interactions.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '24px 0' }}>
        No interaction history yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {interactions.map(ix => {
        const sentColor = SENTIMENT_COLOR[ix.sentiment] ?? 'var(--accent-blue)'
        const resIcon = RESOLUTION_ICON[ix.resolution] ?? '•'
        const channelIcon = CHANNEL_ICON[ix.channel] ?? '📞'

        return (
          <div key={ix.interaction_id} style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            animation: 'slide-up 0.2s ease',
          }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14 }}>{channelIcon}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>
                {ix.channel} · {ix.direction}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {localDate(ix.started_at)}
              </span>
            </div>

            {/* Chips row */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: ix.summary ? 8 : 0 }}>
              {/* Sentiment */}
              <span style={{
                fontSize: 10, fontWeight: 700,
                padding: '1px 7px',
                borderRadius: 'var(--radius-full)',
                background: `${sentColor}18`,
                color: sentColor,
                border: `1px solid ${sentColor}30`,
                textTransform: 'capitalize',
              }}>
                {ix.sentiment}
              </span>

              {/* Duration */}
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                ⏱ {fmt(ix.duration_sec)}
              </span>

              {/* Resolution */}
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {resIcon} {ix.resolution.replace(/_/g, ' ')}
              </span>

              {/* Supervisor link */}
              {ix.conversation_id && (
                <a
                  href={`/supervisor`}
                  style={{
                    marginLeft: 'auto',
                    fontSize: 10,
                    color: 'var(--accent-blue)',
                    fontWeight: 600,
                    textDecoration: 'none',
                  }}
                >
                  View in Supervisor →
                </a>
              )}
            </div>

            {/* Summary */}
            {ix.summary && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
                {ix.summary}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
