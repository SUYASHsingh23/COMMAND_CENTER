import React from 'react'
import type { SupervisorSession } from '@/store/supervisor'

interface Props {
  session: SupervisorSession
}

/**
 * Agent State Panel
 *
 * Shows the AI agent's live internal working state during and after a conversation.
 * This is NOT conversational memory - it is the agent's operational state:
 * - What intents and entities were extracted from the customer's words
 * - What the customer's sentiment and urgency level was
 * - Which AI policy guardrails were triggered (e.g. refund threshold checks)
 * - Which automated workflows ran and what steps completed
 * - The customer profile that the agent was working with
 *
 * This panel is primarily for supervisors to understand HOW the agent made
 * its decisions and what data it had access to during the conversation.
 */
export function MemoryPanel({ session }: Props) {
  const wfSteps = session.workflow_steps
  const policies = session.policy_decisions

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        flexShrink: 0,
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          🔍 Agent State
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
          The AI agent's internal operational state — intents, entities, policies, and workflows during this conversation
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>

        {/* ── Session Context ─────────────────────────────────────── */}
        <Section title="Session Context" icon="📡">
          <InfoRow label="Status" value={session.status.toUpperCase()} valueColor={
            session.status === 'active' ? '#34d399' : session.status === 'escalated' ? '#f97316' : '#94a3b8'
          } />
          <InfoRow label="Channel" value={session.channel} />
          <InfoRow label="Sentiment" value={session.sentiment} valueColor={sentimentColor(session.sentiment)} />
          <InfoRow label="Urgency" value={session.urgency} valueColor={
            session.urgency === 'high' ? '#fbbf24' : session.urgency === 'critical' ? '#f87171' : undefined
          } />
          <InfoRow label="Turn Count" value={String(session.messages.length)} />
          {session.customer_name && <InfoRow label="Customer" value={session.customer_name} />}
        </Section>

        {/* ── What the AI Detected ─────────────────────────────────── */}
        {session.intents.length > 0 && (
          <Section title="What the AI Detected" icon="🎯">
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 5 }}>Customer Intents</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {session.intents.map((intent) => (
                  <span key={intent} style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 12,
                    background: 'rgba(139,92,246,0.12)', color: '#a78bfa',
                    border: '1px solid rgba(139,92,246,0.25)',
                  }}>
                    {intent.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          </Section>
        )}

        {/* ── Extracted Entities ─────────────────────────────────── */}
        {Object.entries(session.entities ?? {}).length > 0 && (
          <Section title="Extracted Entities" icon="🔖">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Key data the AI pulled from the conversation (invoice IDs, amounts, dates, names)
            </div>
            {Object.entries(session.entities).map(([k, v]) => (
              <InfoRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} mono />
            ))}
          </Section>
        )}

        {/* ── Policy Guardrails ─────────────────────────────────── */}
        {policies.length > 0 && (
          <Section title="Policy Guardrails Checked" icon="🔒">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Business rules and authorization checks the AI ran before taking action
            </div>
            {policies.slice(-6).map((p, i) => (
              <div key={i} style={{
                padding: '7px 10px', borderRadius: 7, marginBottom: 6,
                background: p.authorized ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
                border: `1px solid ${p.authorized ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12 }}>{p.authorized ? '✅' : '🚫'}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: p.authorized ? '#34d399' : '#f87171',
                  }}>
                    {p.policy_name}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 9, padding: '1px 5px', borderRadius: 3,
                    background: p.authorized ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                    color: p.authorized ? '#34d399' : '#f87171',
                    fontWeight: 700, textTransform: 'uppercase',
                  }}>
                    {p.authorized ? 'AUTHORIZED' : 'BLOCKED'}
                  </span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>{p.reason}</div>
              </div>
            ))}
          </Section>
        )}

        {/* ── Automated Workflows ─────────────────────────────────── */}
        {wfSteps.length > 0 && (
          <Section title="Automated Workflows" icon="🔄">
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
              Multi-step processes the AI executed automatically (e.g. refund validation, plan upgrade)
            </div>
            {Object.entries(groupWorkflows(wfSteps)).map(([name, steps]) => (
              <div key={name} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#38bdf8', marginBottom: 5 }}>
                  🔄 {name.replace(/_/g, ' ')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {steps.map((step) => (
                    <span key={step} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 4,
                      background: 'rgba(56,189,248,0.10)', color: '#38bdf8',
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

        {/* ── Empty state ─────────────────────────────────── */}
        {session.intents.length === 0 && policies.length === 0 && wfSteps.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 40 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Agent State
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              The AI agent's operational data will appear here once the conversation is in progress.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        {icon && <span>{icon}</span>}
        {title}
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value, valueColor, mono }: {
  label: string; value: string; valueColor?: string; mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: 11, color: valueColor ?? 'var(--text-secondary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontWeight: valueColor ? 600 : 400, textTransform: 'capitalize',
      }}>
        {value}
      </span>
    </div>
  )
}

function sentimentColor(s: string) {
  const m: Record<string, string> = {
    positive: '#34d399', neutral: '#60a5fa', frustrated: '#fbbf24', angry: '#f87171',
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
