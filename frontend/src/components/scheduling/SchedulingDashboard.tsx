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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API = '/api/v1/scheduling'

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  urgent: '#f97316',
  high: '#f59e0b',
  normal: '#6366f1',
  low: '#64748b',
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  assigned: '#6366f1',
  in_progress: '#10b981',
  completed: '#64748b',
  cancelled: '#ef4444',
  no_show: '#ef4444',
  rescheduled: '#a78bfa',
  escalated: '#ef4444',
}

const AGENT_STATUS_COLORS: Record<string, string> = {
  available: '#10b981',
  busy: '#f97316',
  break: '#f59e0b',
  training: '#6366f1',
  offline: '#64748b',
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      padding: '14px 18px',
      flex: '1 1 120px',
      minWidth: 0,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '2px 6px', borderRadius: 4,
      background: `${PRIORITY_COLORS[priority] || '#64748b'}20`,
      color: PRIORITY_COLORS[priority] || '#64748b',
      border: `1px solid ${PRIORITY_COLORS[priority] || '#64748b'}40`,
    }}>
      {priority}
    </span>
  )
}

function StatusBadge({ status }: { status?: string }) {
  const safeStatus = status || 'unknown';
  const label = safeStatus.replace(/_/g, ' ')
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '2px 7px', borderRadius: 4,
      background: `${STATUS_COLORS[safeStatus] || '#64748b'}20`,
      color: STATUS_COLORS[safeStatus] || '#64748b',
      border: `1px solid ${STATUS_COLORS[safeStatus] || '#64748b'}40`,
    }}>
      {label}
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
      background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 4, fontSize: 10, color,
    }}>
      <span>⚑</span>
      <span style={{ fontWeight: 600 }}>{label || (flagName && flagName.replace(/_/g, ' '))}</span>
      {score && <span style={{ opacity: 0.7 }}>({Math.round(score * 100)}%)</span>}
    </div>
  )
}

// ─── Queue Item ───────────────────────────────────────────────────────────────

function QueueItem({
  appt, selected, onClick,
}: {
  appt: Appointment; selected: boolean; onClick: () => void
}) {
  const isOverdue = appt.scheduled_at && new Date(appt.scheduled_at) < new Date() &&
    ['pending', 'assigned'].includes(appt.status)

  return (
    <div onClick={onClick} style={{
      padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
      background: selected ? 'rgba(99,102,241,0.08)' : 'transparent',
      borderLeft: `3px solid ${selected ? '#6366f1' : PRIORITY_COLORS[appt.priority] || '#64748b'}`,
      transition: 'background 0.15s',
    }}
      onMouseEnter={e => !selected && ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={e => !selected && ((e.currentTarget as HTMLElement).style.background = 'transparent')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {appt.appointment_number}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <PriorityBadge priority={appt.priority} />
          <StatusBadge status={appt.status} />
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
        {appt.customer_name || 'Unknown Customer'}
        {appt.customer_tier && (
          <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 5, color: '#f59e0b' }}>
            [{appt.customer_tier.toUpperCase()}]
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {appt.reason}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {appt.agent_name && (
            <span style={{ fontSize: 10, color: '#10b981' }}>→ {appt.agent_name}</span>
          )}
          {appt.ai_risk_flags?.length > 0 && (
            <span style={{ fontSize: 10, color: '#ef4444' }}>⚑ {appt.ai_risk_flags.length} flag{appt.ai_risk_flags.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {isOverdue && (
            <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', background: '#ef444420', padding: '1px 5px', borderRadius: 3 }}>
              OVERDUE
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{relTime(appt.scheduled_at || appt.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Briefing Card ────────────────────────────────────────────────────────────

function BriefingCard({
  appt, customerHistory, onUpdate, onAddNote,
}: {
  appt: Appointment
  customerHistory: Appointment[]
  onUpdate: (updates: Record<string, any>) => void
  onAddNote: (content: string, type: string) => void
}) {
  const [noteText, setNoteText] = useState('')
  const [noteType, setNoteType] = useState('observation')
  const [addingNote, setAddingNote] = useState(false)
  const [tab, setTab] = useState<'briefing' | 'transcript' | 'history' | 'notes'>('briefing')
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

  const cust = appt.customer_snapshot || {}
  const bill = appt.billing_snapshot || {}
  const acct = cust.account || {}

  const priColor = PRIORITY_COLORS[appt.priority] || '#6366f1'
  const stColor = STATUS_COLORS[appt.status] || '#64748b'

  const canStart = appt.status === 'assigned'
  const canComplete = appt.status === 'in_progress'
  const canEscalate = ['assigned', 'in_progress'].includes(appt.status)

  const tabs = ['briefing', 'transcript', 'history', 'notes'] as const

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', fontFamily: 'monospace', marginBottom: 4 }}>
              {appt.appointment_number}
              {appt.service_type_name && <span style={{ marginLeft: 8, color: '#a78bfa' }}>· {appt.service_type_name}</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
              {cust.name || appt.customer_name || 'Unknown Customer'}
              {cust.customer_tier && (
                <span style={{
                  marginLeft: 8, fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                  background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40',
                }}>
                  {cust.customer_tier.toUpperCase()}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <PriorityBadge priority={appt.priority} />
            <StatusBadge status={appt.status} />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {canStart && (
            <button onClick={() => onUpdate({ status: 'in_progress' })} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600,
            }}>
              ▶ Start Session
            </button>
          )}
          {canComplete && (
            <button onClick={() => onUpdate({ status: 'completed' })} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 600,
            }}>
              ✓ Mark Completed
            </button>
          )}
          {canEscalate && (
            <button onClick={() => onUpdate({ status: 'escalated' })} style={{
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 600,
            }}>
              ⬆ Escalate
            </button>
          )}
          <button onClick={() => setAddingNote(v => !v)} style={{
            padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)',
            cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
          }}>
            + Add Note
          </button>
        </div>

        {addingNote && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['observation', 'action_taken', 'escalation', 'follow_up', 'resolution'] as const).map(t => (
                <button key={t} onClick={() => setNoteType(t)} style={{
                  padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
                  background: noteType === t ? '#6366f1' : 'transparent',
                  color: noteType === t ? '#fff' : 'var(--text-muted)',
                }}>
                  {t.replace('_', ' ')}
                </button>
              ))}
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Type your note here..."
              style={{
                background: 'var(--surface-3)', border: '1px solid var(--border-subtle)', borderRadius: 6,
                color: 'var(--text-primary)', padding: '8px 10px', fontSize: 11, resize: 'vertical',
                minHeight: 60, fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => { onAddNote(noteText, noteType); setNoteText(''); setAddingNote(false) }} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 600,
              }}>
                Save Note
              </button>
              <button onClick={() => setAddingNote(false)} style={{
                padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)',
                cursor: 'pointer', background: 'transparent', color: 'var(--text-muted)', fontSize: 11,
              }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, textTransform: 'capitalize',
            color: tab === t ? '#6366f1' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid #6366f1' : '2px solid transparent',
          }}>
            {t} {t === 'notes' && appt.notes?.length ? `(${appt.notes.length})` : ''}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
        {tab === 'briefing' && (
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
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

            {/* Reason */}
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
                  {appt.channel && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>📡 {appt.channel.replace('_', ' ')}</span>}
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

            {/* Customer snapshot */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                Customer Profile
              </div>
              <div style={{
                background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden',
              }}>
                {[
                  ['Name', cust.name],
                  ['Phone', cust.phone],
                  ['Email', cust.email],
                  ['Account', cust.account_number],
                  ['Tier', cust.customer_tier],
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

            {/* Billing snapshot */}
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

            {/* Assigned agent */}
            {appt.agent && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Assigned Agent
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
                      {appt.agent.role.replace('_', ' ')} · {appt.agent.department}
                      {appt.agent.team && ` · ${appt.agent.team}`}
                    </div>
                    <div style={{ marginTop: 2, display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 9, color: '#6366f1' }}>⭐ {Number(appt.agent.rating).toFixed(1)}</span>
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{appt.agent.languages?.join(', ')}</span>
                    </div>
                  </div>
                  <div style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                    background: `${AGENT_STATUS_COLORS[appt.agent.status] || '#64748b'}20`,
                    color: AGENT_STATUS_COLORS[appt.agent.status] || '#64748b',
                  }}>
                    {appt.agent.status}
                  </div>
                </div>
              </div>
            )}

            {/* Resolution (if completed) */}
            {appt.resolution_notes && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Resolution
                </div>
                <div style={{
                  background: '#10b98112', border: '1px solid #10b98130', borderRadius: 8, padding: '10px 14px',
                }}>
                  {appt.resolution_category && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#10b981', marginBottom: 4, textTransform: 'uppercase' }}>
                      {appt.resolution_category.replace(/_/g, ' ')}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.6 }}>{appt.resolution_notes}</div>
                  {appt.csat_score && (
                    <div style={{ marginTop: 6, fontSize: 11, color: '#f59e0b' }}>
                      {'★'.repeat(appt.csat_score)}{'☆'.repeat(5 - appt.csat_score)} CSAT {appt.csat_score}/5
                      {appt.csat_feedback && <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>"{appt.csat_feedback}"</div>}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'transcript' && (
          <div style={{ padding: '16px 20px' }}>
            {appt.conversation_transcript && appt.conversation_transcript.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {appt.conversation_transcript.map((t, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: 8, flexDirection: t.role === 'customer' ? 'row-reverse' : 'row',
                  }}>
                    <div style={{
                      padding: '7px 12px', borderRadius: 10, maxWidth: '75%', fontSize: 11, lineHeight: 1.5,
                      background: t.role === 'customer' ? '#6366f120' : 'var(--surface-2)',
                      border: `1px solid ${t.role === 'customer' ? '#6366f140' : 'var(--border-subtle)'}`,
                      color: 'var(--text-primary)',
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 2, textTransform: 'uppercase' }}>
                        {t.role.replace('_', ' ')}
                      </div>
                      {t.content}
                      {t.ts && <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{fmt(t.ts)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '40px 0' }}>
                No conversation transcript available
              </div>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div style={{ padding: '16px 20px' }}>
            {Array.isArray(customerHistory) && customerHistory.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {customerHistory.map((p, i) => {
                  if (!p) return null;
                  return (
                  <div key={p.appointment_id || i} style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 11,
                    overflow: 'hidden',
                  }}>
                    {/* Clickable Header */}
                    <div 
                      onClick={() => setExpandedHistoryId(expandedHistoryId === p.appointment_id ? null : p.appointment_id)}
                      style={{ 
                        padding: '12px 14px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column',
                        background: expandedHistoryId === p.appointment_id ? 'rgba(255,255,255,0.03)' : 'transparent',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                      onMouseLeave={e => (e.currentTarget.style.background = expandedHistoryId === p.appointment_id ? 'rgba(255,255,255,0.03)' : 'transparent')}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 13 }}>{p.reason || 'No Reason'}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.created_at ? fmt(p.created_at) : '—'}</span>
                          <span style={{ 
                            fontSize: 10, color: 'var(--text-muted)', transform: expandedHistoryId === p.appointment_id ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s'
                          }}>▼</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                          background: `${STATUS_COLORS[typeof p.status === 'string' ? p.status : 'unknown'] || '#64748b'}20`,
                          color: STATUS_COLORS[typeof p.status === 'string' ? p.status : 'unknown'] || '#64748b',
                        }}>
                          {(typeof p.status === 'string' ? p.status : 'unknown').replace('_', ' ')}
                        </span>
                        {p.duration_mins && <span>⏱ {p.duration_mins}m</span>}
                        {p.csat_score && <span style={{ color: '#f59e0b', fontWeight: 600 }}>★ {p.csat_score}/5</span>}
                        {p.agent_name && <span>👤 {p.agent_name}</span>}
                      </div>
                    </div>
                    
                    {/* Expandable Body */}
                    {expandedHistoryId === p.appointment_id && (
                      <div style={{ padding: '0 14px 14px 14px', borderTop: '1px solid var(--border-subtle)' }}>
                        
                        {p.ai_summary && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>AI Summary</div>
                            <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>{p.ai_summary}</div>
                          </div>
                        )}

                        {p.resolution_notes && (
                          <div style={{ marginTop: 12, background: '#10b98112', padding: '8px 12px', borderRadius: 6, border: '1px solid #10b98130' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: 2 }}>Resolution</div>
                            <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.5 }}>{p.resolution_notes}</div>
                          </div>
                        )}

                        {Array.isArray(p.conversation_transcript) && p.conversation_transcript.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Conversation Transcript</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-1)', padding: 10, borderRadius: 6, maxHeight: 200, overflowY: 'auto' }}>
                              {p.conversation_transcript.map((t: any, i: number) => (
                                <div key={i} style={{ display: 'flex', flexDirection: t.role === 'customer' ? 'row-reverse' : 'row' }}>
                                  <div style={{
                                    padding: '5px 10px', borderRadius: 8, maxWidth: '85%', fontSize: 10, lineHeight: 1.4,
                                    background: t.role === 'customer' ? '#6366f120' : 'var(--surface-3)',
                                    border: `1px solid ${t.role === 'customer' ? '#6366f140' : 'transparent'}`,
                                    color: 'var(--text-primary)',
                                  }}>
                                    <div style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>
                                      {t.role.replace('_', ' ')}
                                    </div>
                                    {t.content}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {Array.isArray(p.notes) && p.notes.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Agent Notes</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {p.notes.map((note: any, ni: number) => (
                                <div key={note.note_id || ni} style={{ 
                                  background: 'var(--surface-3)', padding: '6px 10px', borderRadius: 6, fontSize: 10, color: 'var(--text-primary)'
                                }}>
                                  <div style={{ fontWeight: 600, marginBottom: 2 }}>
                                    {note.author || 'System'} <span style={{ opacity: 0.6, fontWeight: 400 }}>({(typeof note.note_type === 'string' ? note.note_type : 'observation').replace('_', ' ')})</span>
                                  </div>
                                  {note.content || ''}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )})}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '40px 0' }}>
                No previous interactions on record
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div style={{ padding: '16px 20px' }}>
            {appt.notes && appt.notes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {appt.notes.map(note => (
                  <div key={note.note_id} style={{
                    background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 14px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{note.author}</span>
                        {note.author_role && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>({note.author_role})</span>}
                        <span style={{
                          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', padding: '1px 5px', borderRadius: 3,
                          background: '#6366f120', color: '#6366f1',
                        }}>
                          {note.note_type.replace('_', ' ')}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{relTime(note.created_at)}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-primary)', lineHeight: 1.6 }}>{note.content}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '40px 0' }}>
                No notes yet
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agent Card ───────────────────────────────────────────────────────────────

function AgentCard({ agent }: { agent: Agent }) {
  const statusColor = AGENT_STATUS_COLORS[agent.status] || '#64748b'
  const loadPct = agent.max_concurrent_sessions > 0
    ? (agent.current_load / agent.max_concurrent_sessions) * 100 : 0

  return (
    <div style={{
      background: 'var(--surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 8,
      padding: '10px 12px', marginBottom: 6,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${statusColor}20`, color: statusColor, fontSize: 13, fontWeight: 700,
        }}>
          {agent.name.charAt(0)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {agent.name}
            </div>
            <div style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, flexShrink: 0, marginLeft: 4,
              background: `${statusColor}20`, color: statusColor, textTransform: 'uppercase',
            }}>
              {agent.status}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {agent.role.replace('_', ' ')} · {agent.department}
          </div>
          {/* Load bar */}
          <div style={{ marginTop: 5 }}>
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
          <div style={{ marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: '#f59e0b' }}>⭐ {Number(agent.rating).toFixed(1)}</span>
            {agent.sessions_today != null && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Today: {agent.sessions_today}</span>
            )}
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{agent.languages?.join(', ')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function SchedulingDashboard() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<SchedulingStats | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Appointment | null>(null)
  const [customerHistory, setCustomerHistory] = useState<Appointment[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [agentFilter, setAgentFilter] = useState('')

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
      setAppointments(Array.isArray(apptData) ? apptData : [])
      setAgents(Array.isArray(agentData) ? agentData : [])
      setStats(statsData)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filterStatus, filterPriority])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Listen for real-time appointment updates
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
              // Exclude the current appointment from history if desired, or keep it.
              setCustomerHistory(histData.filter(a => a.appointment_id !== id))
            } else {
              setCustomerHistory([])
            }
          } catch (e) {
            console.error("Failed to fetch customer history", e)
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

  const filteredAppts = appointments.filter(a => {
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!a.customer_name?.toLowerCase().includes(q) &&
        !a.reason.toLowerCase().includes(q) &&
        !a.appointment_number.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))

  const filteredAgents = agents.filter(a =>
    !agentFilter || a.department === agentFilter || a.status === agentFilter
  )

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
      background: 'var(--bg-primary)', fontFamily: 'var(--font-primary)',
    }}>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0, padding: '0 20px', height: 52,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)', background: 'var(--surface-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Surveyor Scheduling</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Live Appointment Queue & Agent Routing</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {stats && (
            <>
              <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
                {stats.overdue > 0 ? `⚑ ${stats.overdue} overdue` : ''}
              </span>
              <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>
                {stats.agents_available} agents available
              </span>
            </>
          )}
          <a href="/supervisor" style={{ fontSize: 11, color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 600 }}>← Supervisor</a>
          <a href="/crm" style={{ fontSize: 11, color: '#a78bfa', textDecoration: 'none', fontWeight: 600 }}>📇 Policy Holders</a>
          <a href="/billing" style={{ fontSize: 11, color: '#f59e0b', textDecoration: 'none', fontWeight: 600 }}>💳 Premium & Claims</a>
          <a href="/" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', fontWeight: 600 }}>← Policy Holder Portal</a>
        </div>
      </div>

      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
      {stats && (
        <div style={{
          flexShrink: 0, padding: '10px 20px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-1)', display: 'flex', gap: 10, overflowX: 'auto',
        }}>
          <StatCard label="Total" value={stats.total_appointments} />
          <StatCard label="Pending" value={stats.pending} color="#f59e0b" />
          <StatCard label="Assigned" value={stats.assigned} color="#6366f1" />
          <StatCard label="In Progress" value={stats.in_progress} color="#10b981" />
          <StatCard label="Completed Today" value={stats.completed_today} color="#64748b" />
          <StatCard label="Overdue" value={stats.overdue} color={stats.overdue > 0 ? '#ef4444' : undefined} />
          <StatCard label="Agents Available" value={stats.agents_available} color="#10b981" />
          <StatCard label="Agents Busy" value={stats.agents_busy} color="#f97316" />
          {stats.csat_avg && <StatCard label="Avg CSAT" value={`${stats.csat_avg.toFixed(1)} ★`} color="#f59e0b" />}
          {stats.avg_handle_mins && <StatCard label="Avg Handle" value={`${Math.round(stats.avg_handle_mins)}m`} />}
        </div>
      )}

      {/* ── 3-column main ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left — appointment queue */}
        <div style={{
          width: 300, flexShrink: 0, borderRight: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Queue header */}
          <div style={{ flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search name, reason, number..."
              style={{
                width: '100%', background: 'var(--surface-3)', border: '1px solid var(--border-subtle)',
                borderRadius: 6, color: 'var(--text-primary)', padding: '6px 10px', fontSize: 11,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {['', 'pending', 'assigned', 'in_progress', 'completed'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} style={{
                  padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  background: filterStatus === s ? '#6366f1' : 'transparent',
                  color: filterStatus === s ? '#fff' : 'var(--text-muted)',
                }}>
                  {s || 'all'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {['', 'critical', 'urgent', 'high', 'normal'].map(p => (
                <button key={p} onClick={() => setFilterPriority(p)} style={{
                  padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border-subtle)',
                  fontSize: 10, fontWeight: 600, cursor: 'pointer',
                  background: filterPriority === p ? '#f59e0b' : 'transparent',
                  color: filterPriority === p ? '#fff' : 'var(--text-muted)',
                }}>
                  {p || 'all priorities'}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
              {filteredAppts.length} appointment{filteredAppts.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Queue list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading...</div>
            ) : filteredAppts.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No appointments found</div>
            ) : filteredAppts.map(a => (
              <QueueItem key={a.appointment_id} appt={a} selected={selectedId === a.appointment_id}
                onClick={() => setSelectedId(selectedId === a.appointment_id ? null : a.appointment_id)} />
            ))}
          </div>
        </div>

        {/* Centre — briefing card */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {detail ? (
            <BriefingCard appt={detail} customerHistory={customerHistory} onUpdate={handleUpdate} onAddNote={handleAddNote} />
          ) : (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', gap: 12,
            }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Select an appointment</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Click any item in the queue to view the pre-call briefing</div>
            </div>
          )}
        </div>

        {/* Right — agent roster */}
        <div style={{
          width: 260, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ flexShrink: 0, padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>Agent Roster</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['', 'available', 'busy', 'break', 'offline'].map(s => (
                <button key={s} onClick={() => setAgentFilter(s)} style={{
                  padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border-subtle)',
                  fontSize: 9, fontWeight: 600, cursor: 'pointer',
                  background: agentFilter === s ? '#10b981' : 'transparent',
                  color: agentFilter === s ? '#fff' : 'var(--text-muted)',
                }}>
                  {s || 'all'}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
            {filteredAgents.map(a => <AgentCard key={a.agent_id} agent={a} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
