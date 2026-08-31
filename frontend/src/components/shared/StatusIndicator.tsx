import React from 'react'

interface Props {
  status: 'connected' | 'connecting' | 'disconnected' | 'error'
  label?: string
}

const STATUS_CONFIG = {
  connected: { color: 'var(--accent-green)', label: 'Connected' },
  connecting: { color: 'var(--accent-amber)', label: 'Connecting' },
  disconnected: { color: 'var(--text-muted)', label: 'Disconnected' },
  error: { color: 'var(--accent-red)', label: 'Error' },
}

export function StatusIndicator({ status, label }: Props) {
  const config = STATUS_CONFIG[status]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: 10, height: 10 }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: config.color,
            position: 'absolute',
          }}
        />
        {status === 'connected' && (
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: config.color,
              position: 'absolute',
              animation: 'pulse-ring 1.8s ease-out infinite',
            }}
          />
        )}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
        {label ?? config.label}
      </span>
    </div>
  )
}
