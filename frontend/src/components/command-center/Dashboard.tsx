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


type Panel = 'transcript' | 'timeline' | 'tools' | 'rag' | 'memory' | 'summary'

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

  // Load Dashboard KPI metrics & recent conversations from PostgreSQL on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [rMetrics, rConvs] = await Promise.all([
          fetch(`${API_BASE}/analytics/dashboard`),
          fetch(`${API_BASE}/analytics/conversations?limit=20`),
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
              started_at: c.started_at,
            })
          })
        }
      } catch (_) {}
    }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])

  // Fetch session details when a conversation is selected
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

          const timeline = (data.tool_executions || []).map((t: any) => ({
            type: 'tool_completed' as const,
            timestamp: t.timestamp || new Date().toISOString(),
            label: `Tool: ${t.tool_name}`,
            detail: `${t.status} · ${t.duration_ms}ms`,
            status: t.status,
          }))

          upsertSession({
            session_id: active.session_id,
            messages: msgs,
            tool_executions: tools,
            intents: intents,
            entities: entities,
            sentiment: latestIntent?.sentiment || active.sentiment,
            urgency: latestIntent?.urgency || active.urgency,
            agent_timeline: timeline,
            // Populate the Summary tab from the DB record if present
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
            <PanelTabs active={panel} onSelect={setPanel} session={active} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {panel === 'transcript' && <ConversationMonitor session={active} />}
              {panel === 'timeline'   && <AgentTimeline session={active} />}
              {panel === 'tools'      && <ToolExecutionView session={active} />}
              {panel === 'rag'        && <RagSourcesView session={active} />}
              {panel === 'memory'     && <MemoryPanel session={active} />}
              {panel === 'summary'    && <CallSummary session={active} />}
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
    { id: 'transcript', label: '💬 Transcript', badge: session.messages.length || undefined },
    { id: 'timeline',   label: '⏱ Timeline',   badge: session.agent_timeline.length || undefined },
    { id: 'tools',      label: '⚙️ Tools',      badge: session.tool_executions.length || undefined },
    { id: 'rag',        label: '📚 RAG',        badge: session.rag_passages.length || undefined },
    { id: 'memory',     label: '🧠 Memory' },
    { id: 'summary',    label: session.is_escalated ? '🚨 Summary' : '📋 Summary' },
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
  const sentColor = { positive: 'var(--accent-green)', neutral: 'var(--accent-blue)', frustrated: 'var(--accent-amber)', angry: 'var(--accent-red)' }[session.sentiment] ?? 'var(--accent-blue)'
  const isEscalated = session.status === 'escalated'

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '9px 10px',
        marginBottom: 3,
        background: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
        border: selected ? '1px solid rgba(59,130,246,0.25)' : '1px solid transparent',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {session.session_id.slice(0, 8)}…
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {isEscalated && <span style={{ fontSize: 9, color: 'var(--accent-red)', fontWeight: 700 }}>ESC</span>}
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sentColor }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
        {session.messages.length} turns · {session.channel}
        {session.urgency === 'high' && <span style={{ color: 'var(--accent-amber)', marginLeft: 4 }}>⚡</span>}
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
