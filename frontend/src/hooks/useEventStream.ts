import { useEffect, useRef } from 'react'
import { wsClient } from '@/services/websocket'
import { useConversationStore } from '@/store/conversation'
import type { AnyEvent } from '@/types/events'

export function useEventStream(sessionId: string | null) {
  const store = useConversationStore()
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sessionId) return

    wsClient.connect(sessionId)

    const unsub = wsClient.on((event: AnyEvent) => {
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
            timestamp: event.timestamp,
            turn_index: event.turn_index,
          })
          break

        case 'intent.detected':
          store.setIntents(event.intents, event.entities)
          store.setSentiment(event.sentiment, event.urgency)
          break

        case 'response.generated':
          store.addMessage({
            message_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            role: 'agent',
            content: event.text,
            timestamp: event.timestamp,
            turn_index: null,
          })
          break

        case 'sentiment.updated':
          store.setSentiment(event.sentiment, event.urgency ?? undefined)
          break

        case 'tool.completed':
          store.addToolExecution({
            exec_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            tool_name: event.tool_name,
            input_params: {},
            output: event.output,
            status: event.status as 'success' | 'failed' | 'timeout',
            duration_ms: event.duration_ms,
            timestamp: event.timestamp,
          })
          break

        case 'workflow.step':
          break

        case 'policy.decision':
          store.addPolicyDecision({
            decision_id: crypto.randomUUID(),
            conversation_id: store.session?.conversation_id ?? '',
            policy_name: event.policy_name,
            action_proposed: event.action_proposed,
            authorized: event.authorized,
            reason: event.reason,
            timestamp: event.timestamp,
          })
          break

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
