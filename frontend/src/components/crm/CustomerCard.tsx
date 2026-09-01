import React from 'react'

interface Props {
  customer: {
    customer_id: string
    name: string
    phone?: string | null
    email?: string | null
    account_number?: string | null
    customer_tier: string
    last_contact_at?: string | null
  }
  selected: boolean
  onClick: () => void
}

const TIER_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  elite:   { bg: 'rgba(139,92,246,0.12)', color: '#8b5cf6', border: 'rgba(139,92,246,0.3)' },
  premium: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' },
  gold:    { bg: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: 'rgba(59,130,246,0.3)' },
  basic:   { bg: 'rgba(71,85,105,0.12)',  color: '#94a3b8', border: 'rgba(71,85,105,0.3)' },
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function CustomerCard({ customer, selected, onClick }: Props) {
  const tier = customer.customer_tier?.toLowerCase() ?? 'basic'
  const tierStyle = TIER_COLOR[tier] ?? TIER_COLOR.basic

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        marginBottom: 4,
        background: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
        border: selected ? '1px solid rgba(59,130,246,0.25)' : '1px solid transparent',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Avatar */}
      <div style={{
        width: 36, height: 36,
        borderRadius: '50%',
        background: selected ? 'rgba(59,130,246,0.2)' : 'rgba(71,85,105,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: selected ? 'var(--accent-blue)' : 'var(--text-muted)',
        flexShrink: 0,
      }}>
        {initials(customer.name)}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 2 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {customer.name}
          </span>
          <span style={{
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 6px',
            borderRadius: 'var(--radius-full)',
            background: tierStyle.bg,
            color: tierStyle.color,
            border: `1px solid ${tierStyle.border}`,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}>
            {tier}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {customer.phone ?? customer.email ?? customer.account_number ?? 'No contact info'}
        </div>
        {customer.last_contact_at && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            Last: {timeAgo(customer.last_contact_at)}
          </div>
        )}
      </div>
    </button>
  )
}
