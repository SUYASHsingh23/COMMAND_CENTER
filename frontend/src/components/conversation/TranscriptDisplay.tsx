import React, { useEffect, useRef, useState } from 'react'
import { useConversationStore } from '@/store/conversation'

export function TranscriptDisplay() {
  const messages = useConversationStore((s) => s.messages)
  const partialTranscript = useConversationStore((s) => s.partialTranscript)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, partialTranscript])

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* ── Background Vector Art: Isometric Grid & Flowing Cyan Wave ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        opacity: 0.85,
      }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 700"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            <linearGradient id="waveGradientLight" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.2" />
              <stop offset="50%" stopColor="#14b8a6" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="waveGradientDark" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
              <stop offset="50%" stopColor="#34d399" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.6" />
            </linearGradient>
            <linearGradient id="waveFillGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
            </linearGradient>
            <filter id="waveGlow" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 3D Isometric Blueprint Buildings & Grid Wireframe */}
          <g stroke="currentColor" strokeWidth="0.8" opacity="0.12" style={{ color: 'var(--accent-primary)' }}>
            {/* Perspective Floor Grid */}
            <path d="M 0,350 L 500,600 L 1000,350 L 500,100 Z" strokeDasharray="3 3" />
            <path d="M 100,300 L 500,500 L 900,300" strokeDasharray="2 2" />
            <path d="M 200,250 L 500,400 L 800,250" strokeDasharray="2 2" />
            <path d="M 500,100 L 500,600" />
            
            {/* Wireframe Tower Left */}
            <path d="M 250,450 L 250,220 L 330,170 L 410,220 L 410,450 L 330,500 Z" />
            <path d="M 330,170 L 330,500" />
            <path d="M 250,280 L 330,330 L 410,280" />
            <path d="M 250,340 L 330,390 L 410,340" />
            <path d="M 250,400 L 330,450 L 410,400" />

            {/* Wireframe Tower Center-Right */}
            <path d="M 480,420 L 480,180 L 580,120 L 680,180 L 680,420 L 580,480 Z" />
            <path d="M 580,120 L 580,480" />
            <path d="M 480,240 L 580,300 L 680,240" />
            <path d="M 480,300 L 580,360 L 680,300" />
            <path d="M 480,360 L 580,420 L 680,360" />

            {/* Wireframe Tower Far Right */}
            <path d="M 720,440 L 720,260 L 800,210 L 880,260 L 880,440 L 800,490 Z" />
            <path d="M 800,210 L 800,490" />
            <path d="M 720,320 L 800,370 L 880,320" />
            <path d="M 720,380 L 800,430 L 880,380" />
          </g>

          {/* Dynamic Flowing Sine Wave Lines across the chat area */}
          <path
            d="M 0,330 C 180,350 280,420 440,390 C 600,360 700,280 820,320 C 920,350 970,390 1000,370 L 1000,700 L 0,700 Z"
            fill="url(#waveFillGrad)"
          />
          <path
            d="M 0,340 C 180,360 280,430 440,400 C 600,370 700,290 820,330 C 920,360 970,400 1000,380"
            fill="none"
            stroke="url(#waveGradientLight)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            opacity="0.6"
          />
          <path
            d="M 0,330 C 180,350 280,420 440,390 C 600,360 700,280 820,320 C 920,350 970,390 1000,370"
            fill="none"
            stroke="url(#waveGradientLight)"
            strokeWidth="3.2"
            strokeLinecap="round"
            filter="url(#waveGlow)"
          />
        </svg>
      </div>

      {/* ── Top Header Strip ────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'transparent',
        zIndex: 1,
      }}>
        <span style={{
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--text-secondary)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Live Transcript
        </span>
        <span style={{
          fontSize: 11.5,
          fontWeight: 600,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}>
          {messages.length} turn{messages.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Scrollable Messages Area ───────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px 32px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
        position: 'relative',
        zIndex: 1,
      }}>
        {messages.length === 0 && !partialTranscript && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
            opacity: 0.8,
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'rgba(37, 99, 235, 0.1)',
              color: 'var(--accent-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13.5, maxWidth: 360, lineHeight: 1.5 }}>
              Voice and text conversation will stream here in real time…
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === 'customer'
          const formattedTime = msg.timestamp
            ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : ''

          return (
            <div
              key={msg.message_id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
                maxWidth: '100%',
                animation: 'slide-up 0.25s ease',
              }}
            >
              {/* Role label header */}
              <span style={{
                fontSize: 10,
                fontWeight: 800,
                color: 'var(--text-muted)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: 6,
                paddingRight: isUser ? 4 : 0,
                paddingLeft: isUser ? 0 : 4,
              }}>
                {isUser ? 'YOU' : 'AI AGENT'}
              </span>

              {/* Chat Bubble Container */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                maxWidth: '82%',
                flexDirection: isUser ? 'row-reverse' : 'row',
              }}>
                <div style={{
                  padding: isUser ? '12px 20px' : '15px 22px',
                  borderRadius: isUser ? '16px 16px 4px 16px' : '14px 14px 14px 4px',
                  background: isUser
                    ? 'var(--user-bubble-bg, rgba(219, 234, 254, 0.95))'
                    : 'var(--agent-bubble-bg, #1e293b)',
                  color: isUser
                    ? 'var(--user-bubble-text, #0f172a)'
                    : 'var(--agent-bubble-text, #ffffff)',
                  border: isUser
                    ? '1px solid var(--user-bubble-border, rgba(147, 197, 253, 0.8))'
                    : '1px solid var(--agent-bubble-border, rgba(255, 255, 255, 0.08))',
                  fontSize: 14,
                  lineHeight: 1.55,
                  boxShadow: isUser
                    ? '0 4px 14px rgba(37, 99, 235, 0.08)'
                    : '0 6px 18px rgba(0, 0, 0, 0.18)',
                  backdropFilter: 'blur(12px)',
                  wordBreak: 'break-word',
                  position: 'relative',
                }}>
                  {msg.content}
                </div>

                {/* Quick Copy Button on AI messages */}
                {!isUser && (
                  <button
                    type="button"
                    onClick={() => handleCopy(msg.message_id, msg.content)}
                    title={copiedId === msg.message_id ? 'Copied to clipboard!' : 'Copy response'}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: 8,
                      padding: '7px 8px',
                      cursor: 'pointer',
                      color: copiedId === msg.message_id ? '#34d399' : '#94a3b8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                      flexShrink: 0,
                    }}
                  >
                    {copiedId === msg.message_id ? (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                )}
              </div>

              {/* Timestamp label */}
              {formattedTime && (
                <span style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  marginTop: 5,
                  paddingRight: isUser ? 4 : 0,
                  paddingLeft: isUser ? 0 : 4,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {formattedTime}
                </span>
              )}
            </div>
          )
        })}

        {/* Partial speech-to-text indicator */}
        {partialTranscript && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            animation: 'fade-in 0.15s ease',
          }}>
            <span style={{
              fontSize: 10,
              fontWeight: 800,
              color: 'var(--accent-primary)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 6,
              paddingRight: 4,
            }}>
              YOU (SPEAKING…)
            </span>
            <div style={{
              maxWidth: '82%',
              padding: '12px 20px',
              borderRadius: '16px 16px 4px 16px',
              background: 'rgba(219, 234, 254, 0.65)',
              border: '1px dashed rgba(37, 99, 235, 0.4)',
              color: '#0f172a',
              fontSize: 14,
              fontStyle: 'italic',
              lineHeight: 1.55,
              backdropFilter: 'blur(8px)',
            }}>
              {partialTranscript}
              <span style={{ animation: 'blink 0.8s step-end infinite', marginLeft: 3, fontWeight: 700, color: 'var(--accent-primary)' }}>|</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
