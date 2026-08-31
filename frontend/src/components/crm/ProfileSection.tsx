import React from 'react'

interface FieldDef {
  label: string
  value?: string | number | boolean | null
  mono?: boolean
  color?: string
  badge?: boolean
  badgeColor?: string
  wide?: boolean   // span both columns
}

interface Props {
  title: string
  icon?: string
  fields: FieldDef[]
  children?: React.ReactNode
}

export function ProfileSection({ title, icon, fields, children }: Props) {
  const visible = fields.filter(f => f.value !== null && f.value !== undefined && f.value !== '')

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      flexShrink: 0,    // ← prevent section from shrinking inside scroll container
    }}>
      {/* Section header */}
      <div style={{
        padding: '9px 16px',
        background: 'var(--bg-elevated)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-muted)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          {title}
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: 10,
          color: 'var(--text-muted)',
        }}>
          {visible.length} field{visible.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px' }}>
        {children ? children : (
          visible.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No data available</div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px 20px',
            }}>
              {visible.map((f, i) => (
                <FieldCell key={i} field={f} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function FieldCell({ field }: { field: FieldDef }) {
  const displayValue = field.value === true
    ? 'Yes'
    : field.value === false
    ? 'No'
    : String(field.value ?? '')

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 3,
      gridColumn: field.wide ? '1 / -1' : undefined,
      minWidth: 0,    // ← critical: allows text to shrink and wrap inside grid cell
    }}>
      {/* Label */}
      <span style={{
        fontSize: 10,
        fontWeight: 600,
        color: 'var(--text-muted)',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {field.label}
      </span>

      {/* Value */}
      {field.badge ? (
        <span style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          fontSize: 11,
          fontWeight: 600,
          padding: '2px 10px',
          borderRadius: 'var(--radius-full)',
          background: `${field.badgeColor ?? '#3b82f6'}18`,
          color: field.badgeColor ?? '#3b82f6',
          border: `1px solid ${field.badgeColor ?? '#3b82f6'}35`,
          textTransform: 'capitalize',
          letterSpacing: '0.03em',
        }}>
          {displayValue}
        </span>
      ) : (
        <span style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: field.color ?? 'var(--text-primary)',
          fontFamily: field.mono ? 'var(--font-mono)' : undefined,
          fontWeight: field.color ? 600 : 400,
          wordBreak: 'break-word',      // ← long emails / addresses wrap correctly
          overflowWrap: 'anywhere',
          whiteSpace: 'normal',
        }}>
          {displayValue}
        </span>
      )}
    </div>
  )
}
