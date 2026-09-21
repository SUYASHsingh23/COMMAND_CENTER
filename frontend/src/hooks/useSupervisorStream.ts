import { useEffect, useRef } from 'react'
import { supervisorWsClient } from '@/services/websocket'
import { useSupervisorStore } from '@/store/supervisor'
import type { AnyEvent } from '@/types/events'

export function useSupervisorStream() {
  const store = useSupervisorStore()
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    supervisorWsClient.connectSupervisor()

    const unsub = supervisorWsClient.on((event: AnyEvent) => {
      const sid = event.session_id
      const ts = event.timestamp

      switch (event.event) {
        case 'session.created':
          store.upsertSession({
            session_id: sid,
            conversation_id: event.conversation_id,
            channel: event.channel ?? 'web',
            status: 'active',
            started_at: ts,
          })
          break

        case 'session.ended':
          store.setSessionStatus(sid, 'completed')
          break

        case 'transcript.partial':
          store.setPartialTranscript(sid, event.text)
          break

        case 'transcript.final':
          store.setPartialTranscript(sid, '')
          store.addMessage(sid, {
            message_id: crypto.randomUUID(),
            conversation_id: '',
            role: 'customer',
            content: event.text,
            timestamp: ts,
            turn_index: event.turn_index ?? null,
          })
          break

        case 'response.generated':
          store.setLastResponse(sid, event.text)
          store.addMessage(sid, {
            message_id: crypto.randomUUID(),
            conversation_id: '',
            role: 'agent',
            content: event.text,
            timestamp: ts,
            turn_index: null,
          })
          store.addTimelineEntry(sid, {
            type: 'response',
            timestamp: ts,
            label: 'Response Generated',
            detail: event.text,
          })
          break

        case 'intent.detected':
          store.setIntents(sid, event.intents, event.entities as Record<string, string>)
          store.setSentiment(sid, event.sentiment, event.urgency)
          store.addTimelineEntry(sid, {
            type: 'intent',
            timestamp: ts,
            label: `Intent: ${event.intents.slice(0, 2).join(', ')}`,
            detail: `Sentiment: ${event.sentiment} · Urgency: ${event.urgency}`,
          })
          break

        case 'sentiment.updated':
          store.setSentiment(sid, event.sentiment, event.urgency ?? 'medium')
          break

        case 'tool.started':
          store.addTimelineEntry(sid, {
            type: 'tool_started',
            timestamp: ts,
            label: `Tool: ${event.tool_name}`,
            detail: 'executing…',
            status: 'running',
          })
          break

        case 'tool.completed': {
          const toolTitle = (event.tool_name || 'tool').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          store.addToolExecution(sid, {
            exec_id: crypto.randomUUID(),
            conversation_id: '',
            tool_name: event.tool_name,
            input_params: event.input_params ?? {},
            output: event.output,
            status: event.status as 'success' | 'failed' | 'timeout',
            duration_ms: event.duration_ms,
            timestamp: ts,
          })
          store.addTimelineEntry(sid, {
            type: 'tool_completed',
            timestamp: ts,
            label: `Tool: ${toolTitle}`,
            detail: `${event.status === 'success' ? 'Execution completed' : event.status} (${event.duration_ms}ms)`,
            status: event.status,
            output: event.output,
            input_params: event.input_params,
            duration_ms: event.duration_ms,
          })
          break
        }

        case 'policy.decision':
          store.addPolicyDecision(sid, {
            policy_name: event.policy_name,
            action_proposed: event.action_proposed,
            authorized: event.authorized,
            reason: event.reason,
            timestamp: ts,
          })
          store.addTimelineEntry(sid, {
            type: 'policy',
            timestamp: ts,
            label: `Policy: ${event.policy_name}`,
            detail: event.reason,
            authorized: event.authorized,
            status: event.authorized ? 'allowed' : 'blocked',
          })
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

          store.addWorkflowStep(sid, {
            workflow_name: event.workflow_name,
            step_name: event.step_name,
            step_status: event.step_status,
            steps_completed: event.steps_completed,
            timestamp: ts,
            detail: event.detail,
            evidence: event.evidence,
            rule: event.rule,
            decision: event.decision,
            step_number: event.step_number,
          })
          store.addTimelineEntry(sid, {
            type: stepType,
            timestamp: ts,
            label: `${wfDisplay} → ${stepDisplay}`,
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

        case 'plan.generated': {
          const steps = (event.steps ?? []) as Array<{ tool: string; reason: string }>
          if (event.direct_answer) {
            store.addTimelineEntry(sid, {
              type: 'plan',
              timestamp: ts,
              label: 'Plan: Direct Answer',
              detail: 'No tools needed — responding from context',
              status: 'success',
            })
          } else if (steps.length > 0) {
            const toolNames = steps.map((s) => s.tool).join(', ')
            const reasons = steps.map((s) => `${s.tool}: ${s.reason}`).join(' · ')
            store.addTimelineEntry(sid, {
              type: 'plan',
              timestamp: ts,
              label: `Plan: ${steps.length} tool${steps.length !== 1 ? 's' : ''} → ${toolNames}`,
              detail: reasons,
              status: 'in_progress',
            })
          }
          break
        }

        case 'escalation.created':
          store.setEscalated(sid)
          store.addEscalationAlert({
            session_id: sid,
            reason: event.reason,
            domain: event.domain,
            sentiment: event.sentiment,
            turn_count: event.turn_count,
            timestamp: ts,
          })
          store.addTimelineEntry(sid, {
            type: 'intent',
            timestamp: ts,
            label: '🚨 Escalation Triggered',
            detail: event.reason,
            status: 'escalated',
          })
          break

        case 'call.summary':
          store.setCallSummary(sid, {
            summary_text: event.summary_text,
            resolution: event.resolution,
            escalated: event.escalated,
            duration_sec: event.duration_sec,
            tools_used: event.tools_used,
          })
          store.addTimelineEntry(sid, {
            type: 'response',
            timestamp: ts,
            label: `Call Summary: ${event.resolution}`,
            detail: event.summary_text,
            status: event.resolution,
          })
          break

        default:
          break
      }
    })

    unsubRef.current = unsub

    return () => {
      unsub()
      supervisorWsClient.disconnect()
    }
  }, [])
}
