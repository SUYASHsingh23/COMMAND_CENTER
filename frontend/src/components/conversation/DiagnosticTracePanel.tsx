import React, { useState, useRef, useEffect } from 'react'
import { useConversationStore } from '@/store/conversation'
import type { AgentTimelineEntry } from '@/store/supervisor'

// ── Minimal Enterprise SVG Icons (Zero Emojis) ───────────────────────────────

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

// ── Color & Icon Configuration ───────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { Icon: React.FC<{ color?: string; size?: number }>; color: string; bg: string; label: string }> = {
  intent:                { Icon: IconTarget,        color: '#60a5fa', bg: 'rgba(96,165,250,0.10)',  label: 'User Intent' },
  tool_started:          { Icon: IconCpu,           color: '#fbbf24', bg: 'rgba(251,191,36,0.10)',  label: 'Tool Started' },
  tool_completed:        { Icon: IconZap,           color: '#34d399', bg: 'rgba(52,211,153,0.10)',  label: 'Tool Result' },
  document_verification: { Icon: IconFileCheck,     color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Document Verified' },
  policy_evaluation:     { Icon: IconScale,         color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Policy Evaluation' },
  policy:                { Icon: IconShield,        color: '#f59e0b', bg: 'rgba(245,158,11,0.10)',  label: 'Policy Guardrail' },
  workflow_step:         { Icon: IconGitBranch,     color: '#818cf8', bg: 'rgba(129,140,248,0.10)', label: 'Workflow' },
  response:              { Icon: IconBot,           color: '#34d399', bg: 'rgba(52,211,153,0.10)',  label: 'Agent Response' },
  plan:                  { Icon: IconClipboardList, color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: 'Execution Plan' },
  escalation:            { Icon: IconAlertCircle,   color: '#f97316', bg: 'rgba(249,115,22,0.14)',  label: 'Human Routing' },
  session_started:       { Icon: IconActivity,      color: '#34d399', bg: 'rgba(52,211,153,0.10)',  label: 'Session Start' },
  session_ended:         { Icon: IconActivity,      color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: 'Session End' },
  message_user:          { Icon: IconUser,          color: '#60a5fa', bg: 'rgba(96,165,250,0.08)',  label: 'Customer' },
  message_agent:         { Icon: IconBot,           color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', label: 'Agent Response' },
}

const STATUS_COLORS: Record<string, string> = {
  success: '#34d399', completed: '#34d399', verified: '#38bdf8', allowed: '#34d399', resolved: '#34d399',
  failed: '#f87171', blocked: '#f87171', unresolved: '#f87171',
  flagged: '#f97316', escalated: '#f97316', open: '#f97316',
  running: '#fbbf24', timeout: '#fbbf24', in_progress: '#38bdf8',
}

const STEP_INFO_MAP: Record<string, { title: string; desc: string }> = {
  verify_invoice: { title: 'Verify Invoice & Billing Ledger', desc: 'Verified billing document, line items, and confirmed payment status against ledger' },
  policy_check: { title: 'Policy & Dispute Rules Check', desc: 'Evaluated dispute eligibility window, terms of service, and warranty standing' },
  policy_document_check: { title: 'Policy Document & Terms Verification', desc: 'Consulted Billing & Premium Dispute Policy (Clause 3.2)' },
  fraud_velocity_check: { title: 'Anti-Fraud Velocity Guard', desc: 'Checked customer dispute frequency across 24h window for abnormal patterns' },
  threshold_evaluation: { title: 'Policy Threshold Evaluation', desc: 'Evaluated amount against autonomous approval ceiling (Rs.5,000.00)' },
  threshold_exceeded: { title: 'Threshold Ceiling Exceeded', desc: 'Dispute amount exceeds autonomous limit; supervisor authorization required' },
  process_refund: { title: 'Process Refund & Settlement', desc: 'Executed automated ledger credit reversal and marked invoice adjustment' },
  process_settlement: { title: 'Process Ledger Settlement', desc: 'Updated accounting balance and processed refund to original payment source' },
  notify_customer: { title: 'Notify Customer & Issue Tracking', desc: 'Sent confirmation notification with formal tracking reference to customer' },
  queue_for_human_review: { title: 'Queue for Supervisor Review', desc: 'Created escalation ticket and routed case to Tier-2 specialist queue' },
  verify_account: { title: 'Verify Subscriber Account', desc: 'Verified subscriber identity, active status, and contract records' },
  check_contract: { title: 'Check Contract Terms & Tenure', desc: 'Evaluated tenure, commitment duration, and notice period requirements' },
  check_contract_status: { title: 'Check Contract Status & Tenure', desc: 'Evaluated notice period and early termination conditions' },
  retention_attempt: { title: 'Retention Optimization Offer', desc: 'Evaluated customer usage and presented tailored alternative plan options' },
  calculate_etf: { title: 'Calculate Early Termination Fee', desc: 'Computed contract early termination fee and notice period obligations' },
  process_cancellation: { title: 'Process Service Cancellation', desc: 'Scheduled service deactivation and prepared final settlement statement' },
  check_outage: { title: 'Check Area Network & Outages', desc: 'Queried infrastructure monitoring for known network incidents in the area' },
  remote_diagnostics: { title: 'Remote Line Diagnostics', desc: 'Executed telemetry tests and ping latency diagnostics on customer line' },
  create_ticket: { title: 'Create Support Ticket', desc: 'Logged ticket in technical service queue with telemetry diagnostics' },
  schedule_engineer: { title: 'Schedule Field Dispatch', desc: 'Allocated field technician appointment for onsite inspection' },
  verify_eligibility: { title: 'Verify Upgrade Eligibility', desc: 'Checked credit standing and network equipment bandwidth headroom' },
  calculate_pricing: { title: 'Calculate Prorated Differential', desc: 'Computed billing differential for remaining cycle days' },
  provision_upgrade: { title: 'Provision Upgraded Tier', desc: 'Updated network configuration and adjusted bandwidth profiles' },
  confirm_upgrade: { title: 'Confirm Upgrade Activation', desc: 'Dispatched formal upgrade confirmation and revised billing terms' },
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
  const toolCount = entries.filter((e) => e.type === 'tool_completed').length
  const docCount = entries.filter((e) => e.type === 'document_verification').length
  const policyCount = entries.filter((e) => e.type === 'policy' || e.type === 'policy_evaluation').length
  const hasEscalation = entries.some((e) => e.type === 'escalation' || e.status === 'escalated')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border-subtle)',
    }}>
      {/* ── Top Header ─────────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, background: 'var(--bg-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: isConnected ? '#34d399' : '#94a3b8',
            boxShadow: isConnected ? '0 0 8px rgba(52,211,153,0.7)' : 'none',
          }} />
          <span style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Trace
          </span>
          <span style={{
            fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            background: 'rgba(255,255,255,0.04)', padding: '1px 6px', borderRadius: 4,
          }}>
            {entries.length} events
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onClose && (
            <button
              onClick={onClose}
              title="Close trace panel"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '4px 6px', borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
        padding: '8px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.015)', flexShrink: 0,
      }}>
        <TelemetryChip label="Connection" value={isConnected ? 'LIVE' : 'IDLE'} color={isConnected ? '#34d399' : '#94a3b8'} />
        {docCount > 0 && <TelemetryChip label="Documents" value={String(docCount)} color="#38bdf8" />}
        {policyCount > 0 && <TelemetryChip label="Policy" value={String(policyCount)} color="#f59e0b" />}
        {toolCount > 0 && <TelemetryChip label="Tools" value={String(toolCount)} color="#34d399" />}
        {hasEscalation && <TelemetryChip label="Routing" value="ESCALATED" color="#f97316" />}
      </div>

      {/* ── Event Stream Scroll Area ───────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {entries.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 12, paddingTop: 40,
          }}>
            <IconActivity size={26} color="var(--text-muted)" />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.6 }}>
              Awaiting conversation events.<br />Trace will stream here in real time.
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Connecting timeline line */}
            <div style={{
              position: 'absolute', left: 14, top: 8, bottom: 8, width: 2,
              background: 'linear-gradient(to bottom, rgba(56,189,248,0.3), rgba(148,163,184,0.1))',
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
    </div>
  )
}

function TelemetryChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 8.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 10.5, color: color || 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{value}</span>
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

  const hasEvidence = entry.evidence && Object.keys(entry.evidence).length > 0
  const hasRule = !!entry.rule
  const hasDecision = !!entry.decision
  const hasTicket = !!entry.ticket_reference
  const hasOutput = !!entry.output && Object.keys(entry.output as any).length > 0
  const hasParams = !!entry.input_params && Object.keys(entry.input_params).length > 0
  const hasSteps = !!entry.steps?.length

  const hasExpandable = hasOutput || hasParams || hasSteps

  return (
    <div style={{
      display: 'flex', gap: 12, marginBottom: 12, position: 'relative',
      animation: 'slide-up 0.2s ease',
    }}>
      {/* Node Icon Circle */}
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: cfg.bg, border: `1.5px solid ${cfg.color}45`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, position: 'relative', zIndex: 1,
        boxShadow: isLast ? `0 0 10px ${cfg.color}30` : 'none',
      }}>
        <cfg.Icon color={cfg.color} size={13} />
      </div>

      {/* Main Card */}
      <div
        onClick={hasExpandable ? onToggle : undefined}
        style={{
          flex: 1, padding: '10px 12px',
          background: isLast ? `${cfg.bg}` : 'rgba(255,255,255,0.02)',
          borderRadius: 8,
          border: isLast ? `1px solid ${cfg.color}35` : '1px solid var(--border-subtle)',
          cursor: hasExpandable ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Header: Label + Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: cfg.color }}>
                {entry.label}
              </span>

              {entry.step_number && (
                <span style={{
                  fontSize: 8.5, padding: '1px 5px', borderRadius: 3,
                  background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)',
                  fontWeight: 600, fontFamily: 'var(--font-mono)',
                }}>
                  Step {entry.step_number}
                </span>
              )}

              {entry.status && (
                <span style={{
                  fontSize: 8.5, padding: '1px 5px', borderRadius: 3,
                  background: `${statusColor}18`, color: statusColor,
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                  border: `1px solid ${statusColor}30`,
                }}>
                  {entry.status}
                </span>
              )}

              {entry.duration_ms !== undefined && (
                <span style={{ fontSize: 8.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {entry.duration_ms}ms
                </span>
              )}
            </div>

            {/* Primary Detail - Completely visible without truncation */}
            {entry.detail && (
              <div style={{
                fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.55,
                marginTop: 2, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {entry.detail}
              </div>
            )}

            {/* Document Evidence Chips */}
            {hasEvidence && (
              <div style={{
                marginTop: 7, padding: '6px 8px', borderRadius: 6,
                background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)',
                display: 'flex', flexDirection: 'column', gap: 3,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 700, color: '#38bdf8' }}>
                  <IconFileCheck size={11} color="#38bdf8" />
                  <span>Verified Evidence</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 2 }}>
                  {Object.entries(entry.evidence!).map(([k, v]) => (
                    <span key={k} style={{
                      fontSize: 9.5, padding: '2px 5px', borderRadius: 4,
                      background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)',
                      border: '1px solid rgba(255,255,255,0.06)', fontFamily: 'var(--font-mono)',
                    }}>
                      <strong style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k.replace(/_/g, ' ')}:</strong>{' '}
                      {typeof v === 'number' ? `Rs.${v.toLocaleString()}` : String(v)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Policy Rule Box */}
            {hasRule && (
              <div style={{
                marginTop: 6, display: 'flex', alignItems: 'flex-start', gap: 6,
                fontSize: 9.5, color: '#fbbf24', background: 'rgba(251,191,36,0.05)',
                padding: '4px 8px', borderRadius: 4, borderLeft: '2px solid #fbbf24',
                borderTop: '1px solid rgba(251,191,36,0.1)', borderRight: '1px solid rgba(251,191,36,0.1)', borderBottom: '1px solid rgba(251,191,36,0.1)',
              }}>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>Policy Rule:</span>
                <span style={{ color: 'var(--text-secondary)' }}>{entry.rule}</span>
              </div>
            )}

            {/* Decision Outcome Box */}
            {hasDecision && (
              <div style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 9.5, fontWeight: 600,
                color: entry.status === 'escalated' ? '#f97316' : '#34d399',
                background: entry.status === 'escalated' ? 'rgba(249,115,22,0.08)' : 'rgba(52,211,153,0.08)',
                padding: '4px 8px', borderRadius: 4,
                border: `1px solid ${entry.status === 'escalated' ? 'rgba(249,115,22,0.25)' : 'rgba(52,211,153,0.25)'}`,
              }}>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>Outcome:</span>
                <span style={{ color: 'var(--text-primary)' }}>{entry.decision}</span>
              </div>
            )}

            {/* Escalation Ticket Box */}
            {hasTicket && (
              <div style={{
                marginTop: 6, display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(249,115,22,0.10)', padding: '5px 8px', borderRadius: 6,
                border: '1px solid rgba(249,115,22,0.3)',
              }}>
                <IconAlertCircle size={12} color="#f97316" />
                <span style={{ fontSize: 9.5, fontWeight: 700, color: '#f97316' }}>
                  Escalation Ticket: {entry.ticket_reference}
                </span>
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  Specialist Review Required
                </span>
              </div>
            )}

            {/* Structured Workflow Steps Breakdown */}
            {hasSteps && (
              <div style={{
                marginTop: 8, padding: '8px 10px',
                background: 'rgba(129,140,248,0.06)', borderRadius: 6,
                border: '1px solid rgba(129,140,248,0.18)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 6, fontSize: 9.5, fontWeight: 700, color: '#818cf8',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  <span>Completed Steps ({entry.steps!.length})</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {entry.steps!.map((s: any, idx: number) => {
                    const isObj = typeof s === 'object' && s !== null
                    const stepKey = isObj ? s.step_name || s.tool || '' : String(s)
                    const meta = STEP_INFO_MAP[stepKey] || {}
                    const stepTitle = isObj
                      ? (s.title || meta.title || stepKey.replace(/_/g, ' ').toUpperCase())
                      : (meta.title || stepKey.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()))
                    const stepDetail = isObj
                      ? (s.detail || s.reason || meta.desc || '')
                      : (meta.desc || `Step ${stepKey} performed and verified successfully.`)
                    const stepStatus = isObj ? (s.step_status || s.status || 'completed') : 'completed'

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 8,
                          padding: '5px 7px', borderRadius: 4,
                          background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <span style={{
                          fontSize: 8.5, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                          background: 'rgba(129,140,248,0.2)', color: '#a5b4fc',
                          fontFamily: 'var(--font-mono)', flexShrink: 0, marginTop: 1,
                        }}>
                          #{idx + 1}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-primary)' }}>
                              {stepTitle}
                            </span>
                            <span style={{
                              fontSize: 8, fontWeight: 700, textTransform: 'uppercase',
                              padding: '1px 4px', borderRadius: 3,
                              background: 'rgba(52,211,153,0.15)', color: '#34d399',
                              border: '1px solid rgba(52,211,153,0.3)',
                            }}>
                              {stepStatus}
                            </span>
                          </div>
                          {stepDetail && (
                            <div style={{ fontSize: 9.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.45 }}>
                              {stepDetail}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Collapsible Technical Details (Parameters & Output) */}
            {isExpanded && (hasParams || hasOutput) && (
              <div style={{ marginTop: 8, borderTop: '1px solid var(--border-subtle)', paddingTop: 6 }}>
                {hasParams && (
                  <div style={{ marginBottom: 5 }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Parameters
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
                      {Object.entries(entry.input_params!).map(([k, v]) => (
                        <span key={k} style={{
                          fontSize: 8.5, padding: '1px 4px', borderRadius: 3,
                          background: 'rgba(255,255,255,0.04)', color: '#94a3b8',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {hasOutput && (
                  <div>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                      Raw Payload
                    </div>
                    <pre style={{
                      padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 5,
                      fontSize: 9.5, color: '#94a3b8', fontFamily: 'var(--font-mono)',
                      overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                      maxHeight: 140, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      {JSON.stringify(entry.output, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Time & Accordion Arrow */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <span style={{ fontSize: 8.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
            </span>
            {hasExpandable && (
              <span style={{ fontSize: 8.5, color: cfg.color, opacity: 0.8 }}>
                {isExpanded ? '▲ hide' : '▼ payload'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
