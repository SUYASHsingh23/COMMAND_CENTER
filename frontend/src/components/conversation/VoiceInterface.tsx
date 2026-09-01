import React, { useState, useCallback } from 'react'
import { useConversation } from '@/hooks/useConversation'
import { useWebRTC } from '@/hooks/useWebRTC'
import { useEventStream } from '@/hooks/useEventStream'
import { StatusIndicator } from '@/components/shared/StatusIndicator'
import { SentimentBadge } from '@/components/shared/SentimentBadge'
import { TranscriptDisplay } from './TranscriptDisplay'
import { useConversationStore } from '@/store/conversation'
import { useAuth } from '@/contexts/AuthContext'

export function VoiceInterface() {
  const { session, sentiment, currentIntents, startSession, endSession } = useConversation()
  const { customer } = useAuth()
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN')

  const onAgentAudio = useCallback((isPlaying: boolean) => {
    setIsAgentSpeaking(isPlaying)
  }, [])

  const {
    isConnecting,
    isConnected: wsConnected,
    isSpeaking,
    connect,
    disconnect,
    startSpeaking,
    stopSpeaking,
    sendText,
    error,
  } = useWebRTC({ onAgentAudioStateChange: onAgentAudio })

  useEventStream(session?.session_id ?? null)

  async function handleStart() {
    // Pass the logged-in customer's ID so the agent can pre-fetch their profile
    const sess = await startSession(customer?.customer_id ?? undefined)
    if (sess?.session_id) {
      await connect(sess.session_id)
    }
  }

  async function handleEnd() {
    disconnect()
    await endSession()
    setIsAgentSpeaking(false)
  }

  function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    if (!textInput.trim()) return
    sendText(textInput)
    setTextInput('')
  }

  const connectionStatus = isConnecting
    ? 'connecting'
    : wsConnected
    ? 'connected'
    : error
    ? 'error'
    : 'disconnected'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--bg-primary)',
      fontFamily: 'var(--font-sans)',
    }}>
      {/* ── Compact header bar ─────────────────────────────────────────── */}
      <div style={{
        textAlign: 'center',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
        animation: 'fade-in 0.4s ease',
      }}>
        <div style={{
          fontSize: 11,
          color: 'var(--accent-primary)',
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}>
          InsureAI
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          AI Claims &amp; Policy Agent
        </h1>
      </div>

      {/* ── Pre-call: centred start screen ──────────────────────────────── */}
      {!wsConnected ? (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          padding: 24,
          overflowY: 'auto',
        }}>
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-xl)',
            padding: '36px 44px',
            width: '100%',
            maxWidth: 380,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 20,
            boxShadow: 'var(--shadow-md)',
          }}>
            <StatusIndicator status={connectionStatus} />

            {/* Start / connecting button */}
            <button
              id="start-call-btn"
              onClick={handleStart}
              disabled={isConnecting}
              style={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                border: 'none',
                cursor: isConnecting ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #0f766e, #0d5f58)',
                boxShadow: '0 0 28px rgba(15,118,110,0.28), var(--shadow-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: isConnecting ? 0.6 : 1,
                transition: 'all var(--transition-base)',
              }}
            >
              {isConnecting ? <Spinner /> : <MicIcon />}
            </button>

            <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500, textAlign: 'center' }}>
              {isConnecting ? 'Connecting…' : 'Tap to start call'}
            </span>

            {error && (
              <div style={{
                width: '100%',
                padding: '10px 14px',
                background: 'rgba(192,57,43,0.08)',
                border: '1px solid rgba(192,57,43,0.22)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-red)',
                fontSize: 13,
                textAlign: 'center',
              }}>
                {error}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Active call: two-pane layout ──────────────────────────────── */
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Left panel — call controls */}
          <div style={{
            width: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            padding: '18px 16px',
            overflowY: 'auto',
            borderRight: '1px solid var(--border-subtle)',
            background: 'var(--bg-secondary)',
          }}>
            {/* Status + sentiment */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
              <StatusIndicator status={connectionStatus} />
              <SentimentBadge sentiment={sentiment} />
            </div>

            {/* Agent speaking indicator */}
            {isAgentSpeaking && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 'var(--radius-full)',
                animation: 'fade-in 0.2s ease',
              }}>
                <AgentWave />
                <span style={{ fontSize: 12, color: 'var(--accent-green)', fontWeight: 500 }}>
                  Agent responding…
                </span>
              </div>
            )}

            {/* PTT button (compact) */}
            <PTTButton isSpeaking={isSpeaking} onStart={startSpeaking} onStop={stopSpeaking} />

            {/* Chat Input */}
            <form onSubmit={handleSendText} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <select 
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                style={{
                  padding: '6px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                }}
              >
                <option value="en-IN">English (India)</option>
                <option value="hi-IN">Hindi</option>
                <option value="te-IN">Telugu</option>
                <option value="ta-IN">Tamil</option>
                <option value="kn-IN">Kannada</option>
                <option value="ml-IN">Malayalam</option>
              </select>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                  }}
                />
                <button
                  type="submit"
                  disabled={!textInput.trim()}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: 'none',
                    background: textInput.trim() ? 'var(--accent-primary)' : 'var(--border-subtle)',
                    color: textInput.trim() ? 'white' : 'var(--text-muted)',
                    cursor: textInput.trim() ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Send
                </button>
              </div>
            </form>

            {/* End call button */}
            <button
              id="end-call-btn"
              onClick={handleEnd}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                boxShadow: '0 0 16px rgba(239,68,68,0.2)',
                color: 'white',
                fontSize: 13,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all var(--transition-base)',
              }}
            >
              <PhoneOffIcon />
              End Call
            </button>

            {/* Session info */}
            {session && (
              <div style={{
                padding: '10px 12px',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  SESSION
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {session.session_id}
                </div>
              </div>
            )}

            {/* Intent pills */}
            {currentIntents.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {currentIntents.map((intent) => (
                  <span key={intent} className="badge badge--purple" style={{ fontSize: 10 }}>
                    {intent.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 12px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--accent-red)',
                fontSize: 12,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* Right panel — live transcript */}
          <div style={{
            flex: 1,
            padding: 20,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <TranscriptDisplay />
          </div>
        </div>
      )}
    </div>
  )
}


// ── Sub-components ────────────────────────────────────────────────────────────

interface PTTButtonProps {
  isSpeaking: boolean
  onStart: () => void
  onStop: () => void
}

function PTTButton({ isSpeaking, onStart, onStop }: PTTButtonProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button
        id="ptt-btn"
        onMouseDown={onStart}
        onMouseUp={onStop}
        onMouseLeave={onStop}
        onTouchStart={(e) => { e.preventDefault(); onStart() }}
        onTouchEnd={(e) => { e.preventDefault(); onStop() }}
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          border: `3px solid ${isSpeaking ? 'rgba(21,128,61,0.7)' : 'rgba(15,118,110,0.35)'}`,
          cursor: 'pointer',
          background: isSpeaking
            ? 'linear-gradient(135deg, rgba(21,128,61,0.15), rgba(4,120,87,0.25))'
            : 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(13,95,88,0.12))',
          boxShadow: isSpeaking
            ? '0 0 30px rgba(21,128,61,0.35), inset 0 0 15px rgba(21,128,61,0.08)'
            : '0 0 15px rgba(15,118,110,0.15)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          transition: 'all 0.15s ease',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transform: isSpeaking ? 'scale(1.05)' : 'scale(1)',
        }}
      >
        {isSpeaking ? <WaveIcon /> : <MicLargeIcon />}
      </button>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: isSpeaking ? 'var(--accent-green)' : 'var(--text-muted)',
        transition: 'color 0.15s ease',
      }}>
        {isSpeaking ? '● Recording…' : 'Hold to Speak'}
      </div>
    </div>
  )
}

function AgentWave() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {[0.4, 0.7, 1.0, 0.7, 0.4].map((h, i) => (
        <div key={i} style={{
          width: 3,
          height: 14 * h,
          background: 'var(--accent-green)',
          borderRadius: 2,
          animation: `blink ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  )
}

function WaveIcon() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {[6, 12, 20, 14, 8, 16, 10].map((h, i) => (
        <div key={i} style={{
          width: 4,
          height: h,
          background: 'var(--accent-green)',
          borderRadius: 2,
          animation: `blink ${0.4 + (i % 3) * 0.15}s ease-in-out infinite alternate`,
          animationDelay: `${i * 0.07}s`,
        }} />
      ))}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
}

function MicLargeIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="rgba(15,118,110,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
}

function PhoneOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.32 9.69 19.73 19.73 0 0 1 1.27 1 2 2 0 0 1 3.27-1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.25 7.77a16 16 0 0 0 3.43 5.54z"/>
      <line x1="23" y1="1" x2="1" y2="23"/>
    </svg>
  )
}

function Spinner() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
      </path>
    </svg>
  )
}
