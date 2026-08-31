import React, { useState } from 'react'
import type { AgentTimelineEntry, SupervisorSession } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  intent:          { icon: '🎯', color: '#60a5fa',  bg: 'rgba(96,165,250,0.08)'  },
  tool_started:    { icon: '⚙️', color: '#fbbf24',  bg: 'rgba(251,191,36,0.08)'  },
  tool_completed:  { icon: '✅', color: '#34d399',  bg: 'rgba(52,211,153,0.08)'  },
  rag:             { icon: '📚', color: '#a78bfa',  bg: 'rgba(167,139,250,0.08)' },
  policy:          { icon: '🔒', color: '#f59e0b',  bg: 'rgba(245,158,11,0.08)'  },
  workflow_step:   { icon: '🔄', color: '#38bdf8',  bg: 'rgba(56,189,248,0.08)'  },
  response:        { icon: '💬', color: '#34d399',  bg: 'rgba(52,211,153,0.08)'  },
  plan:            { icon: '📋', color: '#94a3b8',  bg: 'rgba(148,163,184,0.04)' },
  session_started: { icon: '🟢', color: '#34d399',  bg: 'rgba(52,211,153,0.10)'  },
  session_ended:   { icon: '🏁', color: '#94a3b8',  bg: 'rgba(148,163,184,0.08)' },
  message_user:    { icon: '👤', color: '#60a5fa',  bg: 'rgba(96,165,250,0.07)'  },
  message_agent:   { icon: '🤖', color: '#a78bfa',  bg: 'rgba(167,139,250,0.07)' },
}

const STATUS_COLORS: Record<string, string> = {
  success: '#34d399', failed: '#f87171', timeout: '#fbbf24',
  blocked: '#f87171', allowed: '#34d399', running: '#fbbf24',
  escalated: '#f97316', completed: '#34d399', in_progress: '#38bdf8',
}

export function AgentTimeline({ session }: Props) {
  const entries = session.agent_timeline
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const toggle = (i: number) => setExpanded(prev => {
    const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next
  })

  const duration = session.ended_at && session.started_at
    ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000)
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, background: 'var(--bg-secondary)',
      }}>
        <div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Session Timeline
          </span>
          {session.customer_name && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 10 }}>
              · {session.customer_name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {duration !== null && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ⏱ {Math.floor(duration / 60)}m {duration % 60}s
            </span>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {entries.length} events
          </span>
        </div>
      </div>

      {session.started_at && (
        <div style={{
          padding: '6px 16px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', gap: 20, flexShrink: 0, background: 'rgba(255,255,255,0.02)',
        }}>
          <MetaChip label="Started" value={new Date(session.started_at).toLocaleString()} />
          {session.ended_at && <MetaChip label="Ended" value={new Date(session.ended_at).toLocaleString()} />}
          <MetaChip label="Channel" value={session.channel} />
          <MetaChip label="Status" value={session.status.toUpperCase()}
            color={session.status === 'active' ? '#34d399' : session.status === 'escalated' ? '#f97316' : '#94a3b8'} />
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, paddingTop: 40 }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div>Timeline events will appear here as the conversation progresses.</div>
            <div style={{ fontSize: 11, marginTop: 8, opacity: 0.6 }}>Select a completed session to see its full reconstructed timeline.</div>
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {entries.length > 0 && (
            <div style={{
              position: 'absolute', left: 16, top: 8, bottom: 8, width: 2,
              background: 'linear-gradient(to bottom, rgba(96,165,250,0.3), rgba(148,163,184,0.1))',
              borderRadius: 2,
            }} />
          )}
          {entries.map((entry, i) => (
            <TimelineItem
              key={`${entry.timestamp}-${i}`}
              entry={entry}
              isLast={i === entries.length - 1}
              isExpanded={expanded.has(i)}
              onToggle={() => toggle(i)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MetaChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: 11, color: color || 'var(--text-secondary)', fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function TimelineItem({ entry, isLast, isExpanded, onToggle }: {
  entry: AgentTimelineEntry; isLast: boolean; isExpanded: boolean; onToggle: () => void
}) {
  const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.plan
  const statusColor = entry.status ? (STATUS_COLORS[entry.status] ?? cfg.color) : cfg.color
  const hasExpandable = !!(entry.detail && entry.detail.length > 60)

  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 10, position: 'relative', animation: 'slide-up 0.2s ease' }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        background: cfg.bg, border: `1.5px solid ${cfg.color}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, flexShrink: 0, position: 'relative', zIndex: 1,
        boxShadow: isLast ? `0 0 10px ${cfg.color}30` : 'none',
      }}>
        {cfg.icon}
      </div>
      <div
        onClick={hasExpandable ? onToggle : undefined}
        style={{
          flex: 1, padding: '8px 12px',
          background: isLast ? cfg.bg : 'rgba(255,255,255,0.02)',
          borderRadius: 8,
          border: isLast ? `1px solid ${cfg.color}20` : '1px solid var(--border-subtle)',
          cursor: hasExpandable ? 'pointer' : 'default',
          transition: 'all 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>{entry.label}</span>
              {entry.status && (
                <span style={{
                  fontSize: 9, padding: '1px 5px', borderRadius: 3,
                  background: `${statusColor}15`, color: statusColor,
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>{entry.status}</span>
              )}
            </div>
            {entry.detail && (
              <div style={{
                fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: isExpanded ? 999 : 2,
                WebkitBoxOrient: 'vertical',
              }}>
                {entry.detail}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}
            </span>
            {hasExpandable && (
              <span style={{ fontSize: 9, color: cfg.color, opacity: 0.7 }}>{isExpanded ? '▲' : '▼'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
