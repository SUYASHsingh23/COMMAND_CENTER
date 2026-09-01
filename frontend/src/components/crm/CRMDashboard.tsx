import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CustomerCard } from './CustomerCard'
import { ProfileSection } from './ProfileSection'
import { NotesFeed } from './NotesFeed'
import { InteractionHistory } from './InteractionHistory'
import { supervisorWsClient } from '@/services/websocket'


// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerSummary {
  customer_id: string
  name: string
  phone: string | null
  email: string | null
  account_number: string | null
  customer_tier: string
  last_contact_at: string | null
}

interface AccountDetail {
  account_id: string
  plan_name: string | null
  status: string
  balance: number
  billing_cycle: string
  plan_start_date: string | null
  plan_end_date: string | null
  auto_renew: boolean
  data_used_gb: number
  credit_limit: number
  payment_method: string
  custom_fields: Record<string, unknown>
}

interface CustomerDetail {
  customer_id: string
  name: string
  phone: string | null
  email: string | null
  account_number: string | null
  plan: string | null
  date_of_birth: string | null
  gender: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  pincode: string | null
  country: string
  customer_tier: string
  customer_since: string | null
  preferred_language: string
  preferred_channel: string
  tags: string[]
  custom_fields: Record<string, unknown>
  notes: string | null
  last_contact_at: string | null
  created_at: string
  updated_at: string | null
  accounts: AccountDetail[]
}

interface Interaction {
  interaction_id: string
  conversation_id: string | null
  channel: string
  direction: string
  duration_sec: number
  outcome: string
  sentiment: string
  resolution: string
  summary: string | null
  started_at: string
}

interface Note {
  note_id: string
  author: string
  content: string
  note_type: string
  created_at: string
}

interface CRMStats {
  total_customers: number
  active_accounts: number
  tier_distribution: Record<string, number>
}

// ─── Constants ────────────────────────────────────────────────────────────────

const getApiBase = () => `http://${window.location.hostname}:8000/api/v1`

const TIER_COLOR: Record<string, { bg: string; color: string }> = {
  elite:   { bg: 'rgba(139,92,246,0.15)', color: '#8b5cf6' },
  premium: { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
  gold:    { bg: 'rgba(59,130,246,0.15)', color: '#3b82f6' },
  basic:   { bg: 'rgba(71,85,105,0.15)',  color: '#94a3b8' },
}

const ACCOUNT_STATUS_COLOR: Record<string, string> = {
  active:    'var(--accent-green)',
  suspended: 'var(--accent-amber)',
  cancelled: 'var(--accent-red)',
}

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
}

function fmtDate(s: string | null | undefined) {
  if (!s) return null
  try { return new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return s }
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

// ─── Main Component ───────────────────────────────────────────────────────────

type RightPanel = 'profile' | 'interactions' | 'notes'

export function CRMDashboard() {
  const apiBase = getApiBase()

  const [customers, setCustomers] = useState<CustomerSummary[]>([])
  const [stats, setStats] = useState<CRMStats | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [rightPanel, setRightPanel] = useState<RightPanel>('profile')
  const [query, setQuery] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load customer list
  const loadCustomers = useCallback(async (q: string, tier: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (q) params.set('q', q)
      if (tier) params.set('tier', tier)
      const res = await fetch(`${apiBase}/crm/customers?${params}`)
      if (res.ok) setCustomers(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [apiBase])

  // Load stats
  useEffect(() => {
    fetch(`${apiBase}/crm/stats`).then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {})
  }, [apiBase])

  // Initial load + periodic refresh
  useEffect(() => {
    loadCustomers(query, tierFilter)
    const t = setInterval(() => loadCustomers(query, tierFilter), 30000)
    return () => clearInterval(t)
  }, [loadCustomers, query, tierFilter])

  // Real-time WebSocket updates
  useEffect(() => {
    // Always (re)connect supervisor WS when CRM is mounted
    supervisorWsClient.connectSupervisor()

    const unsubscribe = supervisorWsClient.on((evt) => {
      if (evt.event === 'customer.updated') {
        // Always refresh the customer list
        loadCustomers(query, tierFilter)
        // Force-refresh the selected customer's detail panel
        // @ts-ignore
        const updatedId: string | undefined = evt.customer_id
        setSelectedId(prev => {
          if (prev && (!updatedId || updatedId === prev)) {
            // Trigger a re-fetch by calling forceRefreshDetail
            forceRefreshDetail(prev)
          }
          return prev
        })
      }
    })
    return () => unsubscribe()
  }, [loadCustomers, query, tierFilter])

  // Force-reload detail without clearing existing data (no flicker)
  async function forceRefreshDetail(id: string) {
    try {
      const cb = `?t=${Date.now()}`
      const res = await fetch(`${apiBase}/crm/customers/${id}${cb}`)
      if (res.ok) setDetail(await res.json())
    } catch { /* ignore */ }
  }

  // Debounced search
  function handleQueryChange(v: string) {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => loadCustomers(v, tierFilter), 300)
  }

  // Load customer detail
  async function selectCustomer(id: string) {
    const isRefresh = id === selectedId
    setSelectedId(id)
    setDetailLoading(true)
    if (!isRefresh) {
      setDetail(null)
      setInteractions([])
      setNotes([])
    }
    setRightPanel('profile')
    try {
      const cb = `?t=${Date.now()}`
      const [rDetail, rInt, rNotes] = await Promise.all([
        fetch(`${apiBase}/crm/customers/${id}${cb}`),
        fetch(`${apiBase}/crm/customers/${id}/interactions${cb}`),
        fetch(`${apiBase}/crm/customers/${id}/notes${cb}`),
      ])
      if (rDetail.ok) setDetail(await rDetail.json())
      if (rInt.ok) setInteractions(await rInt.json())
      if (rNotes.ok) setNotes(await rNotes.json())
    } catch { /* ignore */ }
    finally { setDetailLoading(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: 'var(--font-sans)' }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <TopBar stats={stats} onCreateClick={() => setShowCreateModal(true)} />

      {/* ── Body (3-column) ─────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar: search + customer list ─────────────────────────────── */}
        <div style={{
          width: 280,
          flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Search + filter */}
          <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-muted)' }}>🔍</span>
              <input
                value={query}
                onChange={e => handleQueryChange(e.target.value)}
                placeholder="Search name, phone, email…"
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 30px',
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 12,
                  outline: 'none',
                }}
              />
            </div>
            <select
              value={tierFilter}
              onChange={e => { setTierFilter(e.target.value); loadCustomers(query, e.target.value) }}
              style={{
                width: '100%',
                padding: '6px 10px',
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: tierFilter ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              <option value="">All tiers</option>
              <option value="elite">Elite</option>
              <option value="premium">Premium</option>
              <option value="gold">Gold</option>
              <option value="basic">Basic</option>
            </select>
          </div>

          {/* Customer count */}
          <div style={{ padding: '6px 14px', fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid var(--border-subtle)' }}>
            {loading ? 'Loading…' : `${customers.length} customer${customers.length !== 1 ? 's' : ''}`}
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
            {customers.length === 0 && !loading && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, padding: '32px 16px' }}>
                {query ? 'No customers match your search' : 'No customers in database yet'}
              </div>
            )}
            {customers.map(c => (
              <CustomerCard
                key={c.customer_id}
                customer={c}
                selected={c.customer_id === selectedId}
                onClick={() => selectCustomer(c.customer_id)}
              />
            ))}
          </div>

          {/* Footer nav */}
          <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <a href="/supervisor" style={{ flex: 1, display: 'block', textAlign: 'center', padding: '7px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--accent-blue)', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                ← Supervisor
              </a>
              <a href="/" style={{ flex: 1, display: 'block', textAlign: 'center', padding: '7px', background: 'rgba(71,85,105,0.08)', border: '1px solid rgba(71,85,105,0.2)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                Voice Agent
              </a>
            </div>
            <a href="/billing" style={{ display: 'block', textAlign: 'center', padding: '7px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-md)', color: '#f59e0b', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
              💳 Billing System
            </a>
            <a href="/scheduling" style={{ display: 'block', textAlign: 'center', padding: '7px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', color: '#10b981', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
              📅 Scheduling
            </a>
          </div>
        </div>

        {/* ── Centre + Right: profile detail ──────────────────────────────── */}
        {!selectedId ? (
          <EmptyState />
        ) : detailLoading ? (
          <LoadingState />
        ) : detail ? (
          <CustomerProfileView
            detail={detail}
            interactions={interactions}
            notes={notes}
            apiBase={apiBase}
            rightPanel={rightPanel}
            onPanelChange={setRightPanel}
            onNoteAdded={note => setNotes(prev => [note, ...prev])}
          />
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateCustomerModal
          apiBase={apiBase}
          onClose={() => setShowCreateModal(false)}
          onCreated={(c: CustomerSummary) => {
            setCustomers(prev => [c, ...prev])
            setShowCreateModal(false)
            selectCustomer(c.customer_id)
          }}
        />
      )}
    </div>
  )
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({ stats, onCreateClick }: { stats: CRMStats | null; onCreateClick: () => void }) {
  const [clock, setClock] = useState(new Date().toLocaleTimeString())
  useEffect(() => {
    const t = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      padding: '10px 20px',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      gap: 20,
      background: 'var(--bg-secondary)',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-blue)', boxShadow: '0 0 8px rgba(59,130,246,0.7)' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.06em' }}>
          COMMAND CENTER
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>CRM System</span>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 12 }}>
          <StatChip label="Customers" value={String(stats.total_customers)} color="var(--accent-blue)" />
          <StatChip label="Active Accounts" value={String(stats.active_accounts)} color="var(--accent-green)" />
          {stats.tier_distribution.elite > 0 && (
            <StatChip label="Elite" value={String(stats.tier_distribution.elite)} color="#8b5cf6" />
          )}
          {stats.tier_distribution.premium > 0 && (
            <StatChip label="Premium" value={String(stats.tier_distribution.premium)} color="var(--accent-amber)" />
          )}
        </div>
      )}

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onCreateClick}
          style={{
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.3)',
            color: 'var(--accent-blue)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all var(--transition-fast)',
          }}
        >
          + New Customer
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{clock}</span>
      </div>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3px 10px', borderRadius: 'var(--radius-md)', background: `${color}10`, border: `1px solid ${color}25` }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.2 }}>{value}</span>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

// ─── Customer Profile View ────────────────────────────────────────────────────

function CustomerProfileView({
  detail, interactions, notes, apiBase, rightPanel, onPanelChange, onNoteAdded,
}: {
  detail: CustomerDetail
  interactions: Interaction[]
  notes: Note[]
  apiBase: string
  rightPanel: RightPanel
  onPanelChange: (p: RightPanel) => void
  onNoteAdded: (n: Note) => void
}) {
  const tier = detail.customer_tier?.toLowerCase() ?? 'basic'
  const tierStyle = TIER_COLOR[tier] ?? TIER_COLOR.basic
  const account = detail.accounts[0]
  const statusColor = account ? (ACCOUNT_STATUS_COLOR[account.status] ?? 'var(--text-muted)') : 'var(--text-muted)'

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>

      {/* ── Centre: customer profile — independently scrollable ─────────── */}
      <div style={{
        flex: 1,
        minWidth: 0,          /* allow flex child to shrink below content size */
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '20px 20px 40px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}>

        {/* ── Profile header card ──────────────────────────────────────── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: 'var(--shadow-md)',
          animation: 'fade-in 0.3s ease',
          flexShrink: 0,
        }}>
          {/* Row 1: avatar + name + badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56,
              borderRadius: '50%',
              background: tierStyle.bg,
              border: `2px solid ${tierStyle.color}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              fontWeight: 700,
              color: tierStyle.color,
              flexShrink: 0,
            }}>
              {initials(detail.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {detail.name}
              </h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                <TierBadge tier={tier} style={tierStyle} />
                {account && <StatusBadge status={account.status} color={statusColor} />}
                {detail.preferred_channel && (
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: 'rgba(6,182,212,0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(6,182,212,0.25)', fontWeight: 600, textTransform: 'capitalize' }}>
                    {detail.preferred_channel}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Row 2: contact meta chips — wraps onto new lines if needed */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingLeft: 72 }}>
            {detail.phone        && <MetaChip icon="📞" value={detail.phone} />}
            {detail.email        && <MetaChip icon="✉️" value={detail.email} />}
            {detail.account_number && <MetaChip icon="🔑" value={detail.account_number} mono />}
            {detail.city         && <MetaChip icon="📍" value={`${detail.city}${detail.state ? ', ' + detail.state : ''}`} />}
          </div>

          {/* Row 3: tags (only if present) */}
          {detail.tags && detail.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 72 }}>
              {detail.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 10, fontWeight: 600,
                  padding: '2px 9px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(139,92,246,0.12)',
                  color: 'var(--accent-purple)',
                  border: '1px solid rgba(139,92,246,0.25)',
                }}>
                  🏷 {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Identity section */}
        <ProfileSection title="Identity" icon="👤" fields={[
          { label: 'Full Name',          value: detail.name },
          { label: 'Date of Birth',       value: fmtDate(detail.date_of_birth) },
          { label: 'Gender',              value: detail.gender },
          { label: 'Preferred Language',  value: detail.preferred_language },
          { label: 'Preferred Channel',   value: detail.preferred_channel, badge: true, badgeColor: 'var(--accent-blue)' },
          { label: 'Customer Since',      value: fmtDate(detail.customer_since) },
          { label: 'Registered',          value: fmtDate(detail.created_at) },
        ]} />

        {/* Contact section */}
        <ProfileSection title="Contact & Address" icon="📍" fields={[
          { label: 'Phone',         value: detail.phone },
          { label: 'Email',         value: detail.email },
          { label: 'Address',       value: [detail.address_line1, detail.address_line2].filter(Boolean).join(', ') },
          { label: 'City',          value: detail.city },
          { label: 'State',         value: detail.state },
          { label: 'Pincode',       value: detail.pincode, mono: true },
          { label: 'Country',       value: detail.country },
        ]} />

        {/* Account section */}
        {account && (
          <ProfileSection title="Account & Billing" icon="💳" fields={[
            { label: 'Plan',          value: account.plan_name },
            { label: 'Status',        value: account.status, badge: true, badgeColor: statusColor },
            { label: 'Balance',       value: fmtCurrency(account.balance), color: account.balance < 0 ? 'var(--accent-red)' : 'var(--accent-green)' },
            { label: 'Billing Cycle', value: account.billing_cycle },
            { label: 'Payment Method',value: account.payment_method },
            { label: 'Plan Start',    value: fmtDate(account.plan_start_date) },
            { label: 'Plan End',      value: fmtDate(account.plan_end_date) },
            { label: 'Auto-Renew',    value: account.auto_renew },
            { label: 'Data Used',     value: account.data_used_gb ? `${account.data_used_gb} GB` : null },
            { label: 'Credit Limit',  value: account.credit_limit ? fmtCurrency(account.credit_limit) : null },
          ]} />
        )}

        {/* Custom fields */}
        {detail.custom_fields && Object.keys(detail.custom_fields).length > 0 && (
          <ProfileSection title="Domain Fields" icon="⚙️" fields={
            Object.entries(detail.custom_fields).map(([k, v]) => ({
              label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              value: String(v),
              mono: true,
            }))
          } />
        )}
      </div>

      {/* ── Right: panel switcher (interactions / notes) ──────────────── */}
      <div style={{
        width: 320,
        flexShrink: 0,
        borderLeft: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-secondary)',
      }}>
        {/* Tab strip */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)', flexShrink: 0 }}>
          {([
            { id: 'interactions', label: `📞 History (${interactions.length})` },
            { id: 'notes',        label: `📝 Notes (${notes.length})` },
          ] as { id: RightPanel; label: string }[]).map(tab => (
            <button key={tab.id} onClick={() => onPanelChange(tab.id)} style={{
              flex: 1,
              padding: '9px 4px',
              fontSize: 11,
              fontWeight: rightPanel === tab.id ? 700 : 400,
              color: rightPanel === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: rightPanel === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Panel content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {rightPanel === 'interactions' && <InteractionHistory interactions={interactions} />}
          {rightPanel === 'notes' && (
            <NotesFeed
              notes={notes}
              customerId={detail.customer_id}
              apiBase={apiBase}
              onNoteAdded={onNoteAdded}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Create Customer Modal ─────────────────────────────────────────────────────

function CreateCustomerModal({
  apiBase, onClose, onCreated,
}: {
  apiBase: string
  onClose: () => void
  onCreated: (c: CustomerSummary) => void
}) {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', account_number: '',
    plan: '', city: '', state: '', pincode: '',
    customer_tier: 'basic', preferred_language: 'en', preferred_channel: 'voice',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function submit() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    try {
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''))
      const res = await fetch(`${apiBase}/crm/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        onCreated(data)
      } else {
        setError('Failed to create customer')
      }
    } catch { setError('Network error') }
    finally { setSaving(false) }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      animation: 'fade-in 0.2s ease',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        width: '100%',
        maxWidth: 520,
        maxHeight: '85vh',
        overflowY: 'auto',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>New Customer</span>
          <button onClick={onClose} style={{ background: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ModalFieldRow label="Full Name *">
            <ModalInput value={form.name} onChange={v => update('name', v)} placeholder="Rahul Sharma" />
          </ModalFieldRow>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalFieldRow label="Phone">
              <ModalInput value={form.phone} onChange={v => update('phone', v)} placeholder="+91-9876543210" />
            </ModalFieldRow>
            <ModalFieldRow label="Email">
              <ModalInput value={form.email} onChange={v => update('email', v)} placeholder="user@email.com" />
            </ModalFieldRow>
            <ModalFieldRow label="Account Number">
              <ModalInput value={form.account_number} onChange={v => update('account_number', v)} placeholder="ACC-2024-001" mono />
            </ModalFieldRow>
            <ModalFieldRow label="Plan">
              <ModalInput value={form.plan} onChange={v => update('plan', v)} placeholder="Health Shield Basic" />
            </ModalFieldRow>
            <ModalFieldRow label="City">
              <ModalInput value={form.city} onChange={v => update('city', v)} placeholder="Mumbai" />
            </ModalFieldRow>
            <ModalFieldRow label="State">
              <ModalInput value={form.state} onChange={v => update('state', v)} placeholder="Maharashtra" />
            </ModalFieldRow>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <ModalFieldRow label="Tier">
              <select value={form.customer_tier} onChange={e => update('customer_tier', e.target.value)} style={modalSelectStyle}>
                <option value="basic">Basic</option>
                <option value="gold">Gold</option>
                <option value="premium">Premium</option>
                <option value="elite">Elite</option>
              </select>
            </ModalFieldRow>
            <ModalFieldRow label="Channel">
              <select value={form.preferred_channel} onChange={e => update('preferred_channel', e.target.value)} style={modalSelectStyle}>
                <option value="voice">Voice</option>
                <option value="email">Email</option>
                <option value="chat">Chat</option>
              </select>
            </ModalFieldRow>
          </div>

          {error && <div style={{ color: 'var(--accent-red)', fontSize: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={submit} disabled={saving} style={{ flex: 1, padding: '9px', borderRadius: 'var(--radius-md)', background: 'var(--accent-blue)', border: 'none', color: 'white', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Creating…' : 'Create Customer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const modalSelectStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
  fontSize: 13, cursor: 'pointer',
}

function ModalFieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600 }}>{label}</div>
      {children}
    </div>
  )
}

function ModalInput({ value, onChange, placeholder, mono }: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '7px 10px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--text-primary)',
        fontSize: 13,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        outline: 'none',
      }}
    />
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function MetaChip({ icon, value, mono }: { icon: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', maxWidth: 260, overflow: 'hidden' }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  )
}

function TierBadge({ tier, style: s }: { tier: string; style: { bg: string; color: string } }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 9px',
      borderRadius: 'var(--radius-full)',
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.color}40`,
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}>
      {tier}
    </span>
  )
}

function StatusBadge({ status, color }: { status: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700,
      padding: '2px 9px',
      borderRadius: 'var(--radius-full)',
      background: `${color}15`,
      color: color,
      border: `1px solid ${color}30`,
      textTransform: 'capitalize',
      letterSpacing: '0.03em',
    }}>
      {status}
    </span>
  )
}


function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-muted)' }}>
      <div style={{ fontSize: 52 }}>📇</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>Select a customer</div>
      <div style={{ fontSize: 13, maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
        Search or browse customers on the left to view their full profile, interaction history, and notes.
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: 12 }}>
      <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      Loading profile…
    </div>
  )
}
