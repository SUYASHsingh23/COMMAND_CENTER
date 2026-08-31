import { create } from 'zustand'
import type { Message, Session, Intent } from '@/types/conversation'
import type { ToolExecution, WorkflowExecution, PolicyDecision } from '@/types/tools'

interface ConversationStore {
  session: Session | null
  messages: Message[]
  partialTranscript: string
  currentIntents: string[]
  entities: Record<string, string>
  sentiment: string
  urgency: string
  toolExecutions: ToolExecution[]
  workflowExecutions: WorkflowExecution[]
  policyDecisions: PolicyDecision[]
  isConnected: boolean
  isListening: boolean

  setSession: (session: Session | null) => void
  addMessage: (message: Message) => void
  setPartialTranscript: (text: string) => void
  setIntents: (intents: string[], entities: Record<string, string>) => void
  setSentiment: (sentiment: string, urgency?: string) => void
  addToolExecution: (exec: ToolExecution) => void
  addWorkflowExecution: (exec: WorkflowExecution) => void
  addPolicyDecision: (decision: PolicyDecision) => void
  setConnected: (connected: boolean) => void
  setListening: (listening: boolean) => void
  reset: () => void
}

const initialState = {
  session: null,
  messages: [],
  partialTranscript: '',
  currentIntents: [],
  entities: {},
  sentiment: 'neutral',
  urgency: 'medium',
  toolExecutions: [],
  workflowExecutions: [],
  policyDecisions: [],
  isConnected: false,
  isListening: false,
}

export const useConversationStore = create<ConversationStore>((set) => ({
  ...initialState,

  setSession: (session) => set({ session }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
      partialTranscript: message.role === 'customer' ? '' : state.partialTranscript,
    })),

  setPartialTranscript: (text) => set({ partialTranscript: text }),

  setIntents: (intents, entities) => set({ currentIntents: intents, entities }),

  setSentiment: (sentiment, urgency) =>
    set((state) => ({ sentiment, urgency: urgency ?? state.urgency })),

  addToolExecution: (exec) =>
    set((state) => ({ toolExecutions: [...state.toolExecutions, exec] })),

  addWorkflowExecution: (exec) =>
    set((state) => ({ workflowExecutions: [...state.workflowExecutions, exec] })),

  addPolicyDecision: (decision) =>
    set((state) => ({ policyDecisions: [...state.policyDecisions, decision] })),

  setConnected: (connected) => set({ isConnected: connected }),

  setListening: (listening) => set({ isListening: listening }),

  reset: () => set(initialState),
}))
