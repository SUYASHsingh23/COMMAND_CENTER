import React, { useState, useEffect } from 'react'
import { useSupervisorStore } from '@/store/supervisor'
import { useSupervisorStream } from '@/hooks/useSupervisorStream'
import type { SupervisorSession } from '@/store/supervisor'
import { ConversationMonitor } from './ConversationMonitor'
import { AgentTimeline } from './AgentTimeline'
import { ToolExecutionView } from './ToolExecutionView'
import { RagSourcesView } from './RagSourcesView'
import { MemoryPanel } from './MemoryPanel'
import { CallSummary } from './CallSummary'
import { EscalationQueue } from './EscalationQueue'

const API_BASE = '/api/v1'

function getApiBase() { return API_BASE }

type Panel = 'transcript' | 'timeline' | 'tools' | 'rag' | 'agent_state' | 'summary'

export function CommandCenter() {
  useSupervisorStream()

  const sessions = useSupervisorStore((s) => s.sessions)
  const activeSessionId = useSupervisorStore((s) => s.activeSessionId)
  const setActive = useSupervisorStore((s) => s.setActiveSession)
  const upsertSession = useSupervisorStore((s) => s.upsertSession)
  const metrics = useSupervisorStore((s) => s.dashboardMetrics)
  const setMetrics = useSupervisorStore((s) => s.setDashboardMetrics)

  const [panel, setPanel] = useState<Panel>('transcript')
  const [clock, setClock] = useState(new Date().toLocaleTimeString())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load Dashboard KPI metrics & real conversations from PostgreSQL
  useEffect(() => {
    const load = async () => {
      try {
        const [rMetrics, rConvs, rTtl] = await Promise.all([
          fetch(`${API_BASE}/analytics/dashboard`),
          fetch(`${API_BASE}/analytics/conversations?limit=50`),
          fetch(`${API_BASE}/analytics/sessions/ttl-status`),
        ])

        if (rMetrics.ok) setMetrics(await rMetrics.json())
        if (rConvs.ok) {
          const convs = await rConvs.json()
          convs.forEach((c: any) => {
            upsertSession({
              session_id: c.session_id,
              conversation_id: c.conversation_id,
              channel: c.channel || 'web',
              status: c.status || 'completed',
              sentiment: c.sentiment || 'neutral',
              customer_name: c.customer_name,
              message_count: c.message_count,
              tool_count: c.tool_count,
              started_at: c.started_at,
              ended_at: c.ended_at,
            })
          })
        }
        if (rTtl.ok) {
          const ttlData = await rTtl.json()
          ttlData.forEach((t: any) => {
            upsertSession({
              session_id: t.session_id,
              inactive_seconds: t.inactive_seconds,
              remaining_seconds: t.remaining_seconds,
              is_idle: t.is_idle,
              is_expired: t.is_expired,
            })
          })
        }
      } catch (_) {}
    }
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [])


  // Fetch full session detail when a conversation is selected
  useEffect(() => {
    if (!activeSessionId) return
    const active = sessions[activeSessionId]
    if (!active || !active.conversation_id) return

    const loadDetail = async () => {
      try {
        const apiBase = getApiBase()
        const r = await fetch(`${apiBase}/analytics/conversations/${active.conversation_id}/detail`)
        if (r.ok) {
          const data = await r.json()
          const msgs = (data.messages || []).map((m: any) => ({
            message_id: m.message_id,
            conversation_id: active.conversation_id,
            role: m.role,
            content: m.content,
            turn_index: m.turn_index,
            timestamp: m.timestamp || new Date().toISOString(),
          }))
          const tools = (data.tool_executions || []).map((t: any) => ({
            exec_id: t.exec_id,
            conversation_id: active.conversation_id,
            tool_name: t.tool_name,
            input_params: t.input_params || {},
            output: t.output || {},
            status: t.status,
            duration_ms: t.duration_ms || 0,
            timestamp: t.timestamp || new Date().toISOString(),
          }))
          const intents = (data.intents || []).flatMap((i: any) => i.detected_intents || [])
          const entities = (data.intents || []).reduce((acc: any, i: any) => ({ ...acc, ...(i.entities || {}) }), {})
          const latestIntent = (data.intents || [])[0]

          // Use pre-built timeline from backend (chronological, all event types)
          const timeline = (data.timeline || []).map((e: any) => ({
            type: e.type as any,
            timestamp: e.timestamp || new Date().toISOString(),
            label: e.label,
            detail: e.detail,
            status: e.status,
          }))

          upsertSession({
            session_id: active.session_id,
            customer_name: data.customer_name,
            status: data.status || active.status,
            ended_at: data.ended_at,
            messages: msgs,
            tool_executions: tools,
            intents: intents,
            entities: entities,
            sentiment: latestIntent?.sentiment || active.sentiment,
            urgency: latestIntent?.urgency || active.urgency,
            agent_timeline: timeline,
            ...(data.summary ? { call_summary: data.summary } : {}),
          })
        }
      } catch (_) {}
    }
    loadDetail()
  }, [activeSessionId])


  const sessionList = Object.values(sessions)
  const active = activeSessionId ? sessions[activeSessionId] : null

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: 'var(--bg-primary)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
    }}>
      <EscalationQueue />
      <Sidebar sessions={sessionList} activeId={activeSessionId} onSelect={setActive} />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <TopBar clock={clock} metrics={metrics} />

        {active ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Header for active session */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
                  {active.customer_name || 'Anonymous User'}
                </h2>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Session ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{active.session_id}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {active.status === 'active' && (
                  <button
                    onClick={async () => {
                      if (!confirm("Are you sure you want to end this active session?")) return;
                      try {
                        const r = await fetch(`${getApiBase()}/analytics/sessions/${active.session_id}/force-end`, { method: 'POST' });
                        if (r.ok) {
                          alert("Session ended by admin.");
                          // It will update via websocket/polling, but we can optimistically set status
                          useSupervisorStore.getState().setSessionStatus(active.session_id, 'completed');
                        }
                      } catch (e) { console.error(e); }
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#f87171',
                      background: 'rgba(248,113,113,0.1)',
                      border: '1px solid rgba(248,113,113,0.3)',
                      borderRadius: 6,
                      cursor: 'pointer',
                    }}
                  >
                    ⏹ End Session
                  </button>
                )}
                {active.status === 'escalated' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--accent-red)', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                      Take Over Call
                    </button>
                    <button style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', borderRadius: 4, cursor: 'pointer' }}>
                      Resolve
                    </button>
                  </div>
                )}
              </div>
            </div>

            <PanelTabs active={panel} onSelect={setPanel} session={active} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {panel === 'transcript'  && <ConversationMonitor session={active} />}
              {panel === 'timeline'    && <AgentTimeline session={active} />}
              {panel === 'tools'       && <ToolExecutionView session={active} />}
              {panel === 'rag'         && <RagSourcesView session={active} />}
              {panel === 'agent_state' && <MemoryPanel session={active} />}
              {panel === 'summary'     && <CallSummary session={active} />}
            </div>
          </div>
        ) : (
          <EmptyState hasAny={sessionList.length > 0} />
        )}
      </main>
    </div>
  )
}

function TopBar({ clock, metrics }: { clock: string; metrics: any }) {
  return (
    <div style={{
      padding: '10px 20px',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      background: 'var(--bg-secondary)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--accent-green)',
          boxShadow: '0 0 8px rgba(16,185,129,0.7)',
          animation: 'blink 2s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
          COMMAND CENTER
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Live Supervisor Dashboard</span>
      </div>

      {metrics && (
        <div style={{ display: 'flex', gap: 16, marginLeft: 8 }}>
          <MetricChip label="Active" value={String(metrics.active_conversations)} color="var(--accent-green)" />
          <MetricChip label="Containment" value={`${metrics.containment_rate}%`} color="var(--accent-blue)" />
          <MetricChip label="Escalation" value={`${metrics.escalation_rate}%`} color={metrics.escalation_rate > 20 ? 'var(--accent-red)' : 'var(--accent-amber)'} />
          <MetricChip label="Total Calls" value={String(metrics.total_conversations)} color="var(--text-secondary)" />
        </div>
      )}

      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
        {clock}
      </span>
    </div>
  )
}

function MetricChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '4px 10px',
      borderRadius: 'var(--radius-md)',
      background: `${color}10`,
      border: `1px solid ${color}25`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

function PanelTabs({ active, onSelect, session }: {
  active: Panel
  onSelect: (p: Panel) => void
  session: SupervisorSession
}) {
  const tabs: Array<{ id: Panel; label: string; badge?: number }> = [
    { id: 'transcript',  label: '💬 Transcript',   badge: session.messages.length || undefined },
    { id: 'timeline',    label: '⏱ Timeline',      badge: session.agent_timeline.length || undefined },
    { id: 'tools',       label: '⚙️ Tools',         badge: session.tool_executions.length || undefined },
    { id: 'rag',         label: '📚 RAG',           badge: session.rag_passages.length || undefined },
    { id: 'agent_state', label: '🔍 Agent State' },
    { id: 'summary',     label: session.is_escalated ? '🚨 Summary' : '📋 Summary' },
  ]


  return (
    <div style={{
      display: 'flex',
      gap: 2,
      padding: '8px 16px 0',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
      flexShrink: 0,
    }}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onSelect(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            fontSize: 12,
            fontWeight: active === tab.id ? 600 : 400,
            color: active === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
            background: 'transparent',
            border: 'none',
            borderBottom: active === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
            marginBottom: -1,
          }}
        >
          {tab.label}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 10,
              background: 'rgba(59,130,246,0.2)',
              color: 'var(--accent-blue)',
              fontWeight: 700,
              minWidth: 16,
              textAlign: 'center',
            }}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

function Sidebar({ sessions, activeId, onSelect }: {
  sessions: SupervisorSession[]
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const active = sessions.filter((s) => s.status === 'active')
  const completed = sessions.filter((s) => s.status !== 'active')

  return (
    <div style={{
      width: 240,
      borderRight: '1px solid var(--border-subtle)',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Scrollable session list — grows to fill available space */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Active ({active.length})
          </div>
          {active.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Waiting for calls…</div>
          )}
          {active.map((s) => (
            <SessionCard key={s.session_id} session={s} selected={s.session_id === activeId} onClick={() => onSelect(s.session_id)} />
          ))}
        </div>

        {completed.length > 0 && (
          <div style={{ padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Completed ({completed.length})
            </div>
            {completed.map((s) => (
              <SessionCard key={s.session_id} session={s} selected={s.session_id === activeId} onClick={() => onSelect(s.session_id)} />
            ))}
          </div>
        )}
      </div>

      {/* Pinned footer */}
      <div style={{ flexShrink: 0, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <a href="/crm" style={{
          display: 'block',
          textAlign: 'center',
          padding: '8px',
          background: 'rgba(139,92,246,0.08)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--accent-purple)',
          fontSize: 11,
          fontWeight: 600,
          textDecoration: 'none',
        }}>
          📇 CRM System
        </a>
        <a href="/billing" style={{
          display: 'block',
          textAlign: 'center',
          padding: '8px',
          background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.2)',
          borderRadius: 'var(--radius-md)',
          color: '#f59e0b',
          fontSize: 11,
          fontWeight: 600,
          textDecoration: 'none',
        }}>
          💳 Billing System
        </a>
        <a href="/scheduling" style={{
          display: 'block',
          textAlign: 'center',
          padding: '8px',
          background: 'rgba(16,185,129,0.08)',
          border: '1px solid rgba(16,185,129,0.2)',
          borderRadius: 'var(--radius-md)',
          color: '#10b981',
          fontSize: 11,
          fontWeight: 600,
          textDecoration: 'none',
        }}>
          📅 Scheduling
        </a>
        <a href="/" style={{
          display: 'block',
          textAlign: 'center',
          padding: '8px',
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.2)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--accent-blue)',
          fontSize: 11,
          fontWeight: 600,
          textDecoration: 'none',
        }}>
          ← Voice Agent
        </a>
      </div>
    </div>
  )
}

function SessionCard({ session, selected, onClick }: {
  session: SupervisorSession
  selected: boolean
  onClick: () => void
}) {
  const sentColor = {
    positive: '#34d399', neutral: '#60a5fa', frustrated: '#fbbf24', angry: '#f87171'
  }[session.sentiment] ?? '#60a5fa'

  const isActive = session.status === 'active'
  const isEscalated = session.status === 'escalated'

  const statusDot = isActive
    ? { color: '#34d399', pulse: true }
    : isEscalated
    ? { color: '#f97316', pulse: false }
    : { color: '#94a3b8', pulse: false }

  const msgCount = session.message_count ?? session.messages.length
  const toolCount = session.tool_count ?? session.tool_executions.length

  const timeLabel = session.ended_at
    ? new Date(session.ended_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : session.started_at
    ? new Date(session.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  const dateLabel = session.started_at
    ? new Date(session.started_at).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : null

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '10px 10px',
        marginBottom: 4,
        background: selected ? 'rgba(96,165,250,0.08)' : 'rgba(255,255,255,0.01)',
        border: selected ? '1px solid rgba(96,165,250,0.3)' : '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
    >
      {/* Row 1: Name + status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%', background: statusDot.color,
            boxShadow: statusDot.pulse ? `0 0 6px ${statusDot.color}` : 'none',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
            {session.customer_name || session.session_id.slice(0, 8) + '…'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          {isEscalated && <span style={{ fontSize: 8, color: '#f97316', fontWeight: 700, padding: '1px 4px', background: 'rgba(249,115,22,0.12)', borderRadius: 3 }}>ESC</span>}
          {isActive && (
            <span style={{
              fontSize: 8,
              color: session.is_idle ? '#fbbf24' : '#34d399',
              fontWeight: 700,
              padding: '1px 4px',
              background: session.is_idle ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
              borderRadius: 3
            }}>
              {session.is_idle && session.remaining_seconds != null
                ? `IDLE ${Math.floor(session.remaining_seconds / 60)}m`
                : 'LIVE'}
            </span>
          )}
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: sentColor, flexShrink: 0 }} />
        </div>
      </div>

      {/* Row 2: Stats + time */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            💬 {msgCount}
          </span>
          {toolCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              ⚙️ {toolCount}
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'capitalize' }}>
            {session.channel}
          </span>
        </div>
        {(timeLabel || dateLabel) && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
            {dateLabel !== new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }) ? dateLabel + ' ' : ''}{timeLabel}
          </span>
        )}
      </div>
    </button>
  )
}


function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      color: 'var(--text-muted)',
    }}>
      <div style={{ fontSize: 48 }}>📡</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {hasAny ? 'Select a session from the sidebar' : 'No active calls'}
      </div>
      <div style={{ fontSize: 13, maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
        {hasAny
          ? 'Click a session to view live transcript, agent timeline, tool calls, RAG sources, and memory.'
          : 'Start a call from the Voice Agent page. All sessions appear here in real time.'}
      </div>
    </div>
  )
}
