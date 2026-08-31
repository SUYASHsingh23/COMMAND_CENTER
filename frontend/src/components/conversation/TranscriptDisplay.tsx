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
      width: '100%',
      maxWidth: 720,
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Live Transcript
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {messages.length} turn{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxHeight: 360,
        overflowY: 'auto',
        minHeight: 120,
      }}>
        {messages.length === 0 && !partialTranscript && (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
            paddingTop: 24,
          }}>
            Transcript will appear here…
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.message_id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'customer' ? 'flex-start' : 'flex-end',
              animation: 'slide-up 0.3s ease',
            }}
          >
            <span style={{
              fontSize: 10,
              fontWeight: 600,
              color: msg.role === 'customer' ? 'var(--accent-blue)' : 'var(--accent-green)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              {msg.role === 'customer' ? 'Customer' : 'AI Agent'}
            </span>
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: msg.role === 'customer'
                ? '4px 14px 14px 14px'
                : '14px 4px 14px 14px',
              background: msg.role === 'customer'
                ? 'rgba(59, 130, 246, 0.1)'
                : 'rgba(16, 185, 129, 0.1)',
              border: `1px solid ${msg.role === 'customer' ? 'rgba(59,130,246,0.2)' : 'rgba(16,185,129,0.2)'}`,
              fontSize: 14,
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}>
              {msg.content}
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}

        {partialTranscript && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-blue)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
              Customer
            </span>
            <div style={{
              maxWidth: '75%',
              padding: '10px 14px',
              borderRadius: '4px 14px 14px 14px',
              background: 'rgba(59, 130, 246, 0.05)',
              border: '1px dashed rgba(59,130,246,0.3)',
              fontSize: 14,
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
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
