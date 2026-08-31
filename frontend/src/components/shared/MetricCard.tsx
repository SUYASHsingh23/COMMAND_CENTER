import React from 'react'

interface Props {
  label: string
  value: string | number
  unit?: string
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  accentColor?: string
  id?: string
}

const TREND_ICONS = {
  up: '↑',
  down: '↓',
  neutral: '→',
}

const TREND_COLORS = {
  up: 'var(--accent-green)',
  down: 'var(--accent-red)',
  neutral: 'var(--text-muted)',
}

export function MetricCard({ label, value, unit, trend, trendValue, accentColor = 'var(--accent-blue)', id }: Props) {
  return (
    <div
      id={id}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '18px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'border-color var(--transition-fast)',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = accentColor
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border)'
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: accentColor, lineHeight: 1 }}>
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
            {unit}
          </span>
        )}
      </div>
      {trend && trendValue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 12, color: TREND_COLORS[trend], fontWeight: 600 }}>
            {TREND_ICONS[trend]} {trendValue}
          </span>
        </div>
      )}
    </div>
  )
}
