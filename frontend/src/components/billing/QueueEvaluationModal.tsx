import React, { useState, useEffect, useMemo } from 'react'

export type QueueType = 'refund' | 'investigation' | 'escalation'

export interface CaseItem {
  id: string
  refNumber: string
  customerId: string
  customerName?: string | null
  customerEmail?: string | null
  amount?: number | null
  priority: string
  status: string
  reason: string
  reasonDetail?: string | null
  escalationReason?: string | null
  thresholdExceeded?: boolean
  thresholdAmount?: number | null
  slaDeadline?: string | null
  createdAt: string
  reviewedAt?: string | null
  reviewedBy?: string | null
  reviewNotes?: string | null
  rejectionReason?: string | null
  conversationId?: string | null
  handoffContext?: any
  type: QueueType
}

interface MessageItem {
  message_id: string
  role: string
  content: string
  turn_index?: number
  timestamp?: string
  sentiment?: string
}

interface TimelineEvent {
  type: string
  timestamp?: string
  label: string
  detail?: string
  status?: string
  evidence?: any
  rule?: string
  decision?: string
}

interface ConversationDetail {
  conversation_id: string
  customer_name?: string
  status?: string
  messages: MessageItem[]
  timeline: TimelineEvent[]
  tool_executions?: any[]
  intents?: any[]
  policy_decisions?: any[]
  sentiment?: string
  summary?: string
}

interface Props {
  initialQueue: QueueType
  onClose: () => void
  onRefreshAll: () => void
  refunds: any[]
  investigations: any[]
  escalations: any[]
  threshold?: number
}

const fmt = (n: number | null | undefined, dec = 2) => {
  if (n == null || isNaN(Number(n))) return '0.00'
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(n))
}

const fmtDateTime = (s: string | null | undefined) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const priorityColor = (p: string) => {
  const map: Record<string, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#f59e0b',
    low: '#64748b',
  }
  return map[p?.toLowerCase()] || '#64748b'
}

const sentimentColor = (s: string) => {
  const map: Record<string, { color: string; bg: string; border: string }> = {
    angry: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)' },
    frustrated: { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)' },
    neutral: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)' },
    positive: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)' },
  }
  return map[s?.toLowerCase()] || map.neutral
}

export function QueueEvaluationModal({
  initialQueue,
  onClose,
  onRefreshAll,
  refunds,
  investigations,
  escalations,
  threshold = 5000,
}: Props) {
  const [activeQueue, setActiveQueue] = useState<QueueType>(initialQueue)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [decisionFeedback, setDecisionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Decision form states
  const [actionStatus, setActionStatus] = useState<'approved' | 'rejected' | 'escalated' | 'resolved'>('approved')
  const [approvedAmount, setApprovedAmount] = useState<string>('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [resolverName, setResolverName] = useState('Supervisor')

  // Close modal on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Normalize case items into uniform CaseItem interface
  const normalizedCases = useMemo<CaseItem[]>(() => {
    if (activeQueue === 'refund') {
      return refunds.map((r: any) => ({
        id: r.refund_id,
        refNumber: r.refund_number || `REF-${r.refund_id.slice(0, 8).toUpperCase()}`,
        customerId: r.customer_id,
        customerName: r.customer_name || 'Customer',
        customerEmail: r.customer_email || '',
        amount: Number(r.requested_amount || 0),
        priority: r.priority || 'medium',
        status: r.status,
        reason: r.reason || 'Refund Request',
        reasonDetail: r.reason_detail || r.reason,
        escalationReason: r.escalation_reason || (r.threshold_exceeded ? `Requested amount exceeds threshold limit (₹${threshold})` : null),
        thresholdExceeded: r.threshold_exceeded,
        thresholdAmount: r.threshold_amount ? Number(r.threshold_amount) : threshold,
        slaDeadline: r.sla_deadline,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        reviewedBy: r.reviewed_by,
        reviewNotes: r.review_notes,
        rejectionReason: r.rejection_reason,
        type: 'refund' as QueueType,
      }))
    }
    if (activeQueue === 'investigation') {
      return investigations.map((r: any) => ({
        id: r.refund_id,
        refNumber: r.refund_number || `CASE-${r.refund_id.slice(0, 8).toUpperCase()}`,
        customerId: r.customer_id,
        customerName: r.customer_name || 'Customer',
        customerEmail: r.customer_email || '',
        amount: Number(r.requested_amount || 0),
        priority: r.priority || 'high',
        status: r.status,
        reason: r.reason || 'Flagged for Investigation',
        reasonDetail: r.reason_detail || r.reason,
        escalationReason: r.escalation_reason || 'Multi-factor velocity breach or duplicate refund attempt',
        thresholdExceeded: r.threshold_exceeded,
        thresholdAmount: r.threshold_amount ? Number(r.threshold_amount) : threshold,
        slaDeadline: r.sla_deadline,
        createdAt: r.created_at,
        reviewedAt: r.reviewed_at,
        reviewedBy: r.reviewed_by,
        reviewNotes: r.review_notes,
        rejectionReason: r.rejection_reason,
        type: 'investigation' as QueueType,
      }))
    }
    // Escalations
    return escalations.map((e: any) => ({
      id: e.escalation_id,
      refNumber: e.appointment_reference || `ESC-${e.escalation_id.slice(0, 8).toUpperCase()}`,
      customerId: e.customer_id || '',
      customerName: e.customer_name || 'Customer',
      customerEmail: e.customer_email || '',
      amount: null,
      priority: e.handoff_context?.urgency === 'critical' ? 'critical' : e.handoff_context?.urgency === 'high' ? 'high' : 'medium',
      status: e.status,
      reason: e.reason || 'Human Escalation Triggered',
      reasonDetail: e.handoff_context?.summary || e.reason,
      escalationReason: e.reason,
      conversationId: e.conversation_id,
      handoffContext: e.handoff_context,
      slaDeadline: null,
      createdAt: e.timestamp,
      reviewedAt: e.resolved_at,
      reviewedBy: e.resolved_by,
      reviewNotes: null,
      rejectionReason: null,
      type: 'escalation' as QueueType,
    }))
  }, [activeQueue, refunds, investigations, escalations, threshold])

  // Filter cases based on status and search query
  const filteredCases = useMemo(() => {
    return normalizedCases.filter((c) => {
      if (statusFilter === 'pending') {
        if (c.type === 'escalation') {
          if (c.status !== 'open' && c.status !== 'assigned') return false
        } else if (c.type === 'refund') {
          if (c.status !== 'under_review' && c.status !== 'pending') return false
        } else if (c.type === 'investigation') {
          if (c.status !== 'investigation' && c.status !== 'under_review') return false
        }
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchRef = c.refNumber.toLowerCase().includes(q)
        const matchName = (c.customerName || '').toLowerCase().includes(q)
        const matchReason = (c.reason || '').toLowerCase().includes(q)
        if (!matchRef && !matchName && !matchReason) return false
      }
      return true
    })
  }, [normalizedCases, statusFilter, searchQuery])

  // Auto-select first case if current selection is invalid or missing
  useEffect(() => {
    if (filteredCases.length > 0) {
      if (!selectedCaseId || !filteredCases.some(c => c.id === selectedCaseId)) {
        setSelectedCaseId(filteredCases[0].id)
      }
    } else {
      setSelectedCaseId(null)
    }
  }, [filteredCases, selectedCaseId])

  const selectedCase = useMemo(() => {
    return normalizedCases.find(c => c.id === selectedCaseId) || null
  }, [normalizedCases, selectedCaseId])

  // Whenever selected case changes, pre-fill decision fields and fetch conversation detail
  useEffect(() => {
    if (!selectedCase) {
      setConversationDetail(null)
      return
    }
    setDecisionFeedback(null)
    setActionStatus(selectedCase.type === 'escalation' ? 'resolved' : 'approved')
    setApprovedAmount(selectedCase.amount ? String(selectedCase.amount) : '')
    setReviewNotes('')

    setIsLoadingDetail(true)

    // Helper to fetch conversation detail by ID
    const fetchConvDetail = async (convId: string) => {
      try {
        const res = await fetch(`/api/v1/analytics/conversations/${convId}/detail`)
        if (res.ok) {
          const data = await res.json()
          const rawMsgs = Array.isArray(data.messages) ? data.messages : []
          const msgs: MessageItem[] = rawMsgs.length > 0
            ? rawMsgs
            : (selectedCase.handoffContext?.history_summary || []).map((h: any, idx: number) => ({
                message_id: `hist-${idx}`,
                role: h.role,
                content: h.content,
                turn_index: idx,
              }))
          setConversationDetail({
            conversation_id: data.conversation_id,
            customer_name: data.customer_name,
            status: data.status,
            messages: msgs,
            timeline: data.timeline || [],
            tool_executions: data.tool_executions || [],
            intents: data.intents || [],
            policy_decisions: data.policy_decisions || [],
            sentiment: (selectedCase.handoffContext?.sentiment && selectedCase.handoffContext.sentiment !== 'unknown')
              ? selectedCase.handoffContext.sentiment
              : (data.intents && data.intents.length > 0 && data.intents[data.intents.length - 1].sentiment)
              ? data.intents[data.intents.length - 1].sentiment
              : 'neutral',
            summary: data.summary || selectedCase.handoffContext?.summary || '',
          })
          return true
        }
      } catch (err) {
        console.error('Error fetching conversation detail:', err)
      }
      return false
    }

    // If case has conversationId (escalations), fetch directly
    if (selectedCase.conversationId) {
      fetchConvDetail(selectedCase.conversationId)
        .then((ok) => {
          if (!ok && selectedCase.handoffContext?.history_summary) {
            setConversationDetail({
              conversation_id: selectedCase.conversationId || '',
              customer_name: selectedCase.customerName || 'Customer',
              status: selectedCase.status,
              messages: (selectedCase.handoffContext.history_summary || []).map((h: any, idx: number) => ({
                message_id: `hist-${idx}`,
                role: h.role,
                content: h.content,
                turn_index: idx,
              })),
              timeline: [],
              tool_executions: [],
              intents: [],
              policy_decisions: [],
              sentiment: selectedCase.handoffContext.sentiment || 'neutral',
              summary: selectedCase.handoffContext.summary || '',
            })
          }
        })
        .finally(() => setIsLoadingDetail(false))
      return
    }

    // Otherwise, for refunds/investigations, fetch latest conversation for this customer
    if (selectedCase.customerId) {
      fetch(`/api/v1/conversations/history/${selectedCase.customerId}?limit=3`)
        .then(res => (res.ok ? res.json() : []))
        .then(async (historyItems) => {
          if (Array.isArray(historyItems) && historyItems.length > 0) {
            const latest = historyItems[0]
            const success = await fetchConvDetail(latest.conversation_id)
            if (!success) {
              setConversationDetail({
                conversation_id: latest.conversation_id,
                customer_name: selectedCase.customerName || 'Customer',
                status: latest.status,
                messages: (latest.messages || []).map((m: any) => ({
                  message_id: m.message_id || Math.random().toString(),
                  role: m.role,
                  content: m.content,
                  turn_index: m.turn_index,
                  timestamp: m.timestamp,
                  sentiment: m.sentiment,
                })),
                timeline: [],
                tool_executions: [],
                intents: [],
                policy_decisions: [],
                sentiment: latest.sentiment || 'neutral',
                summary: latest.summary || '',
              })
            }
          } else {
            setConversationDetail(null)
          }
        })
        .catch(() => setConversationDetail(null))
        .finally(() => setIsLoadingDetail(false))
    } else {
      setConversationDetail(null)
      setIsLoadingDetail(false)
    }
  }, [selectedCase])

  // Submit human review decision
  const handleSubmitDecision = async () => {
    if (!selectedCase) return
    setIsSubmitting(true)
    setDecisionFeedback(null)

    try {
      if (selectedCase.type === 'escalation') {
        const params = new URLSearchParams({
          status: actionStatus,
          resolved_by: resolverName.trim() || 'Supervisor',
        })
        const res = await fetch(`/api/v1/analytics/escalations/${selectedCase.id}?${params}`, {
          method: 'PATCH',
        })
        if (!res.ok) throw new Error('Failed to update escalation status')
        setDecisionFeedback({ type: 'success', message: `Escalation marked as ${actionStatus.toUpperCase()} successfully.` })
      } else {
        // Refund or Investigation
        const body: any = {
          status: actionStatus,
          reviewed_by: resolverName.trim() || 'Supervisor',
          review_notes: reviewNotes.trim() || null,
          rejection_reason: actionStatus === 'rejected' ? (reviewNotes.trim() || 'Rejected after supervisor investigation') : null,
        }
        if (actionStatus === 'approved' && approvedAmount) {
          body.approved_amount = parseFloat(approvedAmount)
        }
        const res = await fetch(`/api/v1/billing/refunds/${selectedCase.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Failed to submit refund determination')
        }
        setDecisionFeedback({ type: 'success', message: `Case ${selectedCase.refNumber} submitted as ${actionStatus.toUpperCase()} successfully.` })
      }
      onRefreshAll()
    } catch (err: any) {
      setDecisionFeedback({ type: 'error', message: err.message || 'Operation failed' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Derive active customer mood from handoffContext, conversationDetail, or intent events
  const detectedMood = useMemo(() => {
    if (selectedCase?.handoffContext?.sentiment && selectedCase.handoffContext.sentiment.toLowerCase() !== 'unknown') {
      return selectedCase.handoffContext.sentiment.toLowerCase()
    }
    if (conversationDetail?.sentiment && conversationDetail.sentiment.toLowerCase() !== 'unknown') {
      return conversationDetail.sentiment.toLowerCase()
    }
    if (conversationDetail?.intents && conversationDetail.intents.length > 0) {
      for (let i = conversationDetail.intents.length - 1; i >= 0; i--) {
        const s = conversationDetail.intents[i]?.sentiment
        if (s && s.toLowerCase() !== 'unknown' && s.toLowerCase() !== 'neutral') {
          return s.toLowerCase()
        }
      }
      const last = conversationDetail.intents[conversationDetail.intents.length - 1]?.sentiment
      if (last && last.toLowerCase() !== 'unknown') return last.toLowerCase()
    }
    const intentEvents = conversationDetail?.timeline?.filter((t) => t.type === 'intent' && t.detail?.includes('Sentiment:')) || []
    for (let i = intentEvents.length - 1; i >= 0; i--) {
      const match = intentEvents[i].detail?.match(/Sentiment:\s*([A-Za-z]+)/i)
      if (match && match[1].toLowerCase() !== 'unknown') return match[1].toLowerCase()
    }
    return 'neutral'
  }, [selectedCase, conversationDetail])

  const moodStyle = sentimentColor(detectedMood)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
    }}>
      {/* ── Top Header Navigation Bar ─────────────────────────────────────────── */}
      <header style={{
        height: 56,
        padding: '0 24px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        gap: 20,
      }}>
        {/* Left: Back Button & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            id="back-to-billing-btn"
            type="button"
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 14px', borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.borderColor = 'var(--accent-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              e.currentTarget.style.borderColor = 'var(--border)'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Billing
          </button>

          <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Human Evaluation Workspace
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Supervisor Dossier & Determination Console
            </div>
          </div>
        </div>

        {/* Center: Queue Switcher Tabs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,0,0,0.25)', padding: 4, borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
        }}>
          <button
            type="button"
            onClick={() => setActiveQueue('refund')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 'var(--radius-md)',
              border: 'none', cursor: 'pointer',
              background: activeQueue === 'refund' ? 'var(--bg-card)' : 'transparent',
              color: activeQueue === 'refund' ? '#f59e0b' : 'var(--text-secondary)',
              boxShadow: activeQueue === 'refund' ? 'var(--shadow-sm)' : 'none',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Refund Approvals
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10,
              background: activeQueue === 'refund' ? 'rgba(245,158,11,0.2)' : 'rgba(255,255,255,0.06)',
              color: activeQueue === 'refund' ? '#f59e0b' : 'var(--text-muted)',
              fontWeight: 700,
            }}>
              {refunds.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveQueue('investigation')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 'var(--radius-md)',
              border: 'none', cursor: 'pointer',
              background: activeQueue === 'investigation' ? 'var(--bg-card)' : 'transparent',
              color: activeQueue === 'investigation' ? '#ef4444' : 'var(--text-secondary)',
              boxShadow: activeQueue === 'investigation' ? 'var(--shadow-sm)' : 'none',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            Investigations
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10,
              background: activeQueue === 'investigation' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)',
              color: activeQueue === 'investigation' ? '#ef4444' : 'var(--text-muted)',
              fontWeight: 700,
            }}>
              {investigations.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveQueue('escalation')}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 14px', borderRadius: 'var(--radius-md)',
              border: 'none', cursor: 'pointer',
              background: activeQueue === 'escalation' ? 'var(--bg-card)' : 'transparent',
              color: activeQueue === 'escalation' ? '#f97316' : 'var(--text-secondary)',
              boxShadow: activeQueue === 'escalation' ? 'var(--shadow-sm)' : 'none',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Escalation Queue
            <span style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 10,
              background: activeQueue === 'escalation' ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.06)',
              color: activeQueue === 'escalation' ? '#f97316' : 'var(--text-muted)',
              fontWeight: 700,
            }}>
              {escalations.length}
            </span>
          </button>
        </div>

        {/* Right: Refresh & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={onRefreshAll}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontSize: 11.5, cursor: 'pointer',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh Queue
          </button>
        </div>
      </header>

      {/* ── Main Workspace Body (Master-Detail Split Screen) ──────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left Panel: Case List & Filters (340px) ────────────────────────── */}
        <aside style={{
          width: 340,
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-secondary)',
          display: 'flex', flexDirection: 'column', flexShrink: 0,
        }}>
          {/* Filter Toolbar */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-primary)', padding: '6px 10px',
              borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference, customer…"
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-primary)',
                  fontSize: 12, outline: 'none', width: '100%',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
                >
                  ✕
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: statusFilter === 'pending' ? 'var(--accent-primary)' : 'transparent',
                  color: statusFilter === 'pending' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                Pending Review
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                style={{
                  flex: 1, padding: '5px 8px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  background: statusFilter === 'all' ? 'var(--accent-primary)' : 'transparent',
                  color: statusFilter === 'all' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                All Records ({normalizedCases.length})
              </button>
            </div>
          </div>

          {/* Cases List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
            {filteredCases.length === 0 ? (
              <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No cases found in this view
              </div>
            ) : (
              filteredCases.map((c) => {
                const isSelected = c.id === selectedCaseId
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    style={{
                      padding: '12px 14px',
                      marginBottom: 8,
                      borderRadius: 'var(--radius-lg)',
                      background: isSelected ? 'rgba(15,118,110,0.12)' : 'var(--bg-primary)',
                      border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--accent-primary)' }}>
                        {c.refNumber}
                      </span>
                      {c.amount != null ? (
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>
                          ₹{fmt(c.amount)}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
                          padding: '2px 6px', borderRadius: 4,
                          background: 'rgba(249,115,22,0.15)', color: '#f97316',
                        }}>
                          Escalated
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                      {c.customerName || 'Policyholder'}
                    </div>

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.reason.replace(/_/g, ' ')}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: priorityColor(c.priority),
                        }} />
                        <span style={{ fontSize: 10, color: priorityColor(c.priority), fontWeight: 700, textTransform: 'uppercase' }}>
                          {c.priority}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {fmtDateTime(c.createdAt)}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        {/* ── Right Panel: Deep-Dive Evaluation Dossier & Action Console ─────── */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          padding: '24px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {!selectedCase ? (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Select a case from the queue to review</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Full transcript, customer sentiment, and AI investigation findings will appear here.</div>
            </div>
          ) : (
            <>
              {/* Dossier Header & Telemetry Strip */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xl)',
                padding: '20px 24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 20,
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700,
                      color: 'var(--accent-primary)', background: 'rgba(15,118,110,0.15)',
                      padding: '3px 8px', borderRadius: 4,
                    }}>
                      {selectedCase.refNumber}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      padding: '3px 8px', borderRadius: 4,
                      background: `${priorityColor(selectedCase.priority)}15`,
                      color: priorityColor(selectedCase.priority),
                      border: `1px solid ${priorityColor(selectedCase.priority)}30`,
                    }}>
                      {selectedCase.priority} Priority
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      padding: '3px 8px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)',
                    }}>
                      Status: {selectedCase.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    {selectedCase.customerName || 'Policyholder'}
                  </h2>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Customer ID: {selectedCase.customerId} {selectedCase.customerEmail ? `· ${selectedCase.customerEmail}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 18, textAlign: 'right' }}>
                  {selectedCase.amount != null && (
                    <div style={{
                      padding: '10px 16px', background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-lg)',
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Requested Amount
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: '#f59e0b' }}>
                        ₹{fmt(selectedCase.amount)}
                      </div>
                    </div>
                  )}

                  <div style={{
                    padding: '10px 16px', background: 'rgba(255,255,255,0.02)',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Submission Time
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
                      {fmtDateTime(selectedCase.createdAt)}
                    </div>
                  </div>
                </div>
              </div>

              {/* 2-Column Evaluation Insights: Mood & Escalation Reason */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                
                {/* Customer Mood & Sentiment Card */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: `1px solid ${moodStyle.border}`,
                  borderRadius: 'var(--radius-xl)',
                  padding: '18px 20px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Customer Mood & Emotional Tone
                    </div>
                    <span style={{
                      padding: '4px 10px', borderRadius: 12,
                      fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                      background: moodStyle.bg, color: moodStyle.color, border: `1px solid ${moodStyle.border}`,
                    }}>
                      {detectedMood}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                      Tone Assessment: <span style={{ color: moodStyle.color, textTransform: 'capitalize' }}>{detectedMood}</span>
                    </div>
                    {conversationDetail?.intents && conversationDetail.intents.length > 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Identified Intent: {Array.from(new Set(conversationDetail.intents.flatMap((i: any) => i.detected_intents || []))).map((s: any) => String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ') || 'General Inquiry'}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Tone evaluated through real-time conversational analysis.
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 'auto' }}>
                    Priority: <span style={{ textTransform: 'uppercase', color: priorityColor(selectedCase.priority), fontWeight: 700 }}>{selectedCase.priority}</span>
                  </div>
                </div>

                {/* Reason for Review / Escalation Card */}
                <div style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-xl)',
                  padding: '18px 20px',
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Reason for Human Review & Policy Gate
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>
                    {selectedCase.reason.replace(/_/g, ' ')}
                  </div>

                  {selectedCase.escalationReason && selectedCase.escalationReason !== selectedCase.reason && (
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                      {selectedCase.escalationReason}
                    </div>
                  )}

                  {selectedCase.handoffContext && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 'auto' }}>
                      {selectedCase.handoffContext.turn_count != null && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          Turn Count: <strong style={{ color: 'var(--text-primary)' }}>{selectedCase.handoffContext.turn_count}</strong>
                        </span>
                      )}
                      {selectedCase.handoffContext.customer_verified != null && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          Verified: <strong style={{ color: selectedCase.handoffContext.customer_verified ? '#22c55e' : '#ef4444' }}>{selectedCase.handoffContext.customer_verified ? 'Yes' : 'No'}</strong>
                        </span>
                      )}
                      {selectedCase.handoffContext.domain && (
                        <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          Domain: <strong style={{ color: 'var(--accent-primary)', textTransform: 'capitalize' }}>{selectedCase.handoffContext.domain}</strong>
                        </span>
                      )}
                    </div>
                  )}

                  {selectedCase.thresholdExceeded && (
                    <div style={{
                      marginTop: 'auto',
                      padding: '6px 10px', borderRadius: 'var(--radius-md)',
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                      fontSize: 11.5, color: '#ef4444', fontWeight: 600,
                    }}>
                      Gate: Requested amount ₹{fmt(selectedCase.amount)} exceeds policy autonomous threshold of ₹{fmt(selectedCase.thresholdAmount || 5000)}.
                    </div>
                  )}
                </div>

              </div>

              {/* Autonomous System Actions & Evidence Ledger */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xl)',
                padding: '20px 24px',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                    {selectedCase.type === 'escalation' ? 'Autonomous Actions & Tools Executed' : 'Autonomous Ledger & Policy Validations'}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {selectedCase.type === 'escalation' ? 'Logged by InsureAI Orchestrator' : 'Evaluated by Policy Engine'}
                  </span>
                </div>

                {selectedCase.type === 'escalation' ? (
                  conversationDetail?.tool_executions && conversationDetail.tool_executions.length > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                      {conversationDetail.tool_executions.map((t: any, idx: number) => {
                        const toolTimelineItem = conversationDetail.timeline?.find((tl: any) => tl.type === 'tool_completed' && tl.label?.toLowerCase().includes(t.tool_name.replace(/_/g, ' ')))
                        const displayDetail = toolTimelineItem?.detail || (t.output ? JSON.stringify(t.output).slice(0, 90) + '…' : 'Executed successfully')
                        return (
                          <div key={t.tool_id || idx} style={{
                            padding: '12px 14px', borderRadius: 'var(--radius-lg)',
                            background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)',
                            display: 'flex', flexDirection: 'column', gap: 6,
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                Tool Execution
                              </span>
                              <span style={{
                                fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                background: t.status === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                                color: t.status === 'success' ? '#22c55e' : '#ef4444',
                                textTransform: 'uppercase',
                              }}>
                                {t.status} {t.duration_ms ? `· ${t.duration_ms}ms` : ''}
                              </span>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {t.tool_name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                            </div>
                            <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                              {displayDetail}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Escalation Status</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', textTransform: 'capitalize' }}>{selectedCase.status}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Registered in supervisor database</div>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Customer Verification</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: selectedCase.handoffContext?.customer_verified ? '#22c55e' : '#94a3b8' }}>
                          {selectedCase.handoffContext?.customer_verified ? 'Verified' : 'Unverified'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Session authentication standing</div>
                      </div>
                      <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Session Interaction</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                          {selectedCase.handoffContext?.turn_count || conversationDetail?.messages.length || 0} Turns Logged
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Handoff triggered after interaction</div>
                      </div>
                    </div>
                  )
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Policy Threshold Gate</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selectedCase.thresholdExceeded ? '#ef4444' : '#22c55e' }}>
                        {selectedCase.thresholdExceeded ? `Exceeded (₹${fmt(selectedCase.amount)} > ₹${fmt(selectedCase.thresholdAmount || threshold)})` : 'Within Threshold Limit'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Requires manual supervisor approval</div>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Case Status</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', textTransform: 'capitalize' }}>
                        {selectedCase.status.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Reference: {selectedCase.refNumber}</div>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Customer Standing</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {selectedCase.customerName || 'Policyholder'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>ID: {selectedCase.customerId}</div>
                    </div>

                    <div style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Resolution Deadline</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {selectedCase.slaDeadline ? fmtDateTime(selectedCase.slaDeadline) : 'Standard 24h SLA'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Guaranteed turnaround window</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Complete Conversation Transcript */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xl)',
                padding: '20px 24px',
                display: 'flex', flexDirection: 'column', gap: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      Complete Conversation Transcript
                    </div>
                    {conversationDetail?.messages && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)',
                      }}>
                        {conversationDetail.messages.length} messages
                      </span>
                    )}
                  </div>
                  {conversationDetail?.conversation_id && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Session: {conversationDetail.conversation_id.slice(0, 13)}…
                    </span>
                  )}
                </div>

                {/* Transcript Message Scroll Area */}
                <div style={{
                  maxHeight: 360,
                  overflowY: 'auto',
                  display: 'flex', flexDirection: 'column', gap: 10,
                  paddingRight: 6,
                }}>
                  {isLoadingDetail ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      Loading verified conversation transcript…
                    </div>
                  ) : !conversationDetail || conversationDetail.messages.length === 0 ? (
                    <div style={{
                      padding: '30px', textAlign: 'center',
                      background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)',
                      color: 'var(--text-muted)', fontSize: 12,
                    }}>
                      No conversation audio or text session recorded directly for this case. Case was submitted via administrative invoice portal or batch reconciliation.
                    </div>
                  ) : (
                    conversationDetail.messages.map((m, idx) => {
                      const isCustomer = m.role === 'user' || m.role === 'customer'
                      return (
                        <div
                          key={m.message_id || idx}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: isCustomer ? 'flex-start' : 'flex-end',
                            gap: 4,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              fontSize: 10.5, fontWeight: 700,
                              color: isCustomer ? 'var(--text-primary)' : 'var(--accent-primary)',
                            }}>
                              {isCustomer ? (selectedCase.customerName || 'Customer') : 'InsureAI Agent'}
                            </span>
                            {m.timestamp && (
                              <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                          </div>
                          <div style={{
                            maxWidth: '85%',
                            padding: '10px 14px',
                            borderRadius: isCustomer ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                            background: isCustomer ? 'rgba(255,255,255,0.06)' : 'rgba(15,118,110,0.18)',
                            border: isCustomer ? '1px solid var(--border)' : '1px solid rgba(15,118,110,0.35)',
                            fontSize: 13,
                            color: 'var(--text-primary)',
                            lineHeight: 1.5,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}>
                            {m.content}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Human Decision & Action Console */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-xl)',
                padding: '22px 26px',
                display: 'flex', flexDirection: 'column', gap: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Human Determination & Action Console
                </div>

                {decisionFeedback && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: decisionFeedback.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    border: decisionFeedback.type === 'success' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(239,68,68,0.3)',
                    color: decisionFeedback.type === 'success' ? '#22c55e' : '#ef4444',
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {decisionFeedback.message}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                  {/* Action Selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                      DECISION
                    </label>
                    <select
                      value={actionStatus}
                      onChange={(e) => setActionStatus(e.target.value as any)}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontSize: 12.5, outline: 'none',
                      }}
                    >
                      {selectedCase.type === 'escalation' ? (
                        <>
                          <option value="resolved">Mark Resolved (Close Escalation)</option>
                          <option value="assigned">Assign to Specialist</option>
                          <option value="open">Keep Open / Request Details</option>
                        </>
                      ) : (
                        <>
                          <option value="approved">Approve Refund</option>
                          <option value="rejected">Reject & Close Case</option>
                          <option value="escalated">Escalate to Legal / Compliance</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Approved Amount (for refunds) */}
                  {selectedCase.type !== 'escalation' && actionStatus === 'approved' && (
                    <div>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                        APPROVED AMOUNT (₹)
                      </label>
                      <input
                        type="number"
                        value={approvedAmount}
                        onChange={(e) => setApprovedAmount(e.target.value)}
                        placeholder={`Max: ₹${selectedCase.amount}`}
                        style={{
                          width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-primary)', border: '1px solid var(--border)',
                          color: 'var(--text-primary)', fontSize: 12.5, outline: 'none',
                        }}
                      />
                    </div>
                  )}

                  {/* Resolver / Supervisor Identity */}
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                      SUPERVISOR IDENTITY
                    </label>
                    <input
                      type="text"
                      value={resolverName}
                      onChange={(e) => setResolverName(e.target.value)}
                      placeholder="Supervisor Name"
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-primary)', border: '1px solid var(--border)',
                        color: 'var(--text-primary)', fontSize: 12.5, outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Supervisor Notes */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    DETERMINATION NOTES & JUSTIFICATION {actionStatus === 'rejected' && <span style={{ color: '#ef4444' }}>* (Required)</span>}
                  </label>
                  <textarea
                    rows={3}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder={
                      actionStatus === 'approved'
                        ? 'State reason for approval (e.g., verified ledger line items, authorized under special customer retention policy)…'
                        : actionStatus === 'rejected'
                        ? 'State exact justification for rejection (e.g., duplicate claim already credited, service active during period)…'
                        : 'Provide handoff notes for legal/compliance review…'
                    }
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-primary)', border: '1px solid var(--border)',
                      color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', resize: 'vertical',
                    }}
                  />
                </div>

                {/* Submit Button */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleSubmitDecision}
                    disabled={isSubmitting || (actionStatus === 'rejected' && !reviewNotes.trim())}
                    style={{
                      padding: '10px 24px', borderRadius: 'var(--radius-md)',
                      border: 'none', cursor: isSubmitting || (actionStatus === 'rejected' && !reviewNotes.trim()) ? 'not-allowed' : 'pointer',
                      background: actionStatus === 'approved' || actionStatus === 'resolved'
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : actionStatus === 'rejected'
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                        : 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      opacity: isSubmitting || (actionStatus === 'rejected' && !reviewNotes.trim()) ? 0.6 : 1,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {isSubmitting ? 'Persisting Decision…' : `Submit ${actionStatus.toUpperCase()} Determination`}
                  </button>
                </div>
              </div>
            </>
          )}
        </main>

      </div>
    </div>
  )
}
