import { useCallback } from 'react'
import { api } from '@/services/api'
import { useConversationStore } from '@/store/conversation'

export function useConversation() {
  const store = useConversationStore()

  const startSession = useCallback(async (customerId?: string) => {
    const session = await api.createSession({
      customer_id: customerId,
      channel: 'web',
      language: 'en',
    })
    store.setSession(session)
    store.setConnected(true)
    return session
  }, [store])

  const endSession = useCallback(async () => {
    if (!store.session) return
    await api.endSession(store.session.session_id)
    store.setConnected(false)
    store.reset()
  }, [store])

  return {
    session: store.session,
    messages: store.messages,
    partialTranscript: store.partialTranscript,
    currentIntents: store.currentIntents,
    sentiment: store.sentiment,
    urgency: store.urgency,
    isConnected: store.isConnected,
    isListening: store.isListening,
    startSession,
    endSession,
  }
}
