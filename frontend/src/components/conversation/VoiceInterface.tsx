import React, { useState, useCallback, useRef, useEffect } from "react"
import { useConversation } from "@/hooks/useConversation"
import { useWebRTC } from "@/hooks/useWebRTC"
import { useEventStream } from "@/hooks/useEventStream"
import { StatusIndicator } from "@/components/shared/StatusIndicator"
import { SentimentBadge } from "@/components/shared/SentimentBadge"
import { TranscriptDisplay } from "./TranscriptDisplay"
import { DiagnosticTracePanel } from "./DiagnosticTracePanel"
import { ConversationHistoryModal } from "./ConversationHistoryModal"
import { useConversationStore } from "@/store/conversation"
import { useAuth } from "@/contexts/AuthContext"

export function VoiceInterface() {
  const { session, sentiment, currentIntents, startSession, endSession } = useConversation()
  const { customer, logout } = useAuth()
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [textInput, setTextInput] = useState("")
  const [selectedLanguage, setSelectedLanguage] = useState("en-IN")
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [isTraceOpen, setIsTraceOpen] = useState(true)
  const [traceWidth, setTraceWidth] = useState(380)
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = traceWidth

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX
      const newWidth = Math.min(Math.max(startWidth + deltaX, 280), 650)
      setTraceWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [traceWidth])

  const onAgentAudio = useCallback((isPlaying: boolean) => {
    setIsAgentSpeaking(isPlaying)
  }, [])

  const {
    isConnecting, isConnected: wsConnected, isSpeaking,
    connect, disconnect, startSpeaking, stopSpeaking, sendText, error,
  } = useWebRTC({ onAgentAudioStateChange: onAgentAudio })

  useEventStream(session?.session_id ?? null)

  // Redirect to portal if no active session
  useEffect(() => {
    if (!session && !isConnecting) {
      window.history.replaceState(null, '', '/portal')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [session, isConnecting])

  // Auto-connect on mount if session exists and not connected
  useEffect(() => {
    if (session?.session_id && !wsConnected && !isConnecting) {
      connect(session.session_id)
    }
  }, [session?.session_id, wsConnected, isConnecting, connect])

  // Listen for remote termination (e.g. admin force-end from supervisor dashboard)
  useEffect(() => {
    const handleRemoteSessionEnd = async () => {
      console.log('[VoiceInterface] Remote session termination event received')
      disconnect()
      await endSession()
      setIsAgentSpeaking(false)
      window.history.replaceState(null, '', '/portal')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
    window.addEventListener('insureai:session-ended', handleRemoteSessionEnd)
    return () => window.removeEventListener('insureai:session-ended', handleRemoteSessionEnd)
  }, [disconnect, endSession])

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px"
  }, [textInput])

  async function handleStart() {
    const sess = await startSession(customer?.customer_id ?? undefined)
    if (sess?.session_id) await connect(sess.session_id)
  }

  async function handleEnd() {
    disconnect()
    await endSession()
    setIsAgentSpeaking(false)
    window.history.replaceState(null, '', '/portal')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  async function handleLogout() {
    if (wsConnected) {
      setShowLogoutConfirm(true)
    } else {
      await logout()
      window.location.href = '/auth'
    }
  }

  async function confirmLogout() {
    if (wsConnected) {
      disconnect()
      await endSession()
    }
    await logout()
    window.location.href = '/auth'
  }

  function handleSendText(e: React.FormEvent) {
    e.preventDefault()
    if (!textInput.trim()) return
    sendText(textInput)
    setTextInput("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (textInput.trim()) {
        sendText(textInput)
        setTextInput("")
        if (textareaRef.current) textareaRef.current.style.height = "auto"
      }
    }
  }

  const connectionStatus = isConnecting ? "connecting"
    : wsConnected ? "connected"
    : error ? "error"
    : "disconnected"

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "100vh", overflow: "hidden",
      background: "var(--bg-primary)", fontFamily: "var(--font-sans)",
    }}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: "10px 24px",
        borderBottom: "1px solid var(--border-subtle)", flexShrink: 0,
        background: "var(--bg-secondary)", animation: "fade-in 0.4s ease",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Left: Brand & Customer */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, color: "var(--accent-primary)", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              InsureAI
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              {customer?.name ? customer.name : "AI Claims & Policy Agent"}
            </div>
          </div>
        </div>

        {/* Center: Title / Status */}
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>
            Command Center
          </h1>
          <div style={{ fontSize: 10, color: wsConnected ? "#34d399" : "var(--text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {wsConnected && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px rgba(52,211,153,0.6)" }} />}
            {wsConnected ? "Active Session" : "Connecting…"}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {wsConnected && (
            <button
              id="toggle-trace-btn"
              type="button"
              onClick={() => setIsTraceOpen((prev) => !prev)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: "var(--radius-md)",
                border: isTraceOpen ? "1px solid rgba(56, 189, 248, 0.45)" : "1px solid var(--border)",
                background: isTraceOpen ? "rgba(56, 189, 248, 0.12)" : "rgba(255, 255, 255, 0.03)",
                color: isTraceOpen ? "#38bdf8" : "var(--text-secondary)",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={isTraceOpen ? "Hide Trace" : "Show Trace"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>Trace</span>
              <span style={{
                fontSize: 9, padding: "1px 5px", borderRadius: 10,
                background: isTraceOpen ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.08)",
                color: isTraceOpen ? "#38bdf8" : "var(--text-muted)",
                fontFamily: "var(--font-mono)",
              }}>
                {isTraceOpen ? "ON" : "OFF"}
              </span>
            </button>
          )}

          {customer?.customer_id && (
            <button
              id="header-history-btn"
              type="button"
              onClick={() => setShowHistory(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 11.5, fontWeight: 500, cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </button>
          )}

          {wsConnected && (
            <button
              id="header-end-call-btn"
              type="button"
              onClick={handleEnd}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 12px", borderRadius: "var(--radius-md)",
                border: "1px solid rgba(248,113,113,0.35)",
                background: "rgba(248,113,113,0.1)",
                color: "#f87171",
                fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title="Conclude call and return to portal"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              </svg>
              <span>End Call</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Connecting / Standby screen ──────────────────────────── */}
      {!wsConnected ? (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          gap: 16, padding: 24,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: "50%",
            border: "3px solid rgba(15,118,110,0.18)",
            borderTopColor: "var(--accent-primary)",
            animation: "spin 0.7s linear infinite",
          }} />
          <div style={{ fontSize: 13.5, color: "var(--text-secondary)", fontWeight: 500 }}>
            {isConnecting ? "Connecting to InsureAI voice session…" : "Initializing session…"}
          </div>
          {error && (
            <div style={{
              marginTop: 8, padding: "8px 14px", borderRadius: "var(--radius-md)",
              background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
              color: "#f87171", fontSize: 12.5,
            }}>
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              window.history.replaceState(null, '', '/portal')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
            style={{
              marginTop: 10, padding: "6px 14px", fontSize: 12,
              borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
              background: "transparent", color: "var(--text-muted)", cursor: "pointer",
            }}
          >
            ← Return to Portal
          </button>
        </div>
      ) : (
        /* ── Active call: 3-column layout ─────────────────────────────── */
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── LEFT SIDEBAR: Controls (200px) ─────────────────────────── */}
          <div style={{
            width: 200, flexShrink: 0,
            display: "flex", flexDirection: "column", gap: 14,
            padding: "16px 14px", overflowY: "auto",
            borderRight: "1px solid var(--border-subtle)",
            background: "var(--bg-secondary)",
          }}>
            {/* Status + sentiment */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
              <StatusIndicator status={connectionStatus} />
              <SentimentBadge sentiment={sentiment} />
            </div>

            {/* Agent speaking indicator */}
            {isAgentSpeaking && (
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px",
                background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)",
                borderRadius: "var(--radius-full)", animation: "fade-in 0.2s ease",
              }}>
                <AgentWave />
                <span style={{ fontSize: 11, color: "var(--accent-green)", fontWeight: 500 }}>Responding…</span>
              </div>
            )}

            {/* PTT button */}
            <PTTButton isSpeaking={isSpeaking} onStart={startSpeaking} onStop={stopSpeaking} />

            {/* Language select */}
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              style={{
                padding: "6px 8px", borderRadius: "var(--radius-md)",
                border: "1px solid var(--border)", background: "var(--bg-primary)",
                color: "var(--text-primary)", fontSize: 11,
              }}
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi</option>
              <option value="te-IN">Telugu</option>
              <option value="ta-IN">Tamil</option>
              <option value="kn-IN">Kannada</option>
              <option value="ml-IN">Malayalam</option>
            </select>

            {/* Intent pills */}
            {currentIntents.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {currentIntents.map((intent) => (
                  <span key={intent} className="badge badge--purple" style={{ fontSize: 9 }}>
                    {intent.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* End call */}
            <button
              id="end-call-btn"
              onClick={handleEnd}
              style={{
                width: "100%", padding: "10px 14px",
                borderRadius: "var(--radius-md)", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                boxShadow: "0 0 16px rgba(239,68,68,0.2)",
                color: "white", fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all var(--transition-base)",
              }}
            >
              <PhoneOffIcon />
              End Call
            </button>

            <button
              onClick={handleLogout}
              style={{
                width: "100%", padding: "10px 14px",
                borderRadius: "var(--radius-md)", border: "1px solid var(--border)",
                cursor: "pointer", background: "transparent",
                color: "var(--text-secondary)", fontSize: 12, fontWeight: 500,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all var(--transition-base)",
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.02)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Logout
            </button>

            {error && (
              <div style={{
                padding: "8px 10px", background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)", borderRadius: "var(--radius-md)",
                color: "var(--accent-red)", fontSize: 11,
              }}>
                {error}
              </div>
            )}
          </div>

          {/* ── CENTER: Chat transcript + input ────────────────────────── */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
            background: "var(--bg-primary)",
          }}>
            {/* Transcript fills all available space */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <TranscriptDisplay />
            </div>

            {/* ── Sticky chat input bar at bottom ──────────────────────── */}
            <form
              onSubmit={handleSendText}
              style={{
                flexShrink: 0,
                display: "flex", gap: 8, alignItems: "flex-end",
                padding: "12px 16px",
                borderTop: "1px solid var(--border-subtle)",
                background: "var(--bg-secondary)",
                boxShadow: "0 -2px 12px rgba(0,0,0,0.04)",
              }}
            >
              <textarea
                ref={textareaRef}
                id="chat-input"
                placeholder="Type your message… (Enter to send, Shift+Enter for new line)"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-card)",
                  color: "var(--text-primary)",
                  fontSize: 14,
                  resize: "none",
                  lineHeight: 1.5,
                  minHeight: 42,
                  maxHeight: 120,
                  overflowY: "auto",
                  outline: "none",
                  transition: "border-color 0.15s ease, box-shadow 0.15s ease",
                  fontFamily: "var(--font-sans)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--accent-primary)"
                  e.target.style.boxShadow = "0 0 0 2px rgba(15,118,110,0.12)"
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border)"
                  e.target.style.boxShadow = "none"
                }}
              />
              <button
                type="submit"
                disabled={!textInput.trim()}
                style={{
                  padding: "10px 18px",
                  borderRadius: "var(--radius-md)", border: "none",
                  background: textInput.trim()
                    ? "linear-gradient(135deg, #0f766e, #0d5f58)"
                    : "var(--border-subtle)",
                  color: textInput.trim() ? "white" : "var(--text-muted)",
                  cursor: textInput.trim() ? "pointer" : "not-allowed",
                  fontSize: 13, fontWeight: 600,
                  flexShrink: 0, height: 42,
                  transition: "all 0.15s ease",
                  display: "flex", alignItems: "center", gap: 6,
                  boxShadow: textInput.trim() ? "0 0 12px rgba(15,118,110,0.2)" : "none",
                }}
              >
                <SendIcon /> Send
              </button>
            </form>
          </div>

          {/* ── Drag & Pull Resize Handle (Splitter) ─────────────── */}
          {isTraceOpen && (
            <div
              onMouseDown={handleMouseDown}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: isDragging ? 'var(--accent-primary)' : 'transparent',
                borderLeft: '1px solid var(--border-subtle)',
                transition: isDragging ? 'none' : 'background 0.15s ease',
                position: 'relative',
                zIndex: 10,
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                if (!isDragging) e.currentTarget.style.background = 'rgba(56, 189, 248, 0.25)'
              }}
              onMouseLeave={(e) => {
                if (!isDragging) e.currentTarget.style.background = 'transparent'
              }}
              title="Drag to resize Trace"
            >
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 2, height: 28, borderRadius: 1,
                background: isDragging ? '#38bdf8' : 'var(--text-muted)',
                opacity: isDragging ? 1 : 0.35,
              }} />
            </div>
          )}

          {/* ── RIGHT: Trace Panel (Resizable, Toggleable) ─── */}
          {isTraceOpen && (
            <div style={{
              width: traceWidth,
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              transition: isDragging ? 'none' : 'width 0.15s ease',
            }}>
              <DiagnosticTracePanel onClose={() => setIsTraceOpen(false)} />
            </div>
          )}
        </div>
      )}

      {showLogoutConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fade-in 0.2s ease',
        }}>
          <div style={{
            background: 'var(--bg-card)', padding: 24, borderRadius: 'var(--radius-lg)', width: 320,
            boxShadow: 'var(--shadow-lg)', border: '1px solid var(--border)',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, color: 'var(--text-primary)' }}>End call and logout?</h3>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              You have an active call. Logging out will end the current session.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowLogoutConfirm(false)} 
                style={{ 
                  padding: '8px 16px', border: '1px solid var(--border)', background: 'transparent', 
                  borderRadius: 'var(--radius-md)', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 13, fontWeight: 500
                }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmLogout} 
                style={{ 
                  padding: '8px 16px', border: 'none', background: 'var(--accent-red)', 
                  color: 'white', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 13, fontWeight: 500
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Conversation History Modal ────────────────────────────────────── */}
      {showHistory && customer?.customer_id && (
        <ConversationHistoryModal
          customerId={customer.customer_id}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  )
}


// ── Sub-components ──────────────────────────────────────────────────────────

interface PTTButtonProps { isSpeaking: boolean; onStart: () => void; onStop: () => void }

function PTTButton({ isSpeaking, onStart, onStop }: PTTButtonProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button
        id="ptt-btn"
        onMouseDown={onStart} onMouseUp={onStop} onMouseLeave={onStop}
        onTouchStart={(e) => { e.preventDefault(); onStart() }}
        onTouchEnd={(e) => { e.preventDefault(); onStop() }}
        style={{
          width: 72, height: 72, borderRadius: "50%",
          border: `3px solid ${isSpeaking ? "rgba(21,128,61,0.7)" : "rgba(15,118,110,0.35)"}`,
          cursor: "pointer",
          background: isSpeaking
            ? "linear-gradient(135deg, rgba(21,128,61,0.15), rgba(4,120,87,0.25))"
            : "linear-gradient(135deg, rgba(15,118,110,0.08), rgba(13,95,88,0.12))",
          boxShadow: isSpeaking
            ? "0 0 30px rgba(21,128,61,0.35), inset 0 0 15px rgba(21,128,61,0.08)"
            : "0 0 15px rgba(15,118,110,0.15)",
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
          transition: "all 0.15s ease", userSelect: "none", WebkitUserSelect: "none",
          transform: isSpeaking ? "scale(1.05)" : "scale(1)",
        }}
      >
        {isSpeaking ? <WaveIcon /> : <MicLargeIcon />}
      </button>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
        color: isSpeaking ? "var(--accent-green)" : "var(--text-muted)",
        transition: "color 0.15s ease",
      }}>
        {isSpeaking ? "● Recording…" : "Hold to Speak"}
      </div>
    </div>
  )
}

function AgentWave() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {[0.4, 0.7, 1.0, 0.7, 0.4].map((h, i) => (
        <div key={i} style={{
          width: 3, height: 14 * h, background: "var(--accent-green)", borderRadius: 2,
          animation: `blink ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
          animationDelay: `${i * 0.1}s`,
        }} />
      ))}
    </div>
  )
}

function WaveIcon() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {[6, 12, 20, 14, 8, 16, 10].map((h, i) => (
        <div key={i} style={{
          width: 4, height: h, background: "var(--accent-green)", borderRadius: 2,
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
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(15,118,110,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  )
}

function PhoneOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.32 9.69 19.73 19.73 0 0 1 1.27 1 2 2 0 0 1 3.27-1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.25 7.77a16 16 0 0 0 3.43 5.54z"/>
      <line x1="23" y1="1" x2="1" y2="23"/>
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
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
