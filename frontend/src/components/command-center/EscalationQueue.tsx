import React from 'react'
import { useSupervisorStore } from '@/store/supervisor'

export function EscalationQueue() {
  const alerts = useSupervisorStore((s) => s.escalationAlerts)
  const dismiss = useSupervisorStore((s) => s.dismissEscalationAlert)
  const setActive = useSupervisorStore((s) => s.setActiveSession)

  if (alerts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      right: 16,
      width: 340,
      zIndex: 1000,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {alerts.map((alert) => (
        <div
          key={alert.session_id}
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(249,115,22,0.12)',
            border: '1px solid rgba(249,115,22,0.4)',
            backdropFilter: 'blur(12px)',
            animation: 'slide-up 0.25s ease',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>🚨</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#f97316', marginBottom: 3 }}>
                Escalation Required
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 6, lineHeight: 1.5 }}>
                {alert.reason}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Session: {alert.session_id.slice(0, 8)}… · {alert.sentiment} · {alert.turn_count} turns
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  onClick={() => { setActive(alert.session_id); dismiss(alert.session_id) }}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    background: 'rgba(249,115,22,0.2)',
                    border: '1px solid rgba(249,115,22,0.4)',
                    borderRadius: 6,
                    color: '#f97316',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  View Session
                </button>
                <button
                  onClick={() => dismiss(alert.session_id)}
                  style={{
                    padding: '5px 12px',
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
