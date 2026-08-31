import React from 'react'
import type { AgentTimelineEntry, SupervisorSession } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

const TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  intent:        { icon: '🎯', color: 'var(--accent-blue)',   bg: 'rgba(59,130,246,0.08)' },
  tool_started:  { icon: '⚙️', color: 'var(--accent-amber)',  bg: 'rgba(251,191,36,0.08)' },
  tool_completed:{ icon: '✅', color: 'var(--accent-green)',  bg: 'rgba(16,185,129,0.08)' },
  rag:           { icon: '📚', color: '#a78bfa',              bg: 'rgba(167,139,250,0.08)' },
  policy:        { icon: '🔒', color: 'var(--accent-amber)',  bg: 'rgba(251,191,36,0.08)' },
  workflow_step: { icon: '🔄', color: '#38bdf8',              bg: 'rgba(56,189,248,0.08)' },
  response:      { icon: '💬', color: 'var(--accent-green)',  bg: 'rgba(16,185,129,0.08)' },
  plan:          { icon: '📋', color: 'var(--text-secondary)', bg: 'rgba(255,255,255,0.04)' },
}

export function AgentTimeline({ session }: Props) {
  const entries = session.agent_timeline

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Agent / Planner Timeline
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {entries.length} events
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, paddingTop: 32 }}>
            Orchestrator events will appear here during the call…
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {entries.length > 0 && (
            <div style={{
              position: 'absolute',
              left: 15,
              top: 0,
              bottom: 0,
              width: 1,
              background: 'var(--border-subtle)',
            }} />
          )}

          {entries.map((entry, i) => (
            <TimelineItem key={`${entry.timestamp}-${i}`} entry={entry} isLast={i === entries.length - 1} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TimelineItem({ entry, isLast }: { entry: AgentTimelineEntry; isLast: boolean }) {
  const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.plan

  const statusDot = entry.status === 'failed' || entry.status === 'blocked'
    ? 'var(--accent-red)'
    : entry.status === 'running'
    ? 'var(--accent-amber)'
    : cfg.color

  return (
    <div style={{
      display: 'flex',
      gap: 12,
      marginBottom: 12,
      animation: 'slide-up 0.2s ease',
      position: 'relative',
    }}>
      <div style={{
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: cfg.bg,
        border: `1px solid ${cfg.color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        flexShrink: 0,
        position: 'relative',
        zIndex: 1,
      }}>
        {cfg.icon}
      </div>

      <div style={{
        flex: 1,
        padding: '7px 10px',
        background: isLast ? cfg.bg : 'transparent',
        borderRadius: 'var(--radius-md)',
        border: isLast ? `1px solid ${cfg.color}20` : '1px solid transparent',
        transition: 'all 0.2s ease',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 12,
            fontWeight: 600,
            color: cfg.color,
          }}>
            {entry.label}
          </span>
          {entry.status && (
            <span style={{
              fontSize: 9,
              padding: '1px 5px',
              borderRadius: 3,
              background: `${statusDot}20`,
              color: statusDot,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {entry.status}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {new Date(entry.timestamp).toLocaleTimeString()}
          </span>
        </div>
        {entry.detail && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {entry.detail}
          </div>
        )}
      </div>
    </div>
  )
}
