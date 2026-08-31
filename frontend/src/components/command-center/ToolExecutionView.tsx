import React, { useState } from 'react'
import type { SupervisorSession } from '@/store/supervisor'
import type { ToolExecution } from '@/types/tools'

interface Props {
  session: SupervisorSession
}

export function ToolExecutionView({ session }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const tools = [...session.tool_executions].reverse()

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
          Tool Executions
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {session.tool_executions.length} calls
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tools.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, paddingTop: 32 }}>
            No tool calls yet
          </div>
        )}

        {tools.map((exec) => (
          <ToolCard
            key={exec.exec_id}
            exec={exec}
            open={expanded === exec.exec_id}
            onToggle={() => setExpanded(expanded === exec.exec_id ? null : exec.exec_id)}
          />
        ))}
      </div>
    </div>
  )
}

function ToolCard({ exec, open, onToggle }: {
  exec: ToolExecution
  open: boolean
  onToggle: () => void
}) {
  const isSuccess = exec.status === 'success'
  const statusColor = isSuccess ? 'var(--accent-green)' : 'var(--accent-red)'

  return (
    <div style={{
      borderRadius: 'var(--radius-md)',
      border: `1px solid ${isSuccess ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
      background: isSuccess ? 'rgba(16,185,129,0.04)' : 'rgba(239,68,68,0.04)',
      overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 14 }}>{isSuccess ? '✅' : '❌'}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-amber)', fontFamily: 'var(--font-mono)', flex: 1 }}>
          {exec.tool_name}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {exec.duration_ms}ms
        </span>
        <span style={{ fontSize: 10, color: statusColor, fontWeight: 700 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 12px 10px', borderTop: '1px solid var(--border-subtle)' }}>
          {Object.keys(exec.input_params ?? {}).length > 0 && (
            <>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Input
              </div>
              <pre style={{
                fontSize: 10,
                color: 'var(--text-secondary)',
                background: 'var(--bg-secondary)',
                padding: '6px 8px',
                borderRadius: 6,
                margin: 0,
                overflowX: 'auto',
                maxHeight: 80,
              }}>
                {JSON.stringify(exec.input_params, null, 2)}
              </pre>
            </>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, marginBottom: 4, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Output
          </div>
          <pre style={{
            fontSize: 10,
            color: 'var(--text-secondary)',
            background: 'var(--bg-secondary)',
            padding: '6px 8px',
            borderRadius: 6,
            margin: 0,
            overflowX: 'auto',
            maxHeight: 120,
          }}>
            {JSON.stringify(exec.output, null, 2)}
          </pre>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
            {new Date(exec.timestamp).toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  )
}
