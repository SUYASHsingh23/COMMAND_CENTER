import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supervisorWsClient } from '@/services/websocket'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerRow {
  customer_id: string
  name: string
  phone: string | null
  email: string | null
  account_number: string | null
  customer_tier: string
  last_contact_at: string | null
}

interface BillingSummary {
  customer_id: string
  customer_name: string
  account_number: string | null
  customer_tier: string
  active_plan: string | null
  plan_status: string
  billing_cycle: string
  plan_start_date: string | null
  plan_end_date: string | null
  auto_renew: boolean
  next_due_date: string | null
  days_until_due: number | null
  current_balance: number
  credit_limit: number
  credit_utilization_pct: number | null
  outstanding_amount: number
  currency: string
  payment_method: string
  last_payment_amount: number | null
  last_payment_date: string | null
  total_invoices: number
  paid_invoices: number
  overdue_invoices: number
  partial_invoices: number
  total_transactions: number
  successful_payments: number
  failed_payments: number
  total_refunds: number
  pending_refunds: number
  total_refund_amount: number
  unread_alerts: number
  critical_alerts: number
}

interface Invoice {
  invoice_id: string
  invoice_number: string
  status: string
  total_amount: number
  amount_paid: number
  outstanding_amount: number
  due_date: string
  billing_period_start: string | null
  billing_period_end: string | null
  paid_at: string | null
  late_fee_applied: boolean
  late_fee_amount?: number
}

interface InvoiceFull extends Invoice {
  subtotal: number
  discount_amount: number
  cgst_amount: number
  sgst_amount: number
  tax_amount: number
  issue_date: string | null
  sent_via: string
  line_items: LineItem[]
  customer_notes: string | null
  internal_notes: string | null
  currency: string
}

interface LineItem {
  description: string
  plan_code?: string
  quantity: number
  unit_price: string
  discount: string
  tax_pct: string
  amount: string
}

interface Transaction {
  transaction_id: string
  transaction_type: string
  transaction_sub_type: string | null
  amount: number
  currency: string
  status: string
  payment_method: string | null
  payment_method_detail: string | null
  gateway_ref: string | null
  bank_ref: string | null
  failure_reason: string | null
  failure_code: string | null
  initiated_by: string
  receipt_url: string | null
  created_at: string
  settled_at: string | null
  invoice_id: string | null
  retry_count: number
  gateway_fee: number
  net_amount: number | null
}

interface RefundRequest {
  refund_id: string
  refund_number: string | null
  customer_id: string
  requested_amount: number
  approved_amount: number | null
  currency: string
  reason: string
  reason_detail: string | null
  status: string
  priority: string
  threshold_exceeded: boolean
  threshold_amount: number | null
  auto_processed: boolean
  requested_by: string
  reviewed_by: string | null
  review_notes: string | null
  rejection_reason: string | null
  refund_mode: string | null
  sla_deadline: string | null
  sla_breached: boolean
  created_at: string
  reviewed_at: string | null
  processed_at: string | null
}

interface Alert {
  alert_id: string
  alert_type: string
  severity: string
  title: string | null
  message: string
  is_read: boolean
  created_at: string
}

interface DashboardStats {
  total_customers: number
  total_invoices: number
  paid_invoices: number
  overdue_invoices: number
  total_revenue: number
  outstanding_amount: number
  pending_refunds: number
  threshold_pending_refunds: number
  failed_transactions: number
  refund_threshold: number
}

const API = '/api/v1/billing'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const tierConfig = (tier: string) => {
  const map: Record<string, { bg: string; color: string }> = {
    platinum: { bg: '#1a1535', color: '#a78bfa' },
    gold:     { bg: '#1a1600', color: '#fbbf24' },
    silver:   { bg: '#141a1f', color: '#94a3b8' },
    standard: { bg: '#101418', color: '#64748b' },
  }
  return map[tier?.toLowerCase()] || map.standard
}

const statusColor = (s: string): string => {
  const map: Record<string, string> = {
    paid: '#22c55e', sent: '#3b82f6', overdue: '#ef4444',
    partial: '#f59e0b', cancelled: '#6b7280', draft: '#64748b',
    success: '#22c55e', pending: '#f59e0b', failed: '#ef4444',
    reversed: '#a78bfa', processing: '#3b82f6',
    approved: '#22c55e', rejected: '#ef4444', under_review: '#f59e0b',
    processed: '#22c55e', escalated: '#f97316',
    info: '#3b82f6', warning: '#f59e0b', critical: '#ef4444',
    active: '#22c55e', inactive: '#6b7280', suspended: '#ef4444',
  }
  return map[s?.toLowerCase()] || '#64748b'
}

const txnTypeIcon = (type: string) => {
  const icons: Record<string, string> = {
    payment: '↑', refund: '↓', credit: '+', debit: '−',
    adjustment: '⟳', penalty: '⚠', writeoff: '✕',
  }
  return icons[type] || '•'
}

const txnTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    payment: '#22c55e', refund: '#f59e0b', credit: '#3b82f6',
    debit: '#ef4444', adjustment: '#a78bfa', penalty: '#ef4444',
  }
  return colors[type] || '#94a3b8'
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 'var(--radius-full)', background: `${color}18`,
      color: color, border: `1px solid ${color}30`,
      textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0,
    }}>
      {label}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BillingDashboard() {
  const [customers, setCustomers] = useState<CustomerRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [allRefunds, setAllRefunds] = useState<RefundRequest[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'invoices' | 'transactions' | 'refunds'>('overview')
  const [searchQ, setSearchQ] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null)
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceFull | null>(null)
  const [txnFilter, setTxnFilter] = useState('')
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(new Date())
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load customers + stats on mount
  useEffect(() => {
    fetchCustomers('')
    fetch(`${API}/stats`).then(r => r.json()).then(setStats).catch(() => {})
    fetch(`${API}/refunds?status=under_review`).then(r => r.json()).then(setAllRefunds).catch(() => {})
  }, [])

  // Listen for real-time invoice updates
  useEffect(() => {
    supervisorWsClient.connectSupervisor()
    const unsubscribe = supervisorWsClient.on((evt) => {
      if (evt.event === 'invoice.updated') {
        // If the updated invoice belongs to the currently viewed customer, refresh their details
        if (selected && evt.customer_id === selected) {
          selectCustomer(selected)
        }
      }
    })
    return () => {
      unsubscribe()
    }
  }, [selected])

  const fetchCustomers = (q: string) => {
    const params = new URLSearchParams({ limit: '50' })
    if (q) params.set('q', q)
    if (tierFilter) params.set('tier', tierFilter)
    fetch(`${API}/customers?${params}`).then(r => r.json()).then(setCustomers).catch(() => {})
  }

  const handleSearch = (v: string) => {
    setSearchQ(v)
    if (searchRef.current) clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => fetchCustomers(v), 350)
  }

  const selectCustomer = async (id: string) => {
    setSelected(id)
    setActiveTab('overview')
    setLoading(true)
    try {
      const [sum, invs, txns, refs, alts] = await Promise.all([
        fetch(`${API}/customers/${id}/summary`).then(r => r.json()),
        fetch(`${API}/customers/${id}/invoices?limit=24`).then(r => r.json()),
        fetch(`${API}/customers/${id}/transactions?limit=50`).then(r => r.json()),
        fetch(`${API}/customers/${id}/refunds?limit=20`).then(r => r.json()),
        fetch(`${API}/customers/${id}/alerts?limit=20`).then(r => r.json()),
      ])
      setSummary(sum)
      setInvoices(Array.isArray(invs) ? invs : [])
      setTransactions(Array.isArray(txns) ? txns : [])
      setRefunds(Array.isArray(refs) ? refs : [])
      setAlerts(Array.isArray(alts) ? alts : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadInvoiceDetail = async (id: string) => {
    if (expandedInvoice === id) { setExpandedInvoice(null); return }
    setExpandedInvoice(id)
    try {
      const d = await fetch(`${API}/invoices/${id}`).then(r => r.json())
      setInvoiceDetail(d)
    } catch { setInvoiceDetail(null) }
  }

  const filteredTxns = txnFilter
    ? transactions.filter(t => t.transaction_type === txnFilter)
    : transactions

  const s = summary

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh', width: '100%',
      background: 'var(--bg-primary)', color: 'var(--text-primary)',
      fontFamily: 'var(--font-primary)', overflow: 'hidden',
    }}>
      {/* ── Top Header ───────────────────────────────────────────────────── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '0 24px',
        height: 52, borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e80' }} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            COMMAND CENTER
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Billing System</span>
        </div>

        {/* Stats strip */}
        {stats && (
          <div style={{ display: 'flex', gap: 20, marginLeft: 24 }}>
            {[
              { label: 'CUSTOMERS', val: stats.total_customers, color: 'var(--text-primary)' },
              { label: 'OVERDUE', val: stats.overdue_invoices, color: '#ef4444' },
              { label: 'PENDING REFUNDS', val: stats.pending_refunds, color: '#f59e0b' },
              { label: 'OUTSTANDING', val: `₹${fmt(stats.outstanding_amount, 0)}`, color: '#f59e0b' },
              { label: 'FAILED TXN', val: stats.failed_transactions, color: '#ef4444' },
              { label: `THRESHOLD ≤₹${fmt(stats.refund_threshold, 0)}`, val: 'AUTO', color: '#22c55e' },
            ].map(item => (
              <div key={item.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.val}</div>
                <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>{item.label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {selected && (
            <button
              onClick={() => setShowRefundModal(true)}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#000', border: 'none', borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              + New Refund
            </button>
          )}
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
            {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <aside style={{
          width: 280, borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          background: 'var(--bg-secondary)',
        }}>
          <div style={{ padding: '12px 12px 8px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)',
              padding: '6px 10px', border: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: 13 }}>🔍</span>
              <input
                value={searchQ}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search name, phone, account…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: 12,
                }}
              />
            </div>
            <select
              value={tierFilter}
              onChange={e => { setTierFilter(e.target.value); fetchCustomers(searchQ) }}
              style={{
                width: '100%', marginTop: 8, padding: '5px 8px', fontSize: 12,
                background: 'var(--bg-primary)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', outline: 'none',
              }}
            >
              <option value="">All tiers</option>
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="standard">Standard</option>
            </select>
          </div>

          <div style={{ padding: '4px 12px 4px', fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
            {customers.length} CUSTOMERS
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {customers.map(c => {
              const tc = tierConfig(c.customer_tier)
              const isActive = selected === c.customer_id
              return (
                <div
                  key={c.customer_id}
                  onClick={() => selectCustomer(c.customer_id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', cursor: 'pointer',
                    background: isActive ? 'var(--bg-primary)' : 'transparent',
                    borderLeft: `3px solid ${isActive ? '#3b82f6' : 'transparent'}`,
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${tc.color}40, ${tc.color}20)`,
                    border: `1px solid ${tc.color}50`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 700, color: tc.color,
                  }}>
                    {c.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.account_number || c.phone || c.email || '—'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 6px',
                    borderRadius: 'var(--radius-full)', background: tc.bg,
                    color: tc.color, border: `1px solid ${tc.color}40`,
                    textTransform: 'uppercase', flexShrink: 0,
                  }}>
                    {c.customer_tier}
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px', display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/supervisor" style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', cursor: 'pointer' }}>← Supervisor</a>
            <a href="/crm" style={{ fontSize: 11, color: '#3b82f6', textDecoration: 'none', cursor: 'pointer' }}>📇 CRM</a>
            <a href="/scheduling" style={{ fontSize: 11, color: '#10b981', textDecoration: 'none', cursor: 'pointer' }}>📅 Scheduling</a>
            <a href="/" style={{ fontSize: 11, color: 'var(--text-secondary)', textDecoration: 'none', cursor: 'pointer' }}>Voice Agent</a>
          </div>
        </aside>

        {/* ── Centre Content ───────────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {!selected ? (
            <EmptyState />
          ) : loading ? (
            <LoadingState />
          ) : s ? (
            <>
              {/* Profile Header */}
              <CustomerBillingHeader summary={s} />

              {/* Tabs */}
              <div style={{
                display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
                background: 'var(--bg-secondary)', padding: '0 20px', flexShrink: 0,
              }}>
                {(['overview', 'invoices', 'transactions', 'refunds'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '10px 16px', fontSize: 12, fontWeight: 600,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: activeTab === tab ? '#3b82f6' : 'var(--text-secondary)',
                      borderBottom: `2px solid ${activeTab === tab ? '#3b82f6' : 'transparent'}`,
                      textTransform: 'capitalize', letterSpacing: '0.02em',
                    }}
                  >
                    {tab === 'invoices' ? `Invoices (${invoices.length})` :
                     tab === 'transactions' ? `Transactions (${transactions.length})` :
                     tab === 'refunds' ? `Refunds (${refunds.length})` :
                     'Overview'}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                {activeTab === 'overview' && (
                  <BillingOverviewTab
                    summary={s}
                    recentTxns={transactions.slice(0, 5)}
                    alerts={alerts}
                    invoices={invoices}
                  />
                )}
                {activeTab === 'invoices' && (
                  <InvoicesTab
                    invoices={invoices}
                    expandedId={expandedInvoice}
                    invoiceDetail={invoiceDetail}
                    onExpand={loadInvoiceDetail}
                  />
                )}
                {activeTab === 'transactions' && (
                  <TransactionsTab
                    transactions={filteredTxns}
                    filter={txnFilter}
                    onFilter={setTxnFilter}
                    allCount={transactions.length}
                  />
                )}
                {activeTab === 'refunds' && (
                  <RefundsTab
                    refunds={refunds}
                    customerId={selected}
                    onRefresh={() => selectCustomer(selected)}
                  />
                )}
              </div>
            </>
          ) : null}
        </main>

        {/* ── Right Panel — All refunds pending review ─────────────────── */}
        <aside style={{
          width: 320, borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
          background: 'var(--bg-secondary)',
        }}>
          <RefundQueuePanel
            refunds={allRefunds}
            onRefresh={() => {
              fetch(`${API}/refunds?status=under_review`).then(r => r.json()).then(setAllRefunds).catch(() => {})
              if (selected) selectCustomer(selected)
            }}
          />
        </aside>
      </div>

      {/* ── Refund Modal ─────────────────────────────────────────────────── */}
      {showRefundModal && selected && s && (
        <RefundModal
          customerId={selected}
          accountId={undefined}
          invoices={invoices}
          transactions={transactions}
          threshold={stats?.refund_threshold || 5000}
          customerName={s.customer_name}
          onClose={() => setShowRefundModal(false)}
          onSuccess={() => {
            setShowRefundModal(false)
            selectCustomer(selected)
            fetch(`${API}/refunds?status=under_review`).then(r => r.json()).then(setAllRefunds).catch(() => {})
          }}
        />
      )}
    </div>
  )
}

// ─── Customer Billing Header ──────────────────────────────────────────────────

function CustomerBillingHeader({ summary: s }: { summary: BillingSummary }) {
  const tc = tierConfig(s.customer_tier)
  const daysLabel = s.days_until_due !== null
    ? s.days_until_due < 0 ? `${Math.abs(s.days_until_due)}d overdue` : `${s.days_until_due}d`
    : null
  const dueColor = s.days_until_due !== null
    ? s.days_until_due < 0 ? '#ef4444' : s.days_until_due <= 7 ? '#f59e0b' : '#22c55e'
    : '#64748b'

  return (
    <div style={{
      padding: '14px 20px', borderBottom: '1px solid var(--border)',
      background: 'var(--bg-secondary)', flexShrink: 0,
    }}>
      {/* Row 1 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg, ${tc.color}40, ${tc.color}15)`,
          border: `1.5px solid ${tc.color}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 700, color: tc.color,
        }}>
          {s.customer_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{s.customer_name}</span>
            <Badge label={s.customer_tier} color={tc.color} />
            <Badge label={s.plan_status} color={statusColor(s.plan_status)} />
            {s.unread_alerts > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 7px',
                borderRadius: 'var(--radius-full)', background: '#ef444420',
                color: '#ef4444', border: '1px solid #ef444430',
              }}>
                {s.unread_alerts} alert{s.unread_alerts !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
            {[
              s.account_number && { icon: '🔑', val: s.account_number },
              s.active_plan && { icon: '📋', val: s.active_plan },
              { icon: '💳', val: s.payment_method },
              { icon: '🔄', val: s.billing_cycle },
            ].filter(Boolean).map((item: any, i) => (
              <span key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 4 }}>
                <span>{item.icon}</span><span>{item.val}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Quick financial numbers */}
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          <QuickStat label="BALANCE" value={`₹${fmt(s.current_balance)}`} color={s.current_balance >= 0 ? '#22c55e' : '#ef4444'} />
          <QuickStat label="OUTSTANDING" value={`₹${fmt(s.outstanding_amount)}`} color={s.outstanding_amount > 0 ? '#ef4444' : '#22c55e'} />
          {s.next_due_date && (
            <QuickStat label="NEXT DUE" value={fmtDate(s.next_due_date)} color={dueColor}
              sub={daysLabel ?? undefined} />
          )}
          <QuickStat label="FAILED TXN" value={String(s.failed_payments)} color={s.failed_payments > 0 ? '#ef4444' : '#22c55e'} />
        </div>
      </div>
    </div>
  )
}

function QuickStat({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color, fontWeight: 600 }}>{sub}</div>}
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function BillingOverviewTab({ summary: s, recentTxns, alerts, invoices }: {
  summary: BillingSummary; recentTxns: Transaction[]; alerts: Alert[]; invoices: Invoice[]
}) {
  const creditUtil = s.credit_utilization_pct ?? 0
  const overdue = invoices.filter(i => i.status === 'overdue')

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {/* Plan & Account card */}
      <SectionCard title="Active Plan & Account" icon="📋">
        <Grid2>
          <Field label="Plan Name" value={s.active_plan || '—'} />
          <Field label="Status" value={<Badge label={s.plan_status} color={statusColor(s.plan_status)} />} />
          <Field label="Billing Cycle" value={s.billing_cycle} />
          <Field label="Payment Method" value={s.payment_method} />
          <Field label="Plan Start" value={fmtDate(s.plan_start_date)} />
          <Field label="Plan End" value={fmtDate(s.plan_end_date)} />
          <Field label="Auto-Renew" value={s.auto_renew ? '✓ Yes' : '✗ No'} />
          <Field label="Account No." value={s.account_number || '—'} mono />
        </Grid2>
      </SectionCard>

      {/* Financial position */}
      <SectionCard title="Financial Position" icon="₹">
        <Grid2>
          <Field label="Current Balance" value={<span style={{ color: s.current_balance >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>₹{fmt(s.current_balance)}</span>} />
          <Field label="Outstanding" value={<span style={{ color: s.outstanding_amount > 0 ? '#ef4444' : 'var(--text-primary)', fontWeight: 700 }}>₹{fmt(s.outstanding_amount)}</span>} />
          <Field label="Credit Limit" value={`₹${fmt(s.credit_limit)}`} />
          <Field label="Last Payment" value={s.last_payment_amount ? `₹${fmt(s.last_payment_amount)}` : '—'} />
          <Field label="Last Payment Date" value={fmtDateTime(s.last_payment_date)} />
          <Field label="Total Refunds Issued" value={`₹${fmt(s.total_refund_amount)}`} />
        </Grid2>
        {s.credit_limit > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Credit Utilization</span>
              <span style={{ fontWeight: 600, color: creditUtil > 80 ? '#ef4444' : '#22c55e' }}>{creditUtil}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(creditUtil, 100)}%`, background: creditUtil > 80 ? '#ef4444' : '#22c55e', transition: 'width 0.6s' }} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Invoice stats */}
      <SectionCard title="Invoice Statistics" icon="📄">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Total', val: s.total_invoices, color: 'var(--text-primary)' },
            { label: 'Paid', val: s.paid_invoices, color: '#22c55e' },
            { label: 'Overdue', val: s.overdue_invoices, color: '#ef4444' },
            { label: 'Partial', val: s.partial_invoices, color: '#f59e0b' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center', padding: '10px 0', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.val}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{item.label}</div>
            </div>
          ))}
        </div>
        {overdue.length > 0 && (
          <div style={{ padding: '8px 10px', background: '#ef444410', borderRadius: 'var(--radius-md)', border: '1px solid #ef444430' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginBottom: 4 }}>Overdue Invoices</div>
            {overdue.map(inv => (
              <div key={inv.invoice_id} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{inv.invoice_number}</span>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>₹{fmt(inv.outstanding_amount)}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Transaction stats */}
      <SectionCard title="Transaction Statistics" icon="⟳">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {[
            { label: 'Total', val: s.total_transactions, color: 'var(--text-primary)' },
            { label: 'Success', val: s.successful_payments, color: '#22c55e' },
            { label: 'Failed', val: s.failed_payments, color: '#ef4444' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center', padding: '10px 0', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.color }}>{item.val}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Recent transactions mini-list */}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 }}>RECENT ACTIVITY</div>
        {recentTxns.map(t => (
          <div key={t.transaction_id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: `${txnTypeColor(t.transaction_type)}20`,
              color: txnTypeColor(t.transaction_type),
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
            }}>{txnTypeIcon(t.transaction_type)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{t.transaction_type}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.payment_method || t.initiated_by} • {fmtDate(t.created_at)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: txnTypeColor(t.transaction_type) }}>₹{fmt(t.amount)}</div>
              <Badge label={t.status} color={statusColor(t.status)} />
            </div>
          </div>
        ))}
      </SectionCard>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ gridColumn: '1 / -1' }}>
          <SectionCard title={`Billing Alerts (${alerts.length})`} icon="🔔">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alerts.map(al => (
                <div key={al.alert_id} style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '8px 10px', borderRadius: 'var(--radius-md)',
                  background: `${statusColor(al.severity)}10`,
                  border: `1px solid ${statusColor(al.severity)}25`,
                  opacity: al.is_read ? 0.6 : 1,
                }}>
                  <Badge label={al.severity} color={statusColor(al.severity)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {al.title && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{al.title}</div>}
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{al.message}</div>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{fmtDate(al.created_at)}</div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}
    </div>
  )
}

// ─── Invoices Tab ─────────────────────────────────────────────────────────────

function InvoicesTab({ invoices, expandedId, invoiceDetail, onExpand }: {
  invoices: Invoice[]; expandedId: string | null; invoiceDetail: InvoiceFull | null; onExpand: (id: string) => void
}) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 0, fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.06em', padding: '4px 12px 8px', borderBottom: '1px solid var(--border)' }}>
        <span>INVOICE #</span><span>PERIOD</span><span>TOTAL</span><span>PAID</span><span>DUE DATE</span><span>STATUS</span>
      </div>
      {invoices.map(inv => (
        <div key={inv.invoice_id}>
          <div
            onClick={() => onExpand(inv.invoice_id)}
            style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto',
              gap: 0, padding: '10px 12px', cursor: 'pointer',
              borderBottom: '1px solid var(--border)',
              background: expandedId === inv.invoice_id ? 'var(--bg-secondary)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#3b82f6' }}>{inv.invoice_number}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              {inv.billing_period_start ? `${fmtDate(inv.billing_period_start)} – ${fmtDate(inv.billing_period_end)}` : '—'}
            </span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>₹{fmt(inv.total_amount)}</span>
            <span style={{ fontSize: 12, color: '#22c55e' }}>₹{fmt(inv.amount_paid)}</span>
            <div>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDate(inv.due_date)}</span>
              {inv.late_fee_applied && <span style={{ fontSize: 9, color: '#f59e0b', marginLeft: 4 }}>+late fee</span>}
            </div>
            <Badge label={inv.status} color={statusColor(inv.status)} />
          </div>

          {/* Expanded detail */}
          {expandedId === inv.invoice_id && invoiceDetail && invoiceDetail.invoice_id === inv.invoice_id && (
            <InvoiceDetailExpanded invoice={invoiceDetail} />
          )}
        </div>
      ))}
      {invoices.length === 0 && <EmptyMsg>No invoices found.</EmptyMsg>}
    </div>
  )
}

function InvoiceDetailExpanded({ invoice: inv }: { invoice: InvoiceFull }) {
  return (
    <div style={{ padding: '16px 20px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <Label>Issue Date</Label><Val>{fmtDate(inv.issue_date)}</Val>
          <Label>Period</Label><Val>{fmtDate(inv.billing_period_start)} – {fmtDate(inv.billing_period_end)}</Val>
          <Label>Sent Via</Label><Val>{inv.sent_via}</Val>
        </div>
        <div>
          <Label>Subtotal</Label><Val>₹{fmt(inv.subtotal)}</Val>
          <Label>Discount</Label><Val style={{ color: '#22c55e' }}>−₹{fmt(inv.discount_amount)}</Val>
          <Label>CGST (9%)</Label><Val>₹{fmt(inv.cgst_amount)}</Val>
          <Label>SGST (9%)</Label><Val>₹{fmt(inv.sgst_amount)}</Val>
          <Label>Total Tax</Label><Val>₹{fmt(inv.tax_amount)}</Val>
          <Label>Total</Label><Val style={{ fontWeight: 700, color: 'var(--text-primary)' }}>₹{fmt(inv.total_amount)}</Val>
        </div>
        <div>
          {inv.late_fee_applied && <><Label>Late Fee</Label><Val style={{ color: '#f59e0b' }}>₹{fmt(inv.late_fee_amount ?? 0)}</Val></>}
          {inv.customer_notes && <><Label>Notes</Label><Val style={{ fontSize: 11 }}>{inv.customer_notes}</Val></>}
        </div>
      </div>
      {/* Line items */}
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em', marginBottom: 6 }}>LINE ITEMS</div>
      <div style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr 1fr', padding: '6px 12px', background: 'var(--bg-primary)', fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.06em', gap: 8 }}>
          <span>DESCRIPTION</span><span>QTY</span><span>UNIT PRICE</span><span>DISCOUNT</span><span>TAX%</span><span style={{ textAlign: 'right' }}>AMOUNT</span>
        </div>
        {inv.line_items.map((li, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr 1fr', padding: '8px 12px', fontSize: 12, borderTop: i > 0 ? '1px solid var(--border)' : undefined, gap: 8 }}>
            <span>{li.description}</span>
            <span>{li.quantity}</span>
            <span>₹{li.unit_price}</span>
            <span style={{ color: '#22c55e' }}>{parseFloat(li.discount) > 0 ? `−₹${li.discount}` : '—'}</span>
            <span>{li.tax_pct}%</span>
            <span style={{ textAlign: 'right', fontWeight: 600 }}>₹{li.amount}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────

function TransactionsTab({ transactions, filter, onFilter, allCount }: {
  transactions: Transaction[]; filter: string; onFilter: (f: string) => void; allCount: number
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {['', 'payment', 'refund', 'credit', 'debit', 'adjustment'].map(f => (
          <button
            key={f}
            onClick={() => onFilter(f)}
            style={{
              padding: '4px 12px', fontSize: 11, borderRadius: 'var(--radius-full)',
              border: `1px solid ${filter === f ? '#3b82f6' : 'var(--border)'}`,
              background: filter === f ? '#3b82f620' : 'transparent',
              color: filter === f ? '#3b82f6' : 'var(--text-secondary)',
              cursor: 'pointer', textTransform: 'capitalize',
            }}
          >{f || `All (${allCount})`}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {transactions.map(t => (
          <div key={t.transaction_id} style={{
            display: 'grid', gridTemplateColumns: '36px 1fr 1fr auto auto',
            alignItems: 'center', gap: 12, padding: '10px 14px',
            background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)',
            border: `1px solid ${t.status === 'failed' ? '#ef444430' : 'var(--border)'}`,
          }}>
            {/* Type icon */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: `${txnTypeColor(t.transaction_type)}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: txnTypeColor(t.transaction_type), fontWeight: 700,
            }}>{txnTypeIcon(t.transaction_type)}</div>

            {/* Description */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>
                {t.transaction_type}{t.transaction_sub_type ? ` — ${t.transaction_sub_type.replace(/_/g, ' ')}` : ''}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 8 }}>
                {t.payment_method && <span>{t.payment_method}</span>}
                {t.payment_method_detail && <span style={{ fontFamily: 'var(--font-mono)' }}>{t.payment_method_detail}</span>}
                {t.gateway_ref && <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.6 }}>{t.gateway_ref.slice(0, 18)}…</span>}
              </div>
              {t.failure_reason && (
                <div style={{ fontSize: 10, color: '#ef4444', marginTop: 2 }}>
                  ⚠ {t.failure_code && `[${t.failure_code}] `}{t.failure_reason}
                  {t.retry_count > 0 && ` — retried ${t.retry_count}×`}
                </div>
              )}
            </div>

            {/* Date */}
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDateTime(t.created_at)}</div>

            {/* Amount */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: txnTypeColor(t.transaction_type) }}>
                {t.transaction_type === 'refund' || t.transaction_type === 'credit' ? '+' : ''}₹{fmt(t.amount)}
              </div>
              {t.gateway_fee > 0 && <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>fee ₹{fmt(t.gateway_fee)}</div>}
            </div>

            {/* Status */}
            <Badge label={t.status} color={statusColor(t.status)} />
          </div>
        ))}
        {transactions.length === 0 && <EmptyMsg>No transactions found.</EmptyMsg>}
      </div>
    </div>
  )
}

// ─── Refunds Tab ──────────────────────────────────────────────────────────────

function RefundsTab({ refunds, customerId, onRefresh }: { refunds: RefundRequest[]; customerId: string; onRefresh: () => void }) {
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [reviewForm, setReviewForm] = useState({ status: 'approved', review_notes: '', rejection_reason: '', approved_amount: '' })

  const submitReview = async (refundId: string) => {
    const body: any = {
      status: reviewForm.status,
      reviewed_by: 'supervisor',
      review_notes: reviewForm.review_notes || null,
      rejection_reason: reviewForm.rejection_reason || null,
    }
    if (reviewForm.approved_amount) body.approved_amount = parseFloat(reviewForm.approved_amount)
    await fetch(`${API}/refunds/${refundId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setReviewing(null)
    onRefresh()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {refunds.map(r => (
        <div key={r.refund_id} style={{
          padding: '14px', background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-md)',
          border: `1px solid ${r.threshold_exceeded ? '#f59e0b40' : 'var(--border)'}`,
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#3b82f6' }}>{r.refund_number || r.refund_id.slice(0, 12)}</span>
            <Badge label={r.status} color={statusColor(r.status)} />
            <Badge label={r.priority} color={r.priority === 'high' ? '#ef4444' : r.priority === 'medium' ? '#f59e0b' : '#64748b'} />
            {r.threshold_exceeded && <Badge label="THRESHOLD EXCEEDED" color="#f59e0b" />}
            {r.auto_processed && <Badge label="AUTO-APPROVED" color="#22c55e" />}
            <span style={{ marginLeft: 'auto', fontSize: 18, fontWeight: 700, color: '#f59e0b' }}>₹{fmt(r.requested_amount)}</span>
          </div>

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <Field label="Reason" value={r.reason.replace(/_/g, ' ')} />
            <Field label="Requested By" value={r.requested_by} />
            {r.approved_amount && <Field label="Approved Amount" value={`₹${fmt(r.approved_amount)}`} />}
            {r.refund_mode && <Field label="Refund Mode" value={r.refund_mode.replace(/_/g, ' ')} />}
            {r.sla_deadline && <Field label="SLA Deadline" value={fmtDateTime(r.sla_deadline)} />}
            <Field label="Created" value={fmtDateTime(r.created_at)} />
          </div>
          {r.reason_detail && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-primary)', padding: '8px 10px', borderRadius: 'var(--radius-md)', marginBottom: 10 }}>
              {r.reason_detail}
            </div>
          )}
          {r.review_notes && <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 6 }}>Review note: {r.review_notes}</div>}
          {r.rejection_reason && <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 6 }}>Rejection: {r.rejection_reason}</div>}

          {/* Review form */}
          {r.status === 'under_review' && (
            reviewing === r.refund_id ? (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <select
                  value={reviewForm.status}
                  onChange={e => setReviewForm(f => ({ ...f, status: e.target.value }))}
                  style={{ padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }}
                >
                  <option value="approved">Approve</option>
                  <option value="rejected">Reject</option>
                  <option value="escalated">Escalate</option>
                </select>
                {reviewForm.status === 'approved' && (
                  <input placeholder={`Approved amount (default: ${r.requested_amount})`} value={reviewForm.approved_amount}
                    onChange={e => setReviewForm(f => ({ ...f, approved_amount: e.target.value }))}
                    style={{ padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }} />
                )}
                <textarea placeholder="Notes (optional)" value={reviewForm.review_notes}
                  onChange={e => setReviewForm(f => ({ ...f, review_notes: e.target.value }))}
                  rows={2}
                  style={{ padding: '6px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12, resize: 'none' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => submitReview(r.refund_id)} style={{ flex: 1, padding: '7px', fontSize: 12, fontWeight: 600, background: '#22c55e', color: '#000', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Submit Review</button>
                  <button onClick={() => setReviewing(null)} style={{ padding: '7px 14px', fontSize: 12, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setReviewing(r.refund_id); setReviewForm({ status: 'approved', review_notes: '', rejection_reason: '', approved_amount: '' }) }}
                style={{ width: '100%', padding: '8px', fontSize: 12, fontWeight: 600, background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                Review Request
              </button>
            )
          )}
        </div>
      ))}
      {refunds.length === 0 && <EmptyMsg>No refund requests for this customer.</EmptyMsg>}
    </div>
  )
}

// ─── Refund Queue Panel ───────────────────────────────────────────────────────

function RefundQueuePanel({ refunds, onRefresh }: { refunds: RefundRequest[]; onRefresh: () => void }) {
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [form, setForm] = useState({ status: 'approved', notes: '', amount: '' })

  const submitReview = async (id: string) => {
    const body: any = { status: form.status, reviewed_by: 'supervisor', review_notes: form.notes || null }
    if (form.amount) body.approved_amount = parseFloat(form.amount)
    await fetch(`${API}/refunds/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    setReviewing(null)
    onRefresh()
  }

  return (
    <>
      <div style={{ padding: '14px 14px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          Refund Queue
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          {refunds.length} pending supervisor review
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
        {refunds.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>
            No refunds pending review
          </div>
        ) : refunds.map(r => (
          <div key={r.refund_id} style={{
            padding: '10px', marginBottom: 8, borderRadius: 'var(--radius-md)',
            background: 'var(--bg-primary)', border: '1px solid #f59e0b40',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#3b82f6' }}>{r.refund_number}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>₹{fmt(r.requested_amount)}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {r.reason.replace(/_/g, ' ')} • {r.priority} priority
            </div>
            <div style={{ fontSize: 10, color: '#f59e0b', marginBottom: 8 }}>
              ⚠ Threshold exceeded (limit ₹{fmt(r.threshold_amount ?? 5000)})
            </div>
            {r.sla_deadline && (
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                SLA: {fmtDateTime(r.sla_deadline)}
              </div>
            )}

            {reviewing === r.refund_id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={{ padding: '5px 7px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 11 }}>
                  <option value="approved">Approve</option>
                  <option value="rejected">Reject</option>
                  <option value="escalated">Escalate further</option>
                </select>
                {form.status === 'approved' && (
                  <input placeholder={`Amount (default: ${r.requested_amount})`} value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    style={{ padding: '5px 7px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 11 }} />
                )}
                <textarea placeholder="Notes" value={form.notes} rows={2}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  style={{ padding: '5px 7px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 11, resize: 'none' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => submitReview(r.refund_id)} style={{ flex: 1, padding: '6px', fontSize: 11, fontWeight: 600, background: '#22c55e', color: '#000', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Submit</button>
                  <button onClick={() => setReviewing(null)} style={{ padding: '6px 10px', fontSize: 11, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setReviewing(r.refund_id); setForm({ status: 'approved', notes: '', amount: '' }) }}
                style={{ width: '100%', padding: '6px', fontSize: 11, fontWeight: 600, background: '#f59e0b20', color: '#f59e0b', border: '1px solid #f59e0b40', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                Review →
              </button>
            )}
          </div>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', display: 'flex', justifyContent: 'center' }}>
        <button onClick={onRefresh} style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ↻ Refresh queue
        </button>
      </div>
    </>
  )
}

// ─── Refund Modal (3 steps) ───────────────────────────────────────────────────

function RefundModal({ customerId, invoices, transactions, threshold, customerName, onClose, onSuccess }: {
  customerId: string; accountId?: string; invoices: Invoice[]; transactions: Transaction[]; threshold: number; customerName: string; onClose: () => void; onSuccess: () => void
}) {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    invoice_id: '', transaction_id: '', amount: '',
    reason: 'service_outage', reason_detail: '', refund_mode: 'original_source', refund_upi_id: '', priority: 'medium',
  })
  const [submitting, setSubmitting] = useState(false)
  const amount = parseFloat(form.amount) || 0
  const exceedsThreshold = amount > threshold

  const submit = async () => {
    setSubmitting(true)
    try {
      const body: any = {
        customer_id: customerId,
        requested_amount: amount,
        reason: form.reason,
        reason_detail: form.reason_detail || null,
        requested_by: 'agent',
        requesting_agent_id: 'agent-001',
        customer_consent: true,
        refund_mode: form.refund_mode,
        priority: form.priority,
      }
      if (form.invoice_id) body.invoice_id = form.invoice_id
      if (form.transaction_id) body.transaction_id = form.transaction_id
      if (form.refund_upi_id) body.refund_upi_id = form.refund_upi_id
      await fetch(`${API}/refunds`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      onSuccess()
    } catch (e) { console.error(e) }
    finally { setSubmitting(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#00000090', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ width: 520, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>New Refund Request</span>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>— {customerName}</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>Step {step}/3</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', padding: '10px 20px', gap: 6 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? '#3b82f6' : 'var(--border)' }} />
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 1 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Step 1 — Select Invoice / Transaction</div>
              <Label>Link to Invoice (optional)</Label>
              <select value={form.invoice_id} onChange={e => setForm(f => ({ ...f, invoice_id: e.target.value }))}
                style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }}>
                <option value="">No specific invoice</option>
                {invoices.map(i => <option key={i.invoice_id} value={i.invoice_id}>{i.invoice_number} — ₹{fmt(i.total_amount)} ({i.status})</option>)}
              </select>
              <Label>Link to Transaction (optional)</Label>
              <select value={form.transaction_id} onChange={e => setForm(f => ({ ...f, transaction_id: e.target.value }))}
                style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }}>
                <option value="">No specific transaction</option>
                {transactions.filter(t => t.transaction_type === 'payment').map(t => (
                  <option key={t.transaction_id} value={t.transaction_id}>
                    {t.payment_method} ₹{fmt(t.amount)} — {fmtDate(t.created_at)} ({t.status})
                  </option>
                ))}
              </select>
              <Label>Refund Amount (₹) *</Label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="Enter amount"
                style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }} />
              <Label>Priority</Label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Step 2 — Reason & Details</div>
              <Label>Reason Category *</Label>
              <select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }}>
                {['service_outage', 'duplicate_payment', 'overbilling', 'cancellation', 'product_defect', 'other'].map(r => (
                  <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <Label>Detailed Description</Label>
              <textarea rows={4} value={form.reason_detail} onChange={e => setForm(f => ({ ...f, reason_detail: e.target.value }))}
                placeholder="Describe the reason in detail..."
                style={{ padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12, resize: 'vertical' }} />
              <Label>Refund Mode</Label>
              <select value={form.refund_mode} onChange={e => setForm(f => ({ ...f, refund_mode: e.target.value }))}
                style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }}>
                <option value="original_source">Original Source</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="wallet">Wallet Credit</option>
                <option value="cheque">Cheque</option>
              </select>
              {form.refund_mode === 'original_source' && (
                <input placeholder="UPI ID (optional)" value={form.refund_upi_id}
                  onChange={e => setForm(f => ({ ...f, refund_upi_id: e.target.value }))}
                  style={{ padding: '7px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: 12 }} />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Step 3 — Review & Submit</div>
              {exceedsThreshold && (
                <div style={{ padding: '12px 14px', background: '#f59e0b15', border: '1px solid #f59e0b40', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>⚠ Threshold Exceeded</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Requested amount <strong>₹{fmt(amount)}</strong> exceeds the auto-approval limit of <strong>₹{fmt(threshold)}</strong>.
                    This request will be routed to a supervisor for manual review and cannot be auto-processed.
                  </div>
                </div>
              )}
              {!exceedsThreshold && (
                <div style={{ padding: '12px 14px', background: '#22c55e15', border: '1px solid #22c55e40', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#22c55e', marginBottom: 4 }}>✓ Auto-Approval Eligible</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    Amount ₹{fmt(amount)} is within the ₹{fmt(threshold)} auto-approval threshold. Refund will be processed immediately.
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, background: 'var(--bg-primary)', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <Field label="Customer" value={customerName} />
                <Field label="Amount" value={`₹${fmt(amount)}`} />
                <Field label="Reason" value={form.reason.replace(/_/g, ' ')} />
                <Field label="Mode" value={form.refund_mode.replace(/_/g, ' ')} />
                <Field label="Priority" value={form.priority} />
                {form.invoice_id && <Field label="Invoice" value={invoices.find(i => i.invoice_id === form.invoice_id)?.invoice_number || 'selected'} />}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {step > 1 && <button onClick={() => setStep(s => s - 1)} style={{ padding: '8px 18px', fontSize: 12, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', cursor: 'pointer' }}>← Back</button>}
          {step < 3
            ? <button onClick={() => setStep(s => s + 1)} disabled={step === 1 && !amount} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 600, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', opacity: (step === 1 && !amount) ? 0.5 : 1 }}>Next →</button>
            : <button onClick={submit} disabled={submitting} style={{ padding: '8px 18px', fontSize: 12, fontWeight: 600, background: exceedsThreshold ? '#f59e0b' : '#22c55e', color: '#000', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              {submitting ? 'Submitting…' : exceedsThreshold ? 'Submit for Review' : 'Submit Refund'}
            </button>
          }
        </div>
      </div>
    </div>
  )
}

// ─── Shared UI Atoms ──────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{title}</span>
      </div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 10, columnGap: 16 }}>{children}</div>
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2, ...style }}>{children}</div>
}

function Val({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, ...style }}>{children}</div>
}

function EmptyMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>{children}</div>
}

function EmptyState() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <div style={{ fontSize: 48 }}>💳</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Billing System</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Select a customer from the sidebar to view billing details</div>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading billing data…</div>
    </div>
  )
}
