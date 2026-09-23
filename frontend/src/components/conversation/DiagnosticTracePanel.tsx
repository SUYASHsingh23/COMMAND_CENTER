import React, { useState, useRef, useEffect } from 'react'
import { useConversationStore } from '@/store/conversation'
import type { AgentTimelineEntry } from '@/store/supervisor'

// ── Minimal Enterprise SVG Icons ─────────────────────────────────────────────

const IconTarget = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

const IconCpu = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" />
  </svg>
)

const IconZap = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
)

const IconFileCheck = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <path d="m9 15 2 2 4-4" />
  </svg>
)

const IconScale = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z" />
    <path d="M7 21h10" />
    <path d="M12 3v18" />
    <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
  </svg>
)

const IconShield = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const IconGitBranch = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </svg>
)

const IconBot = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="10" rx="2" />
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v4" />
    <line x1="8" y1="16" x2="8" y2="16" />
    <line x1="16" y1="16" x2="16" y2="16" />
  </svg>
)

const IconUser = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const IconClipboardList = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4" />
    <path d="M12 16h4" />
    <path d="M8 11h.01" />
    <path d="M8 16h.01" />
  </svg>
)

const IconAlertCircle = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const IconActivity = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const IconClose = ({ color = 'currentColor', size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const IconLock = ({ color = 'currentColor', size = 12 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

// ── Color & Icon Configuration ───────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { Icon: React.FC<{ color?: string; size?: number }>; color: string; bg: string; label: string }> = {
  intent:                { Icon: IconTarget,        color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'User Intent' },
  tool_started:          { Icon: IconCpu,           color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Tool Started' },
  tool_completed:        { Icon: IconZap,           color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: 'Tool Result' },
  document_verification: { Icon: IconFileCheck,     color: '#38bdf8', bg: 'rgba(56,189,248,0.14)',  label: 'Document Verified' },
  policy_evaluation:     { Icon: IconScale,         color: '#f59e0b', bg: 'rgba(245,158,11,0.14)',  label: 'Policy Evaluation' },
  policy:                { Icon: IconShield,        color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Policy Guardrail' },
  workflow_step:         { Icon: IconGitBranch,     color: '#818cf8', bg: 'rgba(129,140,248,0.12)', label: 'Workflow' },
  response:              { Icon: IconBot,           color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: 'Agent Response' },
  plan:                  { Icon: IconClipboardList, color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', label: 'Execution Plan' },
  escalation:            { Icon: IconAlertCircle,   color: '#f97316', bg: 'rgba(249,115,22,0.16)',  label: 'Human Routing' },
  session_started:       { Icon: IconActivity,      color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: 'Session Start' },
  session_ended:         { Icon: IconActivity,      color: '#94a3b8', bg: 'rgba(148,163,184,0.10)', label: 'Session End' },
  message_user:          { Icon: IconUser,          color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Customer' },
  message_agent:         { Icon: IconBot,           color: '#10b981', bg: 'rgba(16,185,129,0.12)',  label: 'Agent Response' },
}

const STATUS_COLORS: Record<string, string> = {
  success: '#10b981', completed: '#10b981', verified: '#38bdf8', allowed: '#10b981', resolved: '#10b981',
  failed: '#ef4444', blocked: '#ef4444', unresolved: '#ef4444',
  flagged: '#f97316', escalated: '#f97316', open: '#f97316',
  running: '#fbbf24', timeout: '#fbbf24', in_progress: '#38bdf8',
}

interface Props {
  onClose?: () => void
}

export function DiagnosticTracePanel({ onClose }: Props) {
  const entries = useConversationStore((s) => s.agentTimeline)
  const isConnected = useConversationStore((s) => s.isConnected)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  const toggle = (i: number) => setExpanded((prev) => {
    const next = new Set(prev)
    next.has(i) ? next.delete(i) : next.add(i)
    return next
  })

  // Auto-scroll when new live events arrive
  useEffect(() => {
    if (entries.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries.length])

  // Telemetry counts
  const toolCount = entries.filter((e) => e.type === 'tool_completed' || e.type === 'tool_started').length
  const docCount = entries.filter((e) => e.type === 'document_verification').length
  const policyCount = entries.filter((e) => e.type === 'policy' || e.type === 'policy_evaluation').length
  const hasEscalation = entries.some((e) => e.type === 'escalation' || e.status === 'escalated')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      position: 'relative',
    }}>
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 18px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: isConnected ? '#10b981' : '#94a3b8',
            boxShadow: isConnected ? '0 0 8px rgba(16,185,129,0.7)' : 'none',
          }} />
          <span style={{
            fontSize: 11.5,
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Trace
          </span>
          <span style={{
            fontSize: 10.5,
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-mono)',
            background: 'rgba(255,255,255,0.06)',
            padding: '2px 8px',
            borderRadius: 6,
            border: '1px solid var(--border-subtle)',
          }}>
            {entries.length} event{entries.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onClose && (
            <button
              onClick={onClose}
              title="Close trace panel"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                padding: '4px 6px',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'color 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <IconClose size={13} />
            </button>
          )}
        </div>
      </div>

      {/* ── Telemetry Summary Bar ──────────────────────────────────────── */}
      <div style={{
        padding: '8px 18px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.02)',
        flexShrink: 0,
      }}>
        <TelemetryChip label="Connection" value={isConnected ? 'LIVE' : 'IDLE'} color={isConnected ? '#10b981' : '#94a3b8'} />
        <TelemetryChip label="Tools" value={String(toolCount)} color="#10b981" />
        {docCount > 0 && <TelemetryChip label="Documents" value={String(docCount)} color="#38bdf8" />}
        {policyCount > 0 && <TelemetryChip label="Policy" value={String(policyCount)} color="#f59e0b" />}
        {hasEscalation && <TelemetryChip label="Routing" value="ESCALATED" color="#f97316" />}
      </div>

      {/* ── Event Stream Scroll Area with Vertical Connecting Line ──────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
        {entries.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            gap: 12,
            paddingTop: 40,
          }}>
            <IconActivity size={26} color="var(--text-muted)" />
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Awaiting conversation events.<br />Trace will stream here in real time.
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Connecting timeline line */}
            <div style={{
              position: 'absolute',
              left: 14,
              top: 14,
              bottom: 14,
              width: 2,
              background: 'linear-gradient(to bottom, rgba(56,189,248,0.4), rgba(20,184,166,0.3), rgba(148,163,184,0.15))',
              borderRadius: 2,
            }} />

            {entries.map((entry, i) => (
              <TraceItem
                key={`${entry.timestamp}-${i}`}
                entry={entry}
                isLast={i === entries.length - 1}
                isExpanded={expanded.has(i)}
                onToggle={() => toggle(i)}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Bottom Pinned Security & Timestamp Footer ──────────────────── */}
      <div style={{
        padding: '10px 18px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        background: 'rgba(255,255,255,0.02)',
        fontSize: 10,
        color: 'var(--text-muted)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <IconLock size={11} color="var(--text-muted)" />
          <span>secured with 256-Bit TLS encryption</span>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)' }}>
          {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })}, {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

function TelemetryChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>
        {label}
      </span>
      <span style={{ fontSize: 11, color: color || 'var(--text-secondary)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
    </div>
  )
}

function TraceItem({
  entry, isLast, isExpanded, onToggle,
}: {
  entry: AgentTimelineEntry
  isLast: boolean
  isExpanded: boolean
  onToggle: () => void
}) {
  const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.plan
  const statusColor = entry.status ? (STATUS_COLORS[entry.status] ?? cfg.color) : cfg.color

  const hasOutput = !!entry.output && (typeof entry.output === 'object' ? Object.keys(entry.output as any).length > 0 : true)
  const hasParams = !!entry.input_params && Object.keys(entry.input_params).length > 0
  const hasSteps = !!entry.steps && entry.steps.length > 0
  const isPlanNode = entry.type === 'plan' || entry.label.toLowerCase().includes('plan')
  const hasExpandable = hasSteps || hasOutput || hasParams

  const displayPayload = hasSteps ? entry.steps : hasOutput ? entry.output : hasParams ? entry.input_params : null

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      marginBottom: 14,
      position: 'relative',
      animation: 'slide-up 0.2s ease',
    }}>
      {/* Node Icon Circle */}
      <div style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        background: cfg.bg,
        border: `1.5px solid ${cfg.color}50`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
        boxShadow: isLast ? `0 0 10px ${cfg.color}40` : 'none',
      }}>
        <cfg.Icon color={cfg.color} size={13} />
      </div>

      {/* Main Node Card */}
      <div
        onClick={hasExpandable ? onToggle : undefined}
        style={{
          flex: 1,
          padding: '10px 14px',
          background: 'var(--bg-card, rgba(255,255,255,0.03))',
          borderRadius: 10,
          border: '1px solid var(--border-subtle)',
          cursor: hasExpandable ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header: Label + Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                {entry.label}
              </span>

              {entry.status && (
                <span style={{
                  fontSize: 8.5,
                  padding: '1px 6px',
                  borderRadius: 4,
                  background: `${statusColor}20`,
                  color: statusColor,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  border: `1px solid ${statusColor}40`,
                }}>
                  {entry.status === 'success' ? 'Success' : entry.status}
                </span>
              )}

              {entry.duration_ms !== undefined && (
                <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {entry.duration_ms}ms
                </span>
              )}
            </div>

            {/* Primary Detail Description */}
            {entry.detail ? (
              <div style={{
                fontSize: 11,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                marginTop: 2,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {typeof entry.detail === 'string' ? entry.detail : JSON.stringify(entry.detail)}
              </div>
            ) : null}

            {/* Dynamic Payload Section when Expanded */}
            {isExpanded && Boolean(displayPayload) && (
              <div style={{
                marginTop: 8,
                background: 'var(--bg-secondary, rgba(0,0,0,0.25))',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                padding: '8px 10px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {hasSteps ? 'Execution Plan' : hasOutput ? 'Response Payload' : 'Input Parameters'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(typeof displayPayload === 'string' ? displayPayload : JSON.stringify(displayPayload, null, 2))
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 8.5,
                      color: 'var(--text-muted)',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                    <span>Copy JSON</span>
                  </button>
                </div>
                <pre style={{
                  margin: 0,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.45,
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  maxHeight: 160,
                  overflowY: 'auto',
                }}>
                  {typeof displayPayload === 'string' ? displayPayload : JSON.stringify(displayPayload, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Right Column: Time & Accordion Indicator */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </span>
            {hasExpandable && (
              <span style={{ fontSize: 8.5, color: cfg.color, opacity: 0.85 }}>
                {isExpanded ? '▲ hide' : '▼ payload'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
