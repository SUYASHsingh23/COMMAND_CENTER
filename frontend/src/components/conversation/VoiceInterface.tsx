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
import { useTheme } from "@/contexts/ThemeContext"

export function VoiceInterface() {
  const { session, sentiment, currentIntents, startSession, endSession } = useConversation()
  const { customer, logout } = useAuth()
  const { theme, isDark, setTheme } = useTheme()
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

  const traceEventsCount = useConversationStore((s) => s.traceEvents.length + s.agentTimeline.length)

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      width: "100vw",
      overflow: "hidden",
      backgroundImage: isDark
        ? 'linear-gradient(rgba(11, 19, 43, 0.85), rgba(11, 19, 43, 0.95)), url("/assets/bg-dark-city.jpg")'
        : 'linear-gradient(rgba(240, 244, 249, 0.85), rgba(240, 244, 249, 0.95)), url("/assets/bg-light-city.jpg")',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      color: isDark ? '#f8fafc' : '#0f172a',
    }}>
      {/* ── Top Header Navigation Bar ────────────────────────────────────────── */}
      <header style={{
        height: "64px",
        padding: "0 28px",
        borderBottom: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid rgba(226, 232, 240, 0.85)",
        background: isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.88)",
        backdropFilter: "blur(20px)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 20,
      }}>
        {/* Left: Brand & Customer */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 50%, #38bdf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(255, 255, 255, 0.15)" />
              <path d="M9 12l2 2 4-4" strokeWidth="2.4" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 10, color: isDark ? "#38bdf8" : "#2563eb", fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              INSUREAI
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: isDark ? "#f8fafc" : "#0f172a" }}>
              {customer?.name || "Policyholder"}
            </div>
          </div>
        </div>

        {/* Center: Title / Status */}
        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <h1 style={{ fontSize: 16, fontWeight: 800, color: isDark ? "#f8fafc" : "#0f172a", margin: 0, letterSpacing: "-0.01em" }}>
            Command Center
          </h1>
          <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: wsConnected ? "#10b981" : "#94a3b8",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: wsConnected ? "#10b981" : "#94a3b8",
              boxShadow: wsConnected ? "0 0 8px #10b981" : "none",
            }} />
            <span>{wsConnected ? "Active Session" : "Connecting…"}</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Trace Toggle Button */}
          <button
            id="toggle-trace-btn"
            type="button"
            onClick={() => setIsTraceOpen((prev) => !prev)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: "10px",
              border: isTraceOpen
                ? (isDark ? "1px solid rgba(56, 189, 248, 0.45)" : "1px solid rgba(37, 99, 235, 0.35)")
                : (isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(226, 232, 240, 0.9)"),
              background: isTraceOpen
                ? (isDark ? "rgba(56, 189, 248, 0.15)" : "rgba(37, 99, 235, 0.08)")
                : (isDark ? "rgba(30, 41, 59, 0.7)" : "rgba(255, 255, 255, 0.85)"),
              color: isTraceOpen
                ? (isDark ? "#38bdf8" : "#2563eb")
                : (isDark ? "#e2e8f0" : "#475569"),
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title={isTraceOpen ? "Hide Diagnostic Trace" : "Show Diagnostic Trace"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>Trace</span>
            <span style={{
              fontSize: 10, padding: "1px 6px", borderRadius: 8,
              background: isTraceOpen ? (isDark ? "rgba(56, 189, 248, 0.25)" : "rgba(37, 99, 235, 0.15)") : "rgba(0, 0, 0, 0.06)",
              color: isTraceOpen ? (isDark ? "#38bdf8" : "#2563eb") : "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
            }}>
              {traceEventsCount}
            </span>
          </button>

          {/* History Button */}
          <button
            id="header-history-btn"
            type="button"
            onClick={() => setShowHistory(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: "10px",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(226, 232, 240, 0.9)",
              background: isDark ? "rgba(30, 41, 59, 0.7)" : "rgba(255, 255, 255, 0.85)",
              color: isDark ? "#e2e8f0" : "#475569",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>History</span>
          </button>

          {/* Theme Switcher Pill Toggle */}
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
              id="call-theme-light-btn"
              type="button"
              onClick={() => setTheme('light')}
              title="Switch to light theme"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: !isDark ? '#ffffff' : 'transparent',
                color: !isDark ? '#f59e0b' : '#64748b',
                boxShadow: !isDark ? '0 2px 6px rgba(0, 0, 0, 0.1)' : 'none',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 200ms ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
              id="call-theme-dark-btn"
              type="button"
              onClick={() => setTheme('dark')}
              title="Switch to dark theme"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: isDark ? '#0284c7' : 'transparent',
                color: isDark ? '#ffffff' : '#64748b',
                boxShadow: isDark ? '0 2px 6px rgba(2, 132, 199, 0.4)' : 'none',
                cursor: 'pointer',
                border: 'none',
                transition: 'all 200ms ease',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill={isDark ? '#bae6fd' : 'none'} />
              </svg>
            </button>
          </div>

          {/* End Call Button */}
          <button
            id="header-end-call-btn"
            type="button"
            onClick={handleEnd}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "7px 14px", borderRadius: "10px",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              background: "rgba(239, 68, 68, 0.1)",
              color: "#ef4444",
              fontSize: 12, fontWeight: 600, cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <PhoneOffIcon />
            <span>End Call</span>
          </button>
        </div>
      </header>

      {/* ── Main Active Call View ───────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* ── LEFT SIDEBAR: Controls & Session Meta (~210px) ─────────────────── */}
        <div style={{
          width: 210,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          padding: "20px 16px",
          overflowY: "auto",
          borderRight: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.8)",
          background: isDark ? "rgba(15, 23, 42, 0.75)" : "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(16px)",
        }}>
          {/* Status + Sentiment Row */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontSize: 12, fontWeight: 700, color: "#10b981",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
              <span>Connected</span>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
              padding: "3px 8px", borderRadius: 6,
              background: isDark ? "rgba(255, 255, 255, 0.08)" : "#f1f5f9",
              color: isDark ? "#cbd5e1" : "#475569",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e2e8f0",
            }}>
              {sentiment.toUpperCase()}
            </span>
          </div>

          {/* Centerpiece PTT Microphone Button with Wave Effects */}
          <div style={{ padding: "8px 0" }}>
            <PTTButton isSpeaking={isSpeaking} onStart={startSpeaking} onStop={stopSpeaking} />
          </div>

          {/* Language Selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              style={{
                padding: "8px 10px", borderRadius: "10px",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(226, 232, 240, 0.9)",
                background: isDark ? "rgba(30, 41, 59, 0.7)" : "#ffffff",
                color: isDark ? "#f8fafc" : "#0f172a",
                fontSize: 12, fontWeight: 600,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi</option>
              <option value="te-IN">Telugu</option>
              <option value="ta-IN">Tamil</option>
              <option value="kn-IN">Kannada</option>
              <option value="ml-IN">Malayalam</option>
            </select>
          </div>

          {/* Intent Tag Pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {currentIntents.length > 0 ? (
              currentIntents.map((intent) => (
                <span
                  key={intent}
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "4px 8px",
                    borderRadius: 6,
                    background: isDark ? "rgba(99, 102, 241, 0.18)" : "rgba(99, 102, 241, 0.1)",
                    color: isDark ? "#a5b4fc" : "#6366f1",
                    border: isDark ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(99, 102, 241, 0.2)",
                  }}
                >
                  {intent.replace(/_/g, " ")}
                </span>
              ))
            ) : (
              <>
                <span style={{
                  fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "4px 8px", borderRadius: 6,
                  background: isDark ? "rgba(99, 102, 241, 0.18)" : "rgba(99, 102, 241, 0.1)",
                  color: isDark ? "#a5b4fc" : "#6366f1",
                  border: isDark ? "1px solid rgba(99, 102, 241, 0.3)" : "1px solid rgba(99, 102, 241, 0.2)",
                }}>
                  ACCOUNT INQUIRY
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
                  padding: "4px 8px", borderRadius: 6,
                  background: isDark ? "rgba(168, 85, 247, 0.18)" : "rgba(168, 85, 247, 0.1)",
                  color: isDark ? "#d8b4fe" : "#a855f7",
                  border: isDark ? "1px solid rgba(168, 85, 247, 0.3)" : "1px solid rgba(168, 85, 247, 0.2)",
                }}>
                  COVERAGE INQUIRY
                </span>
              </>
            )}
          </div>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Bottom Action Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              id="sidebar-end-call-btn"
              onClick={handleEnd}
              style={{
                width: "100%", padding: "11px 16px",
                borderRadius: "12px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                boxShadow: "0 4px 14px rgba(239, 68, 68, 0.3)",
                color: "white", fontSize: 13, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                transition: "all 0.15s ease",
              }}
            >
              <PhoneOffIcon />
              <span>End Call</span>
            </button>

            <button
              onClick={handleLogout}
              style={{
                width: "100%", padding: "9px 14px",
                borderRadius: "10px",
                border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(226, 232, 240, 0.9)",
                cursor: "pointer", background: "transparent",
                color: isDark ? "#94a3b8" : "#64748b",
                fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={(e) => (e.currentTarget.style.color = isDark ? '#94a3b8' : '#64748b')}
            >
              Logout
            </button>
          </div>
        </div>

        {/* ── CENTER: Live Transcript & Chat Messages ────────────────────────── */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: isDark ? "rgba(15, 23, 42, 0.6)" : "rgba(255, 255, 255, 0.6)",
          backdropFilter: "blur(12px)",
          position: "relative",
        }}>
          {/* Transcript Scroll Area */}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TranscriptDisplay />
          </div>

          {/* ── Sticky Chat Input Bar at Bottom ──────────────────────────────── */}
          <form
            onSubmit={handleSendText}
            style={{
              flexShrink: 0,
              display: "flex",
              gap: 10,
              alignItems: "center",
              padding: "16px 28px",
              borderTop: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.85)",
              background: isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.92)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: isDark ? "rgba(30, 41, 59, 0.7)" : "#ffffff",
              border: isDark ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(219, 234, 254, 0.9)",
              borderRadius: "14px",
              padding: "4px 14px",
              boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.2)" : "0 2px 8px rgba(37, 99, 235, 0.04)",
            }}>
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
                  padding: "8px 4px",
                  border: "none",
                  background: "transparent",
                  color: isDark ? "#f8fafc" : "#0f172a",
                  fontSize: 13.5,
                  outline: "none",
                  resize: "none",
                  maxHeight: "120px",
                  lineHeight: 1.5,
                  fontFamily: "inherit",
                }}
              />
              <span style={{ color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', padding: '0 4px' }} title="Add emoji or attachment">
                😊
              </span>
            </div>

            <button
              id="send-chat-btn"
              type="submit"
              disabled={!textInput.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "11px 22px",
                borderRadius: "14px",
                border: "none",
                background: textInput.trim()
                  ? "linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)"
                  : (isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(226, 232, 240, 0.9)"),
                color: textInput.trim() ? "#ffffff" : "var(--text-muted)",
                fontSize: 13.5,
                fontWeight: 700,
                cursor: textInput.trim() ? "pointer" : "default",
                boxShadow: textInput.trim() ? "0 4px 14px rgba(37, 99, 235, 0.3)" : "none",
                transition: "all 0.18s ease",
              }}
            >
              <SendIcon />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* ── Resize Handle ──────────────────────────────────────────────────── */}
        {isTraceOpen && (
          <div
            onMouseDown={handleMouseDown}
            style={{
              width: 5,
              cursor: 'col-resize',
              background: isDragging ? '#38bdf8' : 'transparent',
              position: 'relative',
              zIndex: 30,
              flexShrink: 0,
              transition: 'background 0.15s ease',
            }}
            title="Drag to resize Diagnostic Trace"
          />
        )}

        {/* ── RIGHT: Diagnostic Trace Panel (Resizable, Toggleable) ──────────── */}
        {isTraceOpen && (
          <div style={{
            width: traceWidth,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: isDragging ? 'none' : 'width 0.15s ease',
            background: isDark ? "rgba(15, 23, 42, 0.85)" : "rgba(255, 255, 255, 0.92)",
            backdropFilter: "blur(20px)",
            borderLeft: isDark ? "1px solid rgba(255, 255, 255, 0.08)" : "1px solid rgba(226, 232, 240, 0.8)",
          }}>
            <DiagnosticTracePanel onClose={() => setIsTraceOpen(false)} />
          </div>
        )}
      </div>

      {/* ── Logout Confirmation Modal ────────────────────────────────────────── */}
      {showLogoutConfirm && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)',
          zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: isDark ? '#1e293b' : '#ffffff',
            padding: 28, borderRadius: '24px', width: 380,
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.3)',
            border: isDark ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid #e2e8f0',
          }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
              End call and sign out?
            </h3>
            <p style={{ margin: '0 0 20px', fontSize: 13.5, color: isDark ? '#94a3b8' : '#64748b', lineHeight: 1.5 }}>
              This will conclude your active InsureAI voice session and log you out.
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
                type="button"
                onClick={confirmLogout}
                style={{
                  padding: '9px 18px', borderRadius: '12px',
                  border: 'none', background: '#ef4444',
                  color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.35)',
                }}
              >
                Sign Out
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
    </div>
  )
}

// ── Sub-components & Icons ──────────────────────────────────────────────────

interface PTTButtonProps { isSpeaking: boolean; onStart: () => void; onStop: () => void }

function PTTButton({ isSpeaking, onStart, onStop }: PTTButtonProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      <div style={{
        position: 'relative',
        width: 100,
        height: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Animated Ripple Waves */}
        <div style={{
          position: 'absolute',
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: isSpeaking ? '2px solid rgba(34, 197, 94, 0.6)' : '2px solid rgba(15, 118, 110, 0.35)',
          animation: isSpeaking ? 'radar-ripple-1 1.8s infinite' : 'none',
          pointerEvents: 'none',
        }} />

        <div style={{
          position: 'absolute',
          width: 86,
          height: 86,
          borderRadius: '50%',
          border: isSpeaking ? '2px solid rgba(34, 197, 94, 0.4)' : '2px solid rgba(56, 189, 248, 0.25)',
          pointerEvents: 'none',
        }} />

        <button
          id="ptt-btn"
          onMouseDown={onStart}
          onMouseUp={onStop}
          onMouseLeave={onStop}
          onTouchStart={(e) => { e.preventDefault(); onStart() }}
          onTouchEnd={(e) => { e.preventDefault(); onStop() }}
          aria-label="Hold to speak"
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background: isSpeaking
              ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
              : "linear-gradient(135deg, #0f766e 0%, #0369a1 100%)",
            boxShadow: isSpeaking
              ? "0 0 30px rgba(16, 185, 129, 0.5), inset 0 0 15px rgba(255, 255, 255, 0.2)"
              : "0 0 20px rgba(15, 118, 110, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
            userSelect: "none",
            WebkitUserSelect: "none",
            transform: isSpeaking ? "scale(1.06)" : "scale(1)",
            position: 'relative',
            zIndex: 10,
          }}
        >
          {isSpeaking ? (
            <WaveIcon />
          ) : (
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
        </button>
      </div>

      <div style={{
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: isSpeaking ? "#10b981" : "var(--text-muted)",
        transition: "color 0.15s ease",
      }}>
        {isSpeaking ? "● RECORDING…" : "HOLD TO SPEAK"}
      </div>
    </div>
  )
}

function WaveIcon() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {[8, 16, 24, 18, 10, 20, 12].map((h, i) => (
        <div key={i} style={{
          width: 3.5, height: h, background: "#ffffff", borderRadius: 2,
          animation: `blink ${0.4 + (i % 3) * 0.15}s ease-in-out infinite alternate`,
          animationDelay: `${i * 0.07}s`,
        }} />
      ))}
    </div>
  )
}

function PhoneOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.32 9.69 19.73 19.73 0 0 1 1.27 1 2 2 0 0 1 3.27-1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.25 7.77a16 16 0 0 0 3.43 5.54z" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  )
}
