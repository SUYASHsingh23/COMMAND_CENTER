import { useEffect, useRef } from 'react'
import { wsClient } from '@/services/websocket'
import { useConversationStore } from '@/store/conversation'
import type { AnyEvent } from '@/types/events'

// Human-friendly tool name map
const TOOL_LABELS: Record<string, string> = {
  get_customer:          'Customer Profile Lookup',
  get_account:           'Account Details Query',
  get_invoice:           'Invoice Retrieval',
  get_invoice_detail:    'Invoice Line Items Verification',
  get_payment_history:   'Payment History Ledger',
  issue_refund:          'Refund Settlement Engine',
  get_claim_status:      'Claim Status Verification',
  get_policy_coverage:   'Policy Coverage Knowledge Base',
  create_ticket:         'Support Ticket Generation',
  schedule_engineer:     'Engineer Dispatch Scheduling',
  update_customer_details: 'Customer Record Update',
  escalate_to_human:     'Specialist Escalation Router',
  pay_outstanding_balance: 'Payment Settlement Gateway',
}

export function useEventStream(sessionId: string | null) {
  const store = useConversationStore()
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sessionId) return

    // If conversation_id is available, optionally hydrate timeline
    const convId = store.session?.conversation_id
    if (convId) {
      fetch(`/api/v1/analytics/conversations/${convId}/detail`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.timeline && Array.isArray(data.timeline)) {
            store.setTimeline(data.timeline)
          }
        })
        .catch(() => {
          // Ignore fetch error in local/mock environments
        })
    }

    wsClient.connect(sessionId)

    const unsub = wsClient.on((event: AnyEvent) => {
      const ts = event.timestamp || new Date().toISOString()

      switch (event.event) {
        case 'transcript.partial':
          store.setPartialTranscript(event.text)
          break

        case 'transcript.final':
          store.setPartialTranscript('')
          store.addMessage({
            message_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            role: 'customer',
            content: event.text,
            timestamp: ts,
            turn_index: event.turn_index,
          })
          store.addTimelineEntry({
            type: 'message_user',
            timestamp: ts,
            label: 'Customer',
            detail: event.text,
            turn_index: event.turn_index,
          })
          break

        case 'intent.detected': {
          store.setIntents(event.intents, event.entities)
          store.setSentiment(event.sentiment, event.urgency)
          const detectedStr = event.intents.slice(0, 2).map((i: string) => i.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(', ')
          store.addTimelineEntry({
            type: 'intent',
            timestamp: ts,
            label: `Intent: ${detectedStr || 'General Inquiry'}`,
            detail: `Sentiment: ${event.sentiment ? event.sentiment.charAt(0).toUpperCase() + event.sentiment.slice(1) : 'Neutral'} · Urgency: ${event.urgency ? event.urgency.charAt(0).toUpperCase() + event.urgency.slice(1) : 'Medium'}`,
          })
          break
        }

        case 'plan.generated': {
          if (event.direct_answer) {
            store.addTimelineEntry({
              type: 'plan',
              timestamp: ts,
              label: 'Plan: Direct Answer',
              detail: 'Responding directly from verified context — no external tools needed',
              status: 'completed',
            })
          } else if (event.steps?.length > 0) {
            const toolNames = event.steps.map((s: any) => (s.tool || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(', ')
            const stepReasons = event.steps.map((s: any) => s.reason).filter(Boolean)
            store.addTimelineEntry({
              type: 'plan',
              timestamp: ts,
              label: `Plan: ${event.steps.length} Tool${event.steps.length !== 1 ? 's' : ''} Queued`,
              detail: `Sequence: ${toolNames}${stepReasons.length > 0 ? ' · ' + stepReasons[0] : ''}`,
              steps: event.steps,
            })
          }
          break
        }

        case 'tool.started': {
          const toolTitle = TOOL_LABELS[event.tool_name] || (event.tool_name || 'Tool').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          store.addTimelineEntry({
            type: 'tool_started',
            timestamp: ts,
            label: `Tool: ${toolTitle}`,
            detail: 'Executing operation…',
            status: 'running',
          })
          break
        }

        case 'tool.completed': {
          const toolTitle = TOOL_LABELS[event.tool_name] || (event.tool_name || 'Tool').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          let summaryDesc = event.status === 'success' ? 'Execution completed' : `Status: ${event.status}`
          if (event.output && typeof event.output === 'object') {
            const out = event.output as Record<string, any>
            if (out.message) summaryDesc = out.message
            else if (out.refund_number) summaryDesc = `Refund ${out.refund_number} processed (Rs.${out.amount})`
            else if (out.ticket_number) summaryDesc = `Ticket ${out.ticket_number} created`
            else if (Array.isArray(out.invoices)) summaryDesc = `Found ${out.invoices.length} invoice(s)`
            else if (out.account_number) summaryDesc = `Account ${out.account_number} retrieved`
          }
          const durStr = event.duration_ms !== undefined ? ` (${event.duration_ms}ms)` : ''

          store.addToolExecution({
            exec_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            tool_name: event.tool_name,
            input_params: event.input_params ?? {},
            output: event.output,
            status: event.status as 'success' | 'failed' | 'timeout',
            duration_ms: event.duration_ms,
            timestamp: ts,
          })

          store.addTimelineEntry({
            type: 'tool_completed',
            timestamp: ts,
            label: `Tool: ${toolTitle}`,
            detail: `${summaryDesc}${durStr}`,
            status: event.status,
            duration_ms: event.duration_ms,
            input_params: event.input_params,
            output: event.output,
          })
          break
        }

        case 'response.generated':
          store.addMessage({
            message_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            role: 'agent',
            content: event.text,
            timestamp: ts,
            turn_index: null,
          })
          store.addTimelineEntry({
            type: 'response',
            timestamp: ts,
            label: 'Agent Response',
            detail: event.text,
          })
          break

        case 'sentiment.updated':
          store.setSentiment(event.sentiment, event.urgency ?? undefined)
          break

        case 'workflow.step': {
          const wfDisplay = (event.workflow_name || 'Workflow').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          const stepDisplay = (event.step_name || 'Step').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          
          let stepType: 'workflow_step' | 'document_verification' | 'policy_evaluation' | 'escalation' = 'workflow_step'
          const sNameLower = (event.step_name || '').toLowerCase()
          if (sNameLower.includes('verify') || sNameLower.includes('document') || event.evidence) {
            stepType = 'document_verification'
          } else if (sNameLower.includes('threshold') || sNameLower.includes('fraud') || sNameLower.includes('policy')) {
            stepType = 'policy_evaluation'
          } else if (sNameLower.includes('queue') || sNameLower.includes('escalat')) {
            stepType = 'escalation'
          }

          store.addWorkflowExecution({
            wf_exec_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            workflow_name: event.workflow_name ?? 'workflow',
            state: (['running', 'completed', 'failed'].includes(event.step_status) ? event.step_status : 'running') as 'running' | 'completed' | 'failed',
            steps_completed: event.steps_completed ?? [],
            started_at: ts,
            completed_at: event.step_status === 'completed' ? ts : null,
          })

          store.addTimelineEntry({
            type: stepType,
            timestamp: ts,
            label: `${wfDisplay} → ${event.step_number ? `Step ${event.step_number}: ` : ''}${stepDisplay}`,
            detail: event.detail || `Step: ${event.step_name} — ${event.step_status}`,
            status: event.step_status,
            evidence: event.evidence,
            rule: event.rule,
            decision: event.decision,
            workflow_name: event.workflow_name,
            step_number: event.step_number,
          })
          break
        }

        case 'escalation.created':
          store.addTimelineEntry({
            type: 'escalation',
            timestamp: ts,
            label: 'Human Routing Triggered',
            detail: event.reason || `Routed to ${event.domain ?? 'specialist'} queue`,
            status: 'escalated',
          })
          break

        case 'policy.decision':
          store.addPolicyDecision({
            decision_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            policy_name: event.policy_name,
            action_proposed: event.action_proposed,
            authorized: event.authorized,
            reason: event.reason,
            timestamp: ts,
          })
          store.addTimelineEntry({
            type: 'policy',
            timestamp: ts,
            label: `Policy Rule: ${(event.policy_name || 'Guardrail').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
            detail: event.reason,
            authorized: event.authorized,
            status: event.authorized ? 'allowed' : 'blocked',
          })
          break

        case 'call.summary':
          store.addTimelineEntry({
            type: 'response',
            timestamp: ts,
            label: `Call Summary · ${(event.resolution || 'completed').toUpperCase()}`,
            detail: event.summary_text,
            status: event.resolution,
          })
          break

        case 'session.ended': {
          store.addTimelineEntry({
            type: 'response',
            timestamp: ts,
            label: 'Session Concluded',
            detail: 'The session has been concluded.',
            status: 'completed',
          })
          store.setConnected(false)
          window.dispatchEvent(new CustomEvent('insureai:session-ended', { detail: event }))
          break
        }

        default:
          break
      }
    })

    unsubRef.current = unsub

    return () => {
      unsub()
      wsClient.disconnect()
    }
  }, [sessionId])
}
