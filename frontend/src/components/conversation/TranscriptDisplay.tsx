import React, { useEffect, useRef } from 'react'
import { useConversationStore } from '@/store/conversation'

export function TranscriptDisplay() {
  const messages = useConversationStore((s) => s.messages)
  const partialTranscript = useConversationStore((s) => s.partialTranscript)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, partialTranscript])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Header bar */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Live Transcript
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {messages.length} turn{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Scrollable messages area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}>
        {messages.length === 0 && !partialTranscript && (
          <div style={{
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 12,
          }}>
            <div style={{ fontSize: 36, opacity: 0.15 }}>💬</div>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Transcript will appear here as the conversation progresses…
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.message_id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'customer' ? 'flex-end' : 'flex-start',
              animation: 'slide-up 0.3s ease',
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 600,
              color: msg.role === 'customer' ? 'var(--accent-primary)' : 'var(--accent-blue)',
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5,
            }}>
              {msg.role === 'customer' ? 'You' : 'AI Agent'}
            </span>
            <div style={{
              maxWidth: '72%',
              padding: '11px 16px',
              borderRadius: msg.role === 'customer'
                ? '18px 4px 18px 18px'
                : '4px 18px 18px 18px',
              background: msg.role === 'customer'
                ? 'linear-gradient(135deg, rgba(15,118,110,0.12), rgba(13,95,88,0.08))'
                : 'rgba(59, 130, 246, 0.08)',
              border: `1px solid ${msg.role === 'customer' ? 'rgba(15,118,110,0.2)' : 'rgba(59,130,246,0.15)'}`,
              fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.55,
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              {msg.content}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {/* Partial speech-to-text indicator */}
        {partialTranscript && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-primary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
              You
            </span>
            <div style={{
              maxWidth: '72%', padding: '11px 16px',
              borderRadius: '18px 4px 18px 18px',
              background: 'rgba(15,118,110,0.05)',
              border: '1px dashed rgba(15,118,110,0.3)',
              fontSize: 14, color: 'var(--text-secondary)', fontStyle: 'italic',
            }}>
              {partialTranscript}
              <span style={{ animation: 'blink 1s step-end infinite', marginLeft: 2 }}>|</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
