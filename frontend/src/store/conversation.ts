import { create } from 'zustand'
import type { Message, Session, Intent } from '@/types/conversation'
import type { ToolExecution, WorkflowExecution, PolicyDecision } from '@/types/tools'
import type { AgentTimelineEntry } from '@/store/supervisor'

export interface TraceEvent {
  id: string
  type: 'intent' | 'tool' | 'workflow' | 'response' | 'escalation' | 'plan'
  label: string
  detail?: string
  status: 'running' | 'completed' | 'failed' | 'info'
  timestamp: string
  /** For tool events: the tool name to match start→complete */
  toolName?: string
}

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
  traceEvents: TraceEvent[]
  agentTimeline: AgentTimelineEntry[]
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
  addTraceEvent: (event: TraceEvent) => void
  updateTraceEvent: (id: string, patch: Partial<TraceEvent>) => void
  addTimelineEntry: (entry: AgentTimelineEntry) => void
  setTimeline: (entries: AgentTimelineEntry[]) => void
  clearTimeline: () => void
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
  urgency: 'low',
  toolExecutions: [],
  workflowExecutions: [],
  policyDecisions: [],
  traceEvents: [],
  agentTimeline: [],
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

  addTraceEvent: (event) =>
    set((state) => ({
      traceEvents: [...state.traceEvents, event].slice(-12),
    })),

  updateTraceEvent: (id, patch) =>
    set((state) => ({
      traceEvents: state.traceEvents.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),

  addTimelineEntry: (entry) =>
    set((state) => {
      // If a running tool entry matches this completed one, update in place
      if (entry.type === 'tool_completed') {
        const runningIdx = state.agentTimeline.findLastIndex(
          (e) => e.type === 'tool_started' && e.label === entry.label && e.status === 'running'
        )
        if (runningIdx !== -1) {
          const updated = [...state.agentTimeline]
          updated[runningIdx] = entry
          return { agentTimeline: updated }
        }
      }
      return { agentTimeline: [...state.agentTimeline, entry] }
    }),

  setTimeline: (entries) => set({ agentTimeline: entries }),

  clearTimeline: () => set({ agentTimeline: [] }),

  setConnected: (connected) => set({ isConnected: connected }),

  setListening: (listening) => set({ isListening: listening }),

  reset: () => set(initialState),
}))
