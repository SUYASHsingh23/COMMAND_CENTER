import React from 'react'
import type { SupervisorSession, RagPassage } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

export function RagSourcesView({ session }: Props) {
  const passages = session.rag_passages

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
          RAG Sources
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {passages.length} retrieved
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {passages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, paddingTop: 32 }}>
            No knowledge passages retrieved yet
          </div>
        )}

        {passages.map((p, i) => (
          <PassageCard key={i} passage={p} index={i} />
        ))}
      </div>
    </div>
  )
}

function PassageCard({ passage, index }: { passage: RagPassage; index: number }) {
  const score = passage.score
  const scoreColor = score >= 0.6
    ? 'var(--accent-green)'
    : score >= 0.35
    ? 'var(--accent-amber)'
    : 'var(--text-muted)'

  const categoryColors: Record<string, string> = {
    billing: 'rgba(15,118,110,0.12)',
    technical: 'rgba(251,191,36,0.15)',
    sales: 'rgba(167,139,250,0.15)',
    account: 'rgba(56,189,248,0.15)',
    general: 'rgba(255,255,255,0.06)',
  }

  const catBg = categoryColors[passage.category] ?? categoryColors.general

  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 'var(--radius-md)',
      background: catBg,
      border: '1px solid rgba(167,139,250,0.18)',
      animation: 'slide-up 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
        <span style={{ fontSize: 12 }}>📚</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#a78bfa', flex: 1 }}>
          {passage.title}
        </span>
        <span style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 4,
          background: 'rgba(167,139,250,0.15)',
          color: '#a78bfa',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
        }}>
          {passage.category}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.round(score * 100)}%`,
            height: '100%',
            background: scoreColor,
            borderRadius: 2,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{ fontSize: 10, color: scoreColor, fontFamily: 'var(--font-mono)', fontWeight: 700, minWidth: 36 }}>
          {(score * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
