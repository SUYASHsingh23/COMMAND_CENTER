import React, { useEffect, useState, useCallback } from 'react'
import { supervisorWsClient } from '@/services/websocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  agent_id: string
  agent_code: string
  name: string
  role: string
  department: string
  status: string
  current_load: number
  max_concurrent_sessions: number
  languages: string[]
  specializations: string[]
  rating: number
  is_available: boolean
  email?: string
  phone?: string
  location?: string
  team?: string
  total_sessions?: number
  sessions_today?: number
  avg_handle_time_mins?: number
  first_call_resolution_pct?: number
}

interface RiskFlag {
  flag: string
  label?: string
  score?: number
  value?: string | number
}

interface SuggestedAction {
  action: string
  priority: string
}

interface NoteOut {
  note_id: string
  author: string
  author_role?: string
  note_type: string
  content: string
  is_internal: boolean
  created_at: string
}

interface Appointment {
  appointment_id: string
  appointment_number: string
  customer_id: string
  status: string
  priority: string
  channel: string
  reason: string
  intent_category?: string
  urgency_signal?: string
  scheduled_at?: string
  created_at: string
  agent_id?: string
  agent_name?: string
  customer_name?: string
  customer_tier?: string
  service_type_name?: string
  ai_risk_flags: (RiskFlag | string)[]
  reason_detail?: string
  // full detail fields
  ai_summary?: string
  ai_suggested_actions?: SuggestedAction[]
  customer_snapshot?: Record<string, any>
  billing_snapshot?: Record<string, any>
  conversation_transcript?: Array<{ role: string; content: string; ts: string }>
  previous_interactions?: Array<Record<string, any>>
  resolution_notes?: string
  resolution_category?: string
  csat_score?: number
  csat_feedback?: string
  follow_up_required?: boolean
  follow_up_date?: string
  follow_up_notes?: string
  tags?: string[]
  notes?: NoteOut[]
  agent?: Agent
  duration_mins?: number
  started_at?: string
  ended_at?: string
}

interface SchedulingStats {
  total_appointments: number
  pending: number
  assigned: number
  in_progress: number
  completed_today: number
  cancelled_today: number
  overdue: number
  avg_handle_mins?: number
  agents_available: number
  agents_busy: number
  agents_offline: number
  total_agents: number
  csat_avg?: number
}

// ─── Helpers & Styles ──────────────────────────────────────────────────────────

const API = '/api/v1/scheduling'

const PRIORITY_THEMES: Record<string, { bg: string; color: string; border: string }> = {
  critical: { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  urgent:   { bg: '#ffedd5', color: '#ea580c', border: '#fed7aa' },
  high:     { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  normal:   { bg: '#e0e7ff', color: '#4f46e5', border: '#c7d2fe' },
  low:      { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
}

const STATUS_THEMES: Record<string, { bg: string; color: string; border: string }> = {
  pending:     { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  assigned:    { bg: '#ffedd5', color: '#ea580c', border: '#fed7aa' },
  in_progress: { bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' },
  completed:   { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  scheduled:   { bg: '#e2e8f0', color: '#475569', border: '#cbd5e1' },
  cancelled:   { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  no_show:     { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
  rescheduled: { bg: '#ede9fe', color: '#7c3aed', border: '#ddd6fe' },
  escalated:   { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
}

const AGENT_STATUS_THEMES: Record<string, { bg: string; color: string; border: string }> = {
  available: { bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' },
  busy:      { bg: '#ffedd5', color: '#ea580c', border: '#fed7aa' },
  break:     { bg: '#fef3c7', color: '#d97706', border: '#fde68a' },
  training:  { bg: '#e0e7ff', color: '#4f46e5', border: '#c7d2fe' },
  offline:   { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
}

const NOTE_TYPE_THEMES: Record<string, { bg: string; color: string }> = {
  observation:  { bg: '#ede9fe', color: '#6d28d9' },
  action_taken: { bg: '#dcfce7', color: '#16a34a' },
  escalation:   { bg: '#fee2e2', color: '#dc2626' },
  follow_up:    { bg: '#fef3c7', color: '#d97706' },
  resolution:   { bg: '#e0f2fe', color: '#0284c7' },
}

function fmt(ts?: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function relTime(ts?: string | null) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.round(Math.abs(diff) / 60000)
  if (m < 1) return 'just now'
  if (diff < 0) return `in ${m}m`
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const priorityRank = (p: string) =>
  ({ critical: 1, urgent: 2, high: 3, normal: 4, low: 5 }[p] ?? 6)

// ─── Small Components ─────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const t = PRIORITY_THEMES[priority] || PRIORITY_THEMES.low
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
      padding: '2px 8px', borderRadius: 6,
      background: t.bg, color: t.color, border: `1px solid ${t.border}`,
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    }}>
      {priority}
    </span>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const safe = status || 'scheduled'
  const t = STATUS_THEMES[safe] || STATUS_THEMES.scheduled
  const label = safe.replace(/_/g, ' ')
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
      padding: '2px 8px', borderRadius: 6,
      background: t.bg, color: t.color, border: `1px solid ${t.border}`,
      display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
      padding: '2px 7px', borderRadius: 5,
      background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a',
      display: 'inline-flex', alignItems: 'center',
    }}>
      {tier}
    </span>
  )
}

function RiskBadge({ flag }: { flag: RiskFlag | string }) {
  const flagName = typeof flag === 'string' ? flag : flag.flag
  const label = typeof flag === 'string' ? undefined : flag.label
  const score = typeof flag === 'string' ? undefined : flag.score

  const severe = ['legal_threat', 'angry_customer', 'churn_risk', 'regulatory_risk', 'service_suspended']
  const color = severe.includes(flagName) ? '#ef4444' : '#f97316'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px',
      background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 6, fontSize: 10, color,
    }}>
      <span>⚑</span>
      <span style={{ fontWeight: 600 }}>{label || (flagName && flagName.replace(/_/g, ' '))}</span>
      {score && <span style={{ opacity: 0.7 }}>({Math.round(score * 100)}%)</span>}
    </div>
  )
}

// ─── Resizer Splitter Component ───────────────────────────────────────────────

function Resizer({
  isDragging,
  onMouseDown,
  onDoubleClick,
  title,
}: {
  isDragging: boolean
  onMouseDown: (e: React.MouseEvent) => void
  onDoubleClick?: () => void
  title?: string
}) {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <div
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={title || 'Drag to resize, double click to toggle'}
      style={{
        width: 8,
        cursor: 'col-resize',
        background: isDragging || isHovered ? 'rgba(59, 130, 246, 0.25)' : 'transparent',
        transition: 'background 0.15s ease',
        position: 'relative',
        zIndex: 10,
        flexShrink: 0,
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{
        width: 2,
        height: 28,
        borderRadius: 2,
        background: isDragging || isHovered ? '#3b82f6' : 'var(--border-subtle)',
      }} />
    </div>
  )
}

// ─── Queue Item Card ──────────────────────────────────────────────────────────

function QueueCard({
  appt, selected, onClick,
}: {
  appt: Appointment
  selected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '12px 14px',
        cursor: 'pointer',
        background: selected ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface-1)',
        border: selected ? '1.5px solid #3b82f6' : '1px solid var(--border-subtle)',
        borderRadius: 10,
        marginBottom: 8,
        transition: 'all 0.15s ease',
        boxShadow: selected ? '0 2px 6px rgba(59, 130, 246, 0.12)' : '0 1px 2px rgba(0,0,0,0.03)',
      }}
      onMouseEnter={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-muted)'
      }}
      onMouseLeave={e => {
        if (!selected) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'
      }}
    >
      {/* Top ID and Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {appt.appointment_number}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <PriorityBadge priority={appt.priority} />
          <StatusBadge status={appt.status} />
        </div>
      </div>

      {/* Customer Name & Tier */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          {appt.customer_name || 'Unknown Customer'}
        </span>
        <TierBadge tier={appt.customer_tier} />
      </div>

      {/* Reason */}
      <div style={{
        fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {appt.reason}
      </div>

      {/* Footer info: Agent & relative time */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
        <div>
          {appt.agent_name ? (
            <span style={{ color: '#059669', fontWeight: 600 }}>→ {appt.agent_name}</span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
          )}
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
          {relTime(appt.scheduled_at || appt.created_at)}
        </span>
      </div>
    </div>
  )
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const theme = AGENT_STATUS_THEMES[agent.status] || AGENT_STATUS_THEMES.offline
  const loadPct = agent.max_concurrent_sessions > 0
    ? (agent.current_load / agent.max_concurrent_sessions) * 100 : 0

  return (
    <div style={{
      background: 'var(--surface-1)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      padding: '12px',
      marginBottom: 8,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Avatar Circle */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: theme.bg, color: theme.color, border: `1px solid ${theme.border}`,
          fontSize: 13, fontWeight: 700,
        }}>
          {agent.name.charAt(0)}
        </div>

        {/* Details */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.name}
            </div>
            <span style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px', borderRadius: 4,
              background: theme.bg, color: theme.color, border: `1px solid ${theme.border}`,
            }}>
              {agent.status}
            </span>
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {agent.role.replace(/_/g, ' ')} · {agent.department}
          </div>

          {/* Workload */}
          <div style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
              <span>Load</span>
              <span>{agent.current_load}/{agent.max_concurrent_sessions}</span>
            </div>
            <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2,
                width: `${loadPct}%`,
                background: loadPct >= 90 ? '#ef4444' : loadPct >= 60 ? '#f97316' : '#10b981',
                transition: 'width 0.3s ease',
              }} />
            </div>
          </div>

          <div style={{ marginTop: 5, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 600 }}>⭐ {Number(agent.rating).toFixed(1)}</span>
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{agent.languages?.join(', ')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Center Details Card ──────────────────────────────────────────────────────

function DetailPane({
  appt,
  customerHistory,
  onUpdate,
  onAddNote,
}: {
  appt: Appointment
  customerHistory: Appointment[]
  onUpdate: (updates: Record<string, any>) => void
  onAddNote: (content: string, type: string) => void
}) {
  const [activeTab, setActiveTab] = useState<'briefing' | 'transcript' | 'history' | 'notes'>('notes')
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState('observation')
  const [expandedHistId, setExpandedHistId] = useState<string | null>(null)

  const cust = appt.customer_snapshot || {}
  const bill = appt.billing_snapshot || {}
  const acct = cust.account || {}

  const canStart = appt.status === 'assigned'
  const canComplete = appt.status === 'in_progress'
  const canEscalate = ['assigned', 'in_progress'].includes(appt.status)

  const noteCount = appt.notes?.length || 0

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface-1)',
      borderRadius: 12,
      border: '1px solid var(--border-subtle)',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {/* ── Top Header of Center Card ────────────────────────────────────────── */}
      <div style={{ padding: '16px 20px 12px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
            {appt.appointment_number}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <PriorityBadge priority={appt.priority} />
            <StatusBadge status={appt.status} />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {cust.name || appt.customer_name || 'Unknown Customer'}
          </h2>
          <TierBadge tier={cust.customer_tier || appt.customer_tier} />
        </div>

        {/* AI Summary / Context snippet */}
        <p style={{
          fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 10px 0',
        }}>
          {appt.ai_summary || appt.reason_detail || appt.reason}
        </p>

        {/* Quick action buttons if available */}
        {(canStart || canComplete || canEscalate) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4, marginBottom: 4 }}>
            {canStart && (
              <button
                onClick={() => onUpdate({ status: 'in_progress' })}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600,
                }}
              >
                ▶ Start Session
              </button>
            )}
            {canComplete && (
              <button
                onClick={() => onUpdate({ status: 'completed' })}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 600,
                }}
              >
                ✓ Mark Completed
              </button>
            )}
            {canEscalate && (
              <button
                onClick={() => onUpdate({ status: 'escalated' })}
                style={{
                  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 600,
                }}
              >
                ⬆ Escalate
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs Navigation Bar ────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-1)',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['briefing', 'transcript', 'history', 'notes'] as const).map(tabKey => {
            const isActive = activeTab === tabKey
            const label = tabKey === 'briefing' ? 'Briefing'
              : tabKey === 'transcript' ? 'Transcript'
              : tabKey === 'history' ? 'History'
              : `Notes (${noteCount})`

            return (
              <button
                key={tabKey}
                onClick={() => setActiveTab(tabKey)}
                style={{
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                  color: isActive ? '#2563eb' : 'var(--text-muted)',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Add Note Button */}
        <button
          onClick={() => {
            setActiveTab('notes')
            setAddingNote(v => !v)
          }}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            background: addingNote ? 'rgba(59,130,246,0.08)' : 'var(--surface-1)',
            color: addingNote ? '#2563eb' : 'var(--text-primary)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <span>+</span>
          <span>Add Note</span>
        </button>
      </div>

      {/* ── Tab Content Area ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {/* TAB: NOTES */}
        {activeTab === 'notes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Note creation box */}
            {addingNote && (
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)',
                borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
              }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(['observation', 'action_taken', 'escalation', 'follow_up', 'resolution'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setNoteType(t)}
                      style={{
                        padding: '3px 8px', borderRadius: 4,
                        border: noteType === t ? '1px solid #2563eb' : '1px solid var(--border-subtle)',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                        background: noteType === t ? '#2563eb' : 'var(--surface-1)',
                        color: noteType === t ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {t.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  placeholder="Type supervisor or agent note..."
                  rows={3}
                  style={{
                    width: '100%', background: 'var(--surface-1)', border: '1px solid var(--border-subtle)',
                    borderRadius: 6, color: 'var(--text-primary)', padding: '8px 10px', fontSize: 11,
                    resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                />
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setAddingNote(false)}
                    style={{
                      padding: '4px 10px', borderRadius: 5, border: '1px solid var(--border-subtle)',
                      background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (noteText.trim()) {
                        onAddNote(noteText.trim(), noteType)
                        setNoteText('')
                        setAddingNote(false)
                      }
                    }}
                    style={{
                      padding: '4px 12px', borderRadius: 5, border: 'none',
                      background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Save Note
                  </button>
                </div>
              </div>
            )}

            {/* Note items */}
            {appt.notes && appt.notes.length > 0 ? (
              appt.notes.map(note => {
                const nTheme = NOTE_TYPE_THEMES[note.note_type] || NOTE_TYPE_THEMES.observation
                return (
                  <div
                    key={note.note_id}
                    style={{
                      background: 'var(--surface-1)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      padding: '12px 14px',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {note.author}
                        </span>
                        {note.author_role && (
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            ({note.author_role})
                          </span>
                        )}
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 6px',
                          borderRadius: 4, background: nTheme.bg, color: nTheme.color,
                        }}>
                          {note.note_type.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {relTime(note.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {note.content}
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '30px 0' }}>
                No notes added yet. Click "+ Add Note" to create one.
              </div>
            )}
          </div>
        )}

        {/* TAB: BRIEFING */}
        {activeTab === 'briefing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Risk Flags */}
            {appt.ai_risk_flags && appt.ai_risk_flags.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Risk Flags
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {appt.ai_risk_flags.map((f, i) => <RiskBadge key={i} flag={f} />)}
                </div>
              </div>
            )}

            {/* Reason for Contact */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Reason for Contact
              </div>
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8,
                padding: '10px 14px', fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.6,
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{appt.reason}</div>
                {appt.reason_detail && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{appt.reason_detail}</div>
                )}
                <div style={{ marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {appt.channel && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📡 {appt.channel.replace(/_/g, ' ')}</span>}
                  {appt.urgency_signal && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                      background: appt.urgency_signal === 'angry' ? '#ef444420' :
                        appt.urgency_signal === 'frustrated' ? '#f9731620' : '#10b98120',
                      color: appt.urgency_signal === 'angry' ? '#ef4444' :
                        appt.urgency_signal === 'frustrated' ? '#f97316' : '#10b981',
                    }}>
                      {appt.urgency_signal.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Customer Profile */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Customer Profile
              </div>
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden',
              }}>
                {[
                  ['Name', cust.name || appt.customer_name],
                  ['Phone', cust.phone],
                  ['Email', cust.email],
                  ['Account', cust.account_number],
                  ['Tier', cust.customer_tier || appt.customer_tier],
                  ['Language', cust.preferred_language],
                  ['Plan', acct.plan_name],
                  ['Account Status', acct.status],
                  ['Payment Method', acct.payment_method],
                  ['Billing Cycle', acct.billing_cycle],
                ].map(([k, v], i) => v ? (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '6px 12px',
                    borderBottom: '1px solid var(--border-subtle)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{v}</span>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* Billing Position */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Billing Position
              </div>
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden',
              }}>
                {[
                  ['Balance', bill.balance ? `₹${parseFloat(bill.balance).toLocaleString('en-IN')}` : null],
                  ['Outstanding', bill.outstanding_amount ? `₹${parseFloat(bill.outstanding_amount).toLocaleString('en-IN')}` : '₹0'],
                  ['Overdue Invoices', bill.overdue_invoices != null ? `${bill.overdue_invoices}` : null],
                  ['Next Due Date', bill.next_due_date],
                  ['Last Payment', bill.last_payment_amount ? `₹${parseFloat(bill.last_payment_amount).toLocaleString('en-IN')} · ${bill.last_payment_method || ''}` : null],
                  ['Failed Txns', bill.failed_transactions != null ? `${bill.failed_transactions}` : null],
                ].map(([k, v], i) => v != null ? (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', padding: '6px 12px',
                    borderBottom: '1px solid var(--border-subtle)', fontSize: 12,
                  }}>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{k}</span>
                    <span style={{
                      color: k === 'Overdue Invoices' && parseInt(v as string) > 0 ? '#ef4444' :
                        k === 'Failed Txns' && parseInt(v as string) > 0 ? '#f97316' : 'var(--text-primary)',
                      fontWeight: 600,
                    }}>
                      {v as string}
                    </span>
                  </div>
                ) : null)}
              </div>
            </div>

            {/* Assigned Surveyor */}
            {appt.agent && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Assigned Surveyor / Agent
                </div>
                <div style={{
                  background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 14px',
                  display: 'flex', gap: 10, alignItems: 'center',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#6366f120', fontSize: 14, fontWeight: 700, color: '#6366f1', flexShrink: 0,
                  }}>
                    {appt.agent.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{appt.agent.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {appt.agent.role.replace(/_/g, ' ')} · {appt.agent.department}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: TRANSCRIPT */}
        {activeTab === 'transcript' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
            {appt.conversation_transcript && appt.conversation_transcript.length > 0 ? (
              appt.conversation_transcript.map((t, i) => {
                const r = (t.role || '').toLowerCase()
                const isCustomer = r === 'customer' || r === 'user'
                const roleLabel = isCustomer ? (cust.name || 'Customer') : (appt.agent?.name || 'InsureAI Assistant')

                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: isCustomer ? 'flex-start' : 'flex-end',
                      width: '100%',
                    }}
                  >
                    <div style={{
                      maxWidth: '78%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isCustomer ? 'flex-start' : 'flex-end',
                    }}>
                      {/* Speaker Badge & Time */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginBottom: 4,
                        flexDirection: isCustomer ? 'row' : 'row-reverse',
                      }}>
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: isCustomer ? 'rgba(59, 130, 246, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                          color: isCustomer ? '#2563eb' : '#059669',
                          border: `1px solid ${isCustomer ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`,
                        }}>
                          {isCustomer ? '👤 ' + roleLabel : '🤖 ' + roleLabel}
                        </span>
                        {t.ts && (
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                            {fmt(t.ts)}
                          </span>
                        )}
                      </div>

                      {/* Chat Message Bubble */}
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: isCustomer ? '4px 12px 12px 12px' : '12px 4px 12px 12px',
                        fontSize: 12,
                        lineHeight: 1.55,
                        background: isCustomer ? 'var(--surface-2)' : 'rgba(37, 99, 235, 0.08)',
                        border: isCustomer ? '1px solid var(--border-subtle)' : '1px solid rgba(37, 99, 235, 0.25)',
                        color: 'var(--text-primary)',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        wordBreak: 'break-word',
                        textAlign: 'left',
                      }}>
                        {t.content}
                      </div>
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '40px 0' }}>
                No conversation transcript available
              </div>
            )}
          </div>
        )}

        {/* TAB: HISTORY */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.isArray(customerHistory) && customerHistory.length > 0 ? (
              customerHistory.map((p, i) => {
                if (!p) return null
                const isExp = expandedHistId === p.appointment_id
                return (
                  <div
                    key={p.appointment_id || i}
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      fontSize: 11,
                    }}
                  >
                    <div
                      onClick={() => setExpandedHistId(isExp ? null : p.appointment_id)}
                      style={{
                        padding: '10px 14px',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 12 }}>
                          {p.reason || 'No Reason'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                          {p.created_at ? fmt(p.created_at) : '—'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <StatusBadge status={p.status} />
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{isExp ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {isExp && (
                      <div style={{ padding: '0 14px 12px 14px', borderTop: '1px solid var(--border-subtle)' }}>
                        {p.ai_summary && (
                          <div style={{ marginTop: 8 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Summary</div>
                            <div style={{ fontSize: 11, color: 'var(--text-primary)', marginTop: 2 }}>{p.ai_summary}</div>
                          </div>
                        )}
                        {p.resolution_notes && (
                          <div style={{ marginTop: 8, background: '#dcfce7', padding: '6px 10px', borderRadius: 6 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Resolution</div>
                            <div style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>{p.resolution_notes}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '40px 0' }}>
                No previous interactions on record
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Scheduling Dashboard ────────────────────────────────────────────────

export default function SchedulingDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<SchedulingStats | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Appointment | null>(null)
  const [customerHistory, setCustomerHistory] = useState<Appointment[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [timePeriod, setTimePeriod] = useState('all')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('')

  // ── Panel Sizing & Expand/Collapse State ─────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const [queueWidth, setQueueWidth] = useState(300)
  const [rosterWidth, setRosterWidth] = useState(270)

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false)
  const [isRosterCollapsed, setIsRosterCollapsed] = useState(false)

  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false)
  const [isDraggingQueue, setIsDraggingQueue] = useState(false)
  const [isDraggingRoster, setIsDraggingRoster] = useState(false)

  // ── Drag Handlers ───────────────────────────────────────────────────────────

  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingSidebar(true)
    const startX = e.clientX
    const startW = sidebarWidth

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = moveEvt.clientX - startX
      const newW = Math.max(160, Math.min(450, startW + delta))
      setSidebarWidth(newW)
    }

    const onMouseUp = () => {
      setIsDraggingSidebar(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleQueueResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingQueue(true)
    const startX = e.clientX
    const startW = queueWidth

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = moveEvt.clientX - startX
      const newW = Math.max(180, Math.min(650, startW + delta))
      setQueueWidth(newW)
    }

    const onMouseUp = () => {
      setIsDraggingQueue(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  const handleRosterResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDraggingRoster(true)
    const startX = e.clientX
    const startW = rosterWidth

    const onMouseMove = (moveEvt: MouseEvent) => {
      const delta = startX - moveEvt.clientX
      const newW = Math.max(180, Math.min(600, startW + delta))
      setRosterWidth(newW)
    }

    const onMouseUp = () => {
      setIsDraggingRoster(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // ── Data Fetching ───────────────────────────────────────────────────────────

  const fetchAll = useCallback(async () => {
    try {
      const [apptRes, agentRes, statsRes] = await Promise.all([
        fetch(`${API}/appointments?limit=100${filterStatus ? `&status=${filterStatus}` : ''}${filterPriority ? `&priority=${filterPriority}` : ''}`),
        fetch(`${API}/agents`),
        fetch(`${API}/stats`),
      ])
      const [apptData, agentData, statsData] = await Promise.all([
        apptRes.json(), agentRes.json(), statsRes.json(),
      ])
      const apptList = Array.isArray(apptData) ? apptData : []
      setAppointments(apptList)
      setAgents(Array.isArray(agentData) ? agentData : [])
      setStats(statsData)

      // Auto-select first appointment if nothing is selected
      if (apptList.length > 0 && !selectedId) {
        setSelectedId(apptList[0].appointment_id)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterPriority, selectedId])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Real-time WebSocket updates
  useEffect(() => {
    supervisorWsClient.connectSupervisor()
    const unsubscribe = supervisorWsClient.on((evt) => {
      if (evt.event === 'appointment.updated') {
        fetchAll()
        if (selectedId && evt.appointment_id === selectedId) {
          fetchDetail(selectedId)
        }
      }
    })
    return () => {
      unsubscribe()
    }
  }, [fetchAll, selectedId])

  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API}/appointments/${id}`)
      const data = await res.json()
      if (res.ok && data && data.appointment_id) {
        setDetail(data)
        if (data.customer_id) {
          try {
            const histRes = await fetch(`${API}/customers/${data.customer_id}/appointments`)
            const histData = await histRes.json()
            if (histRes.ok && Array.isArray(histData)) {
              setCustomerHistory(histData.filter(a => a.appointment_id !== id))
            } else {
              setCustomerHistory([])
            }
          } catch (e) {
            console.error('Failed to fetch customer history', e)
            setCustomerHistory([])
          }
        }
      } else {
        setDetail(null)
        setCustomerHistory([])
      }
    } catch (e) {
      console.error(e)
      setDetail(null)
    }
  }, [])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
    else setDetail(null)
  }, [selectedId, fetchDetail])

  const handleUpdate = async (updates: Record<string, any>) => {
    if (!selectedId) return
    try {
      await fetch(`${API}/appointments/${selectedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      await fetchDetail(selectedId)
      await fetchAll()
    } catch (e) { console.error(e) }
  }

  const handleAddNote = async (content: string, note_type: string) => {
    if (!selectedId || !content.trim()) return
    try {
      await fetch(`${API}/appointments/${selectedId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'Supervisor', author_role: 'supervisor', note_type, content }),
      })
      await fetchDetail(selectedId)
    } catch (e) { console.error(e) }
  }

  // Filter appointments
  const filteredAppts = appointments.filter(a => {
    if (searchQ) {
      const q = searchQ.toLowerCase()
      const matchName = a.customer_name?.toLowerCase().includes(q)
      const matchReason = a.reason?.toLowerCase().includes(q)
      const matchId = a.appointment_number?.toLowerCase().includes(q)
      if (!matchName && !matchReason && !matchId) return false
    }

    if (timePeriod === 'today') {
      const d = new Date(a.scheduled_at || a.created_at).getTime()
      const now = Date.now()
      if (now - d > 24 * 60 * 60 * 1000) return false
    } else if (timePeriod === 'week') {
      const d = new Date(a.scheduled_at || a.created_at).getTime()
      const now = Date.now()
      if (now - d > 7 * 24 * 60 * 60 * 1000) return false
    } else if (timePeriod === 'month') {
      const d = new Date(a.scheduled_at || a.created_at).getTime()
      const now = Date.now()
      if (now - d > 30 * 24 * 60 * 60 * 1000) return false
    }

    return true
  }).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))

  const filteredAgents = agents.filter(a =>
    !agentFilter || a.department === agentFilter || a.status === agentFilter
  )

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 49px)',
      background: 'var(--bg-primary)',
      fontFamily: 'var(--font-primary, system-ui, -apple-system, sans-serif)',
      overflow: 'hidden',
      userSelect: (isDraggingSidebar || isDraggingQueue || isDraggingRoster) ? 'none' : 'auto',
    }}>
      {/* ── 1. LEFT FILTER & SEARCH SIDEBAR ─────────────────────────────────── */}
      {isSidebarCollapsed ? (
        <div
          onClick={() => setIsSidebarCollapsed(false)}
          title="Click to expand Filters sidebar"
          style={{
            width: 38,
            flexShrink: 0,
            background: 'var(--surface-1)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '12px 0',
            cursor: 'pointer',
            gap: 12,
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-1)')}
        >
          <button
            onClick={e => { e.stopPropagation(); setIsSidebarCollapsed(false) }}
            title="Expand Filters"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-primary)', fontSize: 13, padding: 4,
            }}
          >
            ▶
          </button>
          <span style={{
            writingMode: 'vertical-rl', transform: 'rotate(180deg)',
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em',
          }}>
            FILTERS
          </span>
          <span style={{ fontSize: 12 }}>🔍</span>
        </div>
      ) : (
        <>
          <aside style={{
            width: sidebarWidth,
            flexShrink: 0,
            background: 'var(--surface-1)',
            borderRight: '1px solid var(--border-subtle)',
            padding: '14px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflowY: 'auto',
          }}>
            {/* Header with Minimize arrow */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}>
                Filters
              </span>
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                title="Minimize Filters sidebar"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12, padding: '2px 6px', borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
              >
                ◀
              </button>
            </div>

            {/* Search input */}
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                fontSize: 12, color: 'var(--text-muted)', pointerEvents: 'none',
              }}>
                🔍
              </span>
              <input
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Search name or appointment ID..."
                style={{
                  width: '100%',
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  padding: '7px 10px 7px 28px',
                  fontSize: 11,
                  boxSizing: 'border-box',
                  outline: 'none',
                  transition: 'border-color 0.15s ease',
                }}
              />
            </div>

            {/* Filter by Status */}
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 8,
              }}>
                FILTER BY STATUS
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { id: '', label: 'All Statuses' },
                  { id: 'pending', label: 'Pending', theme: STATUS_THEMES.pending },
                  { id: 'assigned', label: 'Assigned', theme: STATUS_THEMES.assigned },
                  { id: 'in_progress', label: 'In Progress', theme: STATUS_THEMES.in_progress },
                  { id: 'completed', label: 'Completed', theme: STATUS_THEMES.completed },
                ].map(s => {
                  const isSelected = filterStatus === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setFilterStatus(s.id)}
                      style={{
                        padding: '6px 6px',
                        borderRadius: 6,
                        border: isSelected ? '1.5px solid #2563eb' : '1px solid var(--border-subtle)',
                        fontSize: 10,
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(37, 99, 235, 0.08)' : (s.theme?.bg || 'var(--surface-1)'),
                        color: isSelected ? '#2563eb' : (s.theme?.color || 'var(--text-primary)'),
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {s.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Filter by Priority */}
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 8,
              }}>
                FILTER BY PRIORITY
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[
                  { id: '', label: 'All Priorities' },
                  { id: 'critical', label: 'Critical', theme: PRIORITY_THEMES.critical },
                  { id: 'urgent', label: 'Urgent', theme: PRIORITY_THEMES.urgent },
                  { id: 'high', label: 'High', theme: PRIORITY_THEMES.high },
                  { id: 'normal', label: 'Normal', theme: PRIORITY_THEMES.normal },
                  { id: 'low', label: 'Low', theme: PRIORITY_THEMES.low },
                ].map(p => {
                  const isSelected = filterPriority === p.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setFilterPriority(p.id)}
                      style={{
                        padding: '6px 6px',
                        borderRadius: 6,
                        border: isSelected ? '1.5px solid #2563eb' : `1px solid ${p.theme?.border || 'var(--border-subtle)'}`,
                        fontSize: 10,
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(37, 99, 235, 0.08)' : (p.theme?.bg || 'var(--surface-1)'),
                        color: isSelected ? '#2563eb' : (p.theme?.color || 'var(--text-primary)'),
                        textAlign: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Time Period */}
            <div>
              <div style={{
                fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 8,
              }}>
                TIME PERIOD
              </div>
              <select
                value={timePeriod}
                onChange={e => setTimePeriod(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 8,
                  color: 'var(--text-primary)',
                  padding: '7px 8px',
                  fontSize: 11,
                  fontWeight: 500,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="all">Today, This Week, Past 30 Days</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">Past 30 Days</option>
              </select>
            </div>
          </aside>

          {/* Sidebar Resizer */}
          <Resizer
            isDragging={isDraggingSidebar}
            onMouseDown={handleSidebarResizeStart}
            onDoubleClick={() => setIsSidebarCollapsed(true)}
            title="Drag to resize filters sidebar (double click to minimize)"
          />
        </>
      )}

      {/* ── 2. RIGHT MAIN CONTENT AREA ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* ── Subheader Bar ── */}
        <div style={{
          padding: '10px 18px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-1)',
          flexShrink: 0,
        }}>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
              Surveyor Scheduling
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>
                Live Appointment Queue &amp; Agent Routing
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {stats && (
              <>
                <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>●</span> {stats.overdue} overdue
                </span>
                <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>●</span> {stats.agents_available} agents available
                </span>
              </>
            )}
            <a href="/supervisor" style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}>← Supervisor</a>
            <a href="/crm" style={{ fontSize: 11, color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}>📇 Policy Holders</a>
            <a href="/billing" style={{ fontSize: 11, color: '#ea580c', textDecoration: 'none', fontWeight: 600 }}>💳 Premium &amp; Claims</a>
            <a href="/" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 600 }}>← Policy Holder Portal</a>
          </div>
        </div>

        {/* ── 3-Column Resizable & Expandable Workspace Area ── */}
        <div style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          padding: '14px 16px',
          gap: 0,
          background: 'var(--bg-primary)',
        }}>
          {/* ── Col 1: Queue Column ── */}
          {isQueueCollapsed ? (
            <div
              onClick={() => setIsQueueCollapsed(false)}
              title="Click to expand Appointments Queue"
              style={{
                width: 38,
                flexShrink: 0,
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 0',
                cursor: 'pointer',
                gap: 12,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-1)')}
            >
              <button
                onClick={e => { e.stopPropagation(); setIsQueueCollapsed(false) }}
                title="Expand Appointments Queue"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-primary)', fontSize: 13, padding: 4,
                }}
              >
                ▶
              </button>
              <span style={{
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em',
              }}>
                QUEUE ({filteredAppts.length})
              </span>
              <span style={{ fontSize: 12 }}>📋</span>
            </div>
          ) : (
            <>
              <div style={{
                width: queueWidth,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}>
                {/* Column Header with minimize button */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, paddingRight: 4,
                }}>
                  <div style={{
                    fontSize: 11, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}>
                    KEY METRICS OVERVIEW
                  </div>
                  <button
                    onClick={() => setIsQueueCollapsed(true)}
                    title="Minimize appointments queue panel"
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 12, padding: '2px 6px', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                  >
                    ◀
                  </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                  {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      Loading appointments...
                    </div>
                  ) : filteredAppts.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      No appointments match the criteria
                    </div>
                  ) : (
                    filteredAppts.map(a => (
                      <QueueCard
                        key={a.appointment_id}
                        appt={a}
                        selected={selectedId === a.appointment_id}
                        onClick={() => setSelectedId(a.appointment_id)}
                      />
                    ))
                  )}
                </div>

                <div style={{
                  textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', paddingTop: 8, flexShrink: 0,
                }}>
                  Showing {filteredAppts.length} Appointments
                </div>
              </div>

              {/* Resizer between Queue & Center */}
              <Resizer
                isDragging={isDraggingQueue}
                onMouseDown={handleQueueResizeStart}
                onDoubleClick={() => setIsQueueCollapsed(true)}
                title="Drag to resize queue column (double click to minimize)"
              />
            </>
          )}

          {/* ── Col 2: Center Details Card ── */}
          <div style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            margin: '0 4px',
          }}>
            {detail ? (
              <DetailPane
                appt={detail}
                customerHistory={customerHistory}
                onUpdate={handleUpdate}
                onAddNote={handleAddNote}
              />
            ) : (
              <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--surface-1)',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)',
                gap: 8,
              }}>
                <div style={{ fontSize: 40, opacity: 0.3 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>Select an appointment</div>
                <div style={{ fontSize: 11 }}>Click any appointment in the queue to inspect briefing &amp; notes</div>
              </div>
            )}
          </div>

          {/* ── Col 3: Agent Roster ── */}
          {isRosterCollapsed ? (
            <div
              onClick={() => setIsRosterCollapsed(false)}
              title="Click to expand Agent Roster"
              style={{
                width: 38,
                flexShrink: 0,
                background: 'var(--surface-1)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 0',
                cursor: 'pointer',
                gap: 12,
                transition: 'background 0.15s ease',
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-2)')}
              onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'var(--surface-1)')}
            >
              <button
                onClick={e => { e.stopPropagation(); setIsRosterCollapsed(false) }}
                title="Expand Agent Roster"
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--text-primary)', fontSize: 13, padding: 4,
                }}
              >
                ◀
              </button>
              <span style={{
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em',
              }}>
                ROSTER ({agents.length})
              </span>
              <span style={{ fontSize: 12 }}>👥</span>
            </div>
          ) : (
            <>
              {/* Resizer between Center & Roster */}
              <Resizer
                isDragging={isDraggingRoster}
                onMouseDown={handleRosterResizeStart}
                onDoubleClick={() => setIsRosterCollapsed(true)}
                title="Drag to resize agent roster column (double click to minimize)"
              />

              <div style={{
                width: rosterWidth,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  marginBottom: 10, paddingLeft: 4,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                    Agent Roster
                  </span>
                  <button
                    onClick={() => setIsRosterCollapsed(true)}
                    title="Minimize agent roster panel"
                    style={{
                      border: 'none', background: 'transparent', cursor: 'pointer',
                      color: 'var(--text-muted)', fontSize: 12, padding: '2px 6px', borderRadius: 4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-primary)')}
                    onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-muted)')}
                  >
                    ▶
                  </button>
                </div>

                {/* Filter pills for agents */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
                  {[
                    { id: '', label: 'all', bg: '#10b981', color: '#fff' },
                    { id: 'available', label: 'available' },
                    { id: 'busy', label: 'busy' },
                    { id: 'break', label: 'break' },
                    { id: 'offline', label: 'offline' },
                  ].map(s => {
                    const isActive = agentFilter === s.id
                    return (
                      <button
                        key={s.id}
                        onClick={() => setAgentFilter(s.id)}
                        style={{
                          padding: '2px 8px',
                          borderRadius: 12,
                          border: '1px solid var(--border-subtle)',
                          fontSize: 10,
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: isActive ? (s.bg || '#2563eb') : 'var(--surface-1)',
                          color: isActive ? (s.color || '#fff') : 'var(--text-muted)',
                          textTransform: 'lowercase',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
                  {filteredAgents.map(a => (
                    <AgentCard key={a.agent_id} agent={a} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
