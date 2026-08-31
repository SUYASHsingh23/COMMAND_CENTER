import React, { useEffect, useRef } from 'react'
import type { SupervisorSession } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

export function ConversationMonitor({ session }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [session.messages, session.partial_transcript])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Live Transcript
        </span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SentimentPill sentiment={session.sentiment} urgency={session.urgency} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {session.messages.length} turns
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {session.messages.length === 0 && !session.partial_transcript && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, paddingTop: 32 }}>
            Transcript will appear as the conversation progresses…
          </div>
        )}

        {session.messages.map((msg, i) => (
          <div key={msg.message_id ?? i} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: msg.role === 'customer' ? 'flex-start' : 'flex-end',
            animation: 'slide-up 0.2s ease',
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              color: msg.role === 'customer' ? 'var(--accent-blue)' : 'var(--accent-green)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 3,
            }}>
              {msg.role === 'customer' ? '👤 Customer' : '🤖 AI Agent'}
            </span>
            <div style={{
              maxWidth: '78%',
              padding: '9px 13px',
              borderRadius: msg.role === 'customer' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
              background: msg.role === 'customer' ? 'rgba(59,130,246,0.07)' : 'rgba(16,185,129,0.07)',
              border: `1px solid ${msg.role === 'customer' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)'}`,
              fontSize: 13,
              color: 'var(--text-primary)',
              lineHeight: 1.6,
            }}>
              {msg.content}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {session.partial_transcript && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-blue)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>
              👤 Customer (speaking…)
            </span>
            <div style={{
              maxWidth: '78%',
              padding: '9px 13px',
              borderRadius: '4px 14px 14px 14px',
              background: 'rgba(59,130,246,0.03)',
              border: '1px dashed rgba(59,130,246,0.3)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
            }}>
              {session.partial_transcript}
              <span style={{ animation: 'blink 1s step-end infinite', marginLeft: 2 }}>|</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {session.intents.length > 0 && (
        <div style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          flexShrink: 0,
          background: 'var(--bg-card)',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 4, alignSelf: 'center' }}>Intents:</span>
          {session.intents.map((intent) => (
            <span key={intent} className="badge badge--purple" style={{ fontSize: 10 }}>
              {intent.replace(/_/g, ' ')}
            </span>
          ))}
          {Object.entries(session.entities ?? {}).slice(0, 3).map(([k, v]) => (
            <span key={k} style={{
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 4,
              background: 'rgba(251,191,36,0.12)',
              color: 'var(--accent-amber)',
              border: '1px solid rgba(251,191,36,0.25)',
              fontFamily: 'var(--font-mono)',
            }}>
              {k}={v}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function SentimentPill({ sentiment, urgency }: { sentiment: string; urgency: string }) {
  const sentimentColors: Record<string, string> = {
    positive: 'var(--accent-green)',
    neutral: 'var(--accent-blue)',
    frustrated: 'var(--accent-amber)',
    angry: 'var(--accent-red)',
  }
  const urgencyColors: Record<string, string> = {
    low: 'var(--text-muted)',
    medium: 'var(--accent-blue)',
    high: 'var(--accent-amber)',
  }
  const color = sentimentColors[sentiment] ?? 'var(--accent-blue)'
  const uColor = urgencyColors[urgency] ?? 'var(--accent-blue)'

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <span style={{
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${color}40`,
        color,
        fontWeight: 600,
        textTransform: 'capitalize',
      }}>
        {sentiment}
      </span>
      <span style={{
        fontSize: 10,
        padding: '2px 7px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${uColor}30`,
        color: uColor,
        fontWeight: 600,
        textTransform: 'capitalize',
      }}>
        {urgency}
      </span>
    </div>
  )
}
