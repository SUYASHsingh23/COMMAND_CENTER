import React from 'react'
import type { SupervisorSession } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

const RESOLUTION_CONFIG: Record<string, { color: string; icon: string; bg: string }> = {
  resolved:           { color: 'var(--accent-green)',  icon: '✅', bg: 'rgba(16,185,129,0.08)' },
  partially_resolved: { color: 'var(--accent-amber)',  icon: '⚠️', bg: 'rgba(251,191,36,0.08)' },
  unresolved:         { color: 'var(--accent-red)',    icon: '❌', bg: 'rgba(239,68,68,0.08)' },
  escalated:          { color: '#f97316',              icon: '🚨', bg: 'rgba(249,115,22,0.08)' },
}

export function CallSummary({ session }: Props) {
  const summary = session.call_summary

  if (!summary) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <SectionHeader />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 36 }}>📋</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {session.status === 'active' ? 'Call in progress' : 'No summary available'}
          </div>
          <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
            {session.status === 'active'
              ? 'Call summary will be generated automatically when the conversation ends.'
              : 'Summary was not generated for this session.'}
          </div>
        </div>
      </div>
    )
  }

  const cfg = RESOLUTION_CONFIG[summary.resolution] ?? RESOLUTION_CONFIG.unresolved

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <SectionHeader />

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          padding: '16px 18px',
          borderRadius: 'var(--radius-lg)',
          background: cfg.bg,
          border: `1px solid ${cfg.color}30`,
          animation: 'slide-up 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>{cfg.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: cfg.color, textTransform: 'capitalize' }}>
                {summary.resolution.replace(/_/g, ' ')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Call duration: {Math.floor(summary.duration_sec / 60)}m {summary.duration_sec % 60}s
              </div>
            </div>
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.7 }}>
            {summary.summary_text}
          </div>
        </div>

        {summary.tools_used.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Tools Used
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {summary.tools_used.map((t) => (
                <span key={t} style={{
                  fontSize: 11,
                  padding: '3px 9px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(251,191,36,0.12)',
                  color: 'var(--accent-amber)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        <SessionStats session={session} summary={summary} />
      </div>
    </div>
  )
}

function SectionHeader() {
  return (
    <div style={{
      padding: '10px 16px',
      borderBottom: '1px solid var(--border-subtle)',
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
        Call Summary
      </span>
    </div>
  )
}

function SessionStats({ session, summary }: { session: SupervisorSession; summary: NonNullable<SupervisorSession['call_summary']> }) {
  const stats = [
    { label: 'Total Turns', value: String(session.messages.length) },
    { label: 'Tool Calls', value: String(session.tool_executions.length) },
    { label: 'Escalated', value: summary.escalated ? 'Yes' : 'No', color: summary.escalated ? 'var(--accent-red)' : 'var(--accent-green)' },
  ]

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        Session Stats
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {stats.map((s) => (
          <div key={s.label} style={{
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: s.color ?? 'var(--text-primary)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
