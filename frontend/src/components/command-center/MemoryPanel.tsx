import React from 'react'
import type { SupervisorSession } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

export function MemoryPanel({ session }: Props) {
  const wfSteps = session.workflow_steps
  const policies = session.policy_decisions

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Memory &amp; State
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <Section title="Working State">
          <InfoRow label="Sentiment" value={session.sentiment} valueColor={sentimentColor(session.sentiment)} />
          <InfoRow label="Urgency" value={session.urgency} />
          <InfoRow label="Channel" value={session.channel} />
          <InfoRow label="Status" value={session.status} />
          <InfoRow label="Turn Count" value={String(session.messages.length)} />
        </Section>

        {Object.entries(session.entities ?? {}).length > 0 && (
          <Section title="Extracted Entities">
            {Object.entries(session.entities).map(([k, v]) => (
              <InfoRow key={k} label={k} value={v} mono />
            ))}
          </Section>
        )}

        {session.intents.length > 0 && (
          <Section title="Active Intents">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {session.intents.map((intent) => (
                <span key={intent} className="badge badge--purple" style={{ fontSize: 10 }}>
                  {intent.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </Section>
        )}

        {wfSteps.length > 0 && (
          <Section title="Workflow Executions">
            {Object.entries(groupWorkflows(wfSteps)).map(([name, steps]) => (
              <div key={name} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', marginBottom: 4 }}>
                  {name.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {steps.map((step) => (
                    <span key={step} style={{
                      fontSize: 10,
                      padding: '2px 6px',
                      borderRadius: 4,
                      background: 'rgba(56,189,248,0.12)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56,189,248,0.2)',
                    }}>
                      ✓ {step.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </Section>
        )}

        {policies.length > 0 && (
          <Section title="Policy Decisions">
            {policies.slice(-5).map((p, i) => (
              <div key={i} style={{
                padding: '6px 8px',
                borderRadius: 6,
                marginBottom: 5,
                background: p.authorized ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)',
                border: `1px solid ${p.authorized ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 11 }}>{p.authorized ? '✅' : '🚫'}</span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: p.authorized ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}>
                    {p.policy_name}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.reason}</div>
              </div>
            ))}
          </Section>
        )}

        {session.last_response && (
          <Section title="Last AI Response">
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              padding: '8px 10px',
              background: 'rgba(16,185,129,0.05)',
              border: '1px solid rgba(16,185,129,0.15)',
              borderRadius: 6,
              fontStyle: 'italic',
            }}>
              "{session.last_response}"
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10,
        fontWeight: 700,
        color: 'var(--text-muted)',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        marginBottom: 8,
        paddingBottom: 4,
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value, valueColor, mono }: {
  label: string
  value: string
  valueColor?: string
  mono?: boolean
}) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 5,
    }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: 11,
        color: valueColor ?? 'var(--text-secondary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontWeight: valueColor ? 600 : 400,
        textTransform: 'capitalize',
      }}>
        {value}
      </span>
    </div>
  )
}

function sentimentColor(s: string) {
  const m: Record<string, string> = {
    positive: 'var(--accent-green)',
    neutral: 'var(--accent-blue)',
    frustrated: 'var(--accent-amber)',
    angry: 'var(--accent-red)',
  }
  return m[s] ?? 'var(--text-secondary)'
}

function groupWorkflows(steps: SupervisorSession['workflow_steps']) {
  const groups: Record<string, string[]> = {}
  for (const step of steps) {
    if (!groups[step.workflow_name]) groups[step.workflow_name] = []
    if (!groups[step.workflow_name].includes(step.step_name)) {
      groups[step.workflow_name].push(step.step_name)
    }
  }
  return groups
}
