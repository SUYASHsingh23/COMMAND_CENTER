import React, { useState } from 'react'

interface Note {
  note_id: string
  author: string
  content: string
  note_type: string
  created_at: string
}

interface Props {
  notes: Note[]
  customerId: string
  apiBase: string
  onNoteAdded: (note: Note) => void
}

const TYPE_COLOR: Record<string, string> = {
  general:    'var(--accent-blue)',
  flag:       'var(--accent-red)',
  follow_up:  'var(--accent-amber)',
  complaint:  '#f97316',
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function NotesFeed({ notes, customerId, apiBase, onNoteAdded }: Props) {
  const [content, setContent] = useState('')
  const [noteType, setNoteType] = useState('general')
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!content.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`${apiBase}/crm/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: 'agent', content: content.trim(), note_type: noteType }),
      })
      if (res.ok) {
        const note = await res.json()
        onNoteAdded(note)
        setContent('')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Add note form */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>📝</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Agent Notes
          </span>
        </div>
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Add a note about this customer…"
            rows={3}
            style={{
              width: '100%',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: 13,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={noteType}
              onChange={e => setNoteType(e.target.value)}
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '5px 8px',
                color: 'var(--text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <option value="general">General</option>
              <option value="flag">Flag</option>
              <option value="follow_up">Follow-up</option>
              <option value="complaint">Complaint</option>
            </select>
            <button
              onClick={submit}
              disabled={saving || !content.trim()}
              style={{
                marginLeft: 'auto',
                padding: '6px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-blue)',
                color: 'white',
                fontSize: 12,
                fontWeight: 600,
                opacity: saving || !content.trim() ? 0.5 : 1,
                cursor: saving || !content.trim() ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Add Note'}
            </button>
          </div>
        </div>
      </div>

      {/* Notes list */}
      {notes.map(note => (
        <div key={note.note_id} style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '10px 14px',
          animation: 'slide-up 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 9,
              fontWeight: 700,
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              background: `${TYPE_COLOR[note.note_type] ?? 'var(--accent-blue)'}18`,
              color: TYPE_COLOR[note.note_type] ?? 'var(--accent-blue)',
              border: `1px solid ${TYPE_COLOR[note.note_type] ?? 'var(--accent-blue)'}30`,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              {note.note_type.replace('_', ' ')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{note.author}</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{relTime(note.created_at)}</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>{note.content}</div>
        </div>
      ))}

      {notes.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '16px 0' }}>
          No notes yet — add the first one above
        </div>
      )}
    </div>
  )
}
