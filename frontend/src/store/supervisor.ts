import { create } from 'zustand'
import type { Message } from '@/types/conversation'
import type { ToolExecution } from '@/types/tools'

export interface RagPassage {
  title: string
  score: number
  category: string
}

export interface WorkflowStep {
  workflow_name: string
  step_name: string
  step_status: string
  steps_completed: string[]
  timestamp: string
}

export interface PolicyDecision {
  policy_name: string
  action_proposed: string
  authorized: boolean
  reason: string
  timestamp: string
}

export interface AgentTimelineEntry {
  type: 'intent' | 'tool_started' | 'tool_completed' | 'rag' | 'policy' | 'workflow_step' | 'response' | 'plan'
  timestamp: string
  label: string
  detail?: string
  status?: string
  authorized?: boolean
}

export interface CallSummaryData {
  summary_text: string
  resolution: string
  escalated: boolean
  duration_sec: number
  tools_used: string[]
}

export interface EscalationAlert {
  session_id: string
  reason: string
  domain: string
  sentiment: string
  turn_count: number
  timestamp: string
}

export interface SupervisorSession {
  session_id: string
  conversation_id: string
  channel: string
  status: 'active' | 'completed' | 'escalated'
  started_at: string
  sentiment: string
  urgency: string
  messages: Message[]
  intents: string[]
  entities: Record<string, string>
  tool_executions: ToolExecution[]
  rag_passages: RagPassage[]
  workflow_steps: WorkflowStep[]
  policy_decisions: PolicyDecision[]
  agent_timeline: AgentTimelineEntry[]
  partial_transcript: string
  last_response: string
  call_summary: CallSummaryData | null
  is_escalated: boolean
}

interface SupervisorStore {
  sessions: Record<string, SupervisorSession>
  activeSessionId: string | null
  escalationAlerts: EscalationAlert[]
  dashboardMetrics: {
    active_conversations: number
    total_conversations: number
    containment_rate: number
    escalation_rate: number
    sentiment_distribution: Record<string, number>
    top_tools: Array<{ tool: string; count: number }>
  } | null

  upsertSession: (session: Partial<SupervisorSession> & { session_id: string }) => void
  setSessionStatus: (sessionId: string, status: SupervisorSession['status']) => void
  addMessage: (sessionId: string, message: Message) => void
  setPartialTranscript: (sessionId: string, text: string) => void
  setIntents: (sessionId: string, intents: string[], entities: Record<string, string>) => void
  setSentiment: (sessionId: string, sentiment: string, urgency: string) => void
  addToolExecution: (sessionId: string, exec: ToolExecution) => void
  addRagPassages: (sessionId: string, passages: RagPassage[]) => void
  addWorkflowStep: (sessionId: string, step: WorkflowStep) => void
  addPolicyDecision: (sessionId: string, decision: PolicyDecision) => void
  addTimelineEntry: (sessionId: string, entry: AgentTimelineEntry) => void
  setLastResponse: (sessionId: string, text: string) => void
  setCallSummary: (sessionId: string, summary: CallSummaryData) => void
  setEscalated: (sessionId: string) => void
  addEscalationAlert: (alert: EscalationAlert) => void
  dismissEscalationAlert: (sessionId: string) => void
  setActiveSession: (sessionId: string | null) => void
  setDashboardMetrics: (metrics: SupervisorStore['dashboardMetrics']) => void
}

const defaultSession = (session_id: string): SupervisorSession => ({
  session_id,
  conversation_id: '',
  channel: 'web',
  status: 'active',
  started_at: new Date().toISOString(),
  sentiment: 'neutral',
  urgency: 'medium',
  messages: [],
  intents: [],
  entities: {},
  tool_executions: [],
  rag_passages: [],
  workflow_steps: [],
  policy_decisions: [],
  agent_timeline: [],
  partial_transcript: '',
  last_response: '',
  call_summary: null,
  is_escalated: false,
})

export const useSupervisorStore = create<SupervisorStore>((set) => ({
  sessions: {},
  activeSessionId: null,
  escalationAlerts: [],
  dashboardMetrics: null,

  upsertSession: (partial) =>
    set((state) => {
      const existing = state.sessions[partial.session_id] ?? defaultSession(partial.session_id)
      const updated = { ...existing, ...partial }
      return {
        sessions: { ...state.sessions, [partial.session_id]: updated },
        activeSessionId: state.activeSessionId ?? partial.session_id,
      }
    }),

  setSessionStatus: (sessionId, status) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, status } } }
    }),

  addMessage: (sessionId, message) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, messages: [...s.messages, message], partial_transcript: '' },
        },
      }
    }),

  setPartialTranscript: (sessionId, text) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, partial_transcript: text } } }
    }),

  setIntents: (sessionId, intents, entities) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, intents, entities } } }
    }),

  setSentiment: (sessionId, sentiment, urgency) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, sentiment, urgency } } }
    }),

  addToolExecution: (sessionId, exec) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, tool_executions: [...s.tool_executions, exec] },
        },
      }
    }),

  addRagPassages: (sessionId, passages) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, rag_passages: [...s.rag_passages, ...passages] },
        },
      }
    }),

  addWorkflowStep: (sessionId, step) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, workflow_steps: [...s.workflow_steps, step] },
        },
      }
    }),

  addPolicyDecision: (sessionId, decision) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, policy_decisions: [...s.policy_decisions, decision] },
        },
      }
    }),

  addTimelineEntry: (sessionId, entry) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...s, agent_timeline: [...s.agent_timeline, entry] },
        },
      }
    }),

  setLastResponse: (sessionId, text) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, last_response: text } } }
    }),

  setCallSummary: (sessionId, summary) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, call_summary: summary, status: 'completed' } } }
    }),

  setEscalated: (sessionId) =>
    set((state) => {
      const s = state.sessions[sessionId]
      if (!s) return state
      return { sessions: { ...state.sessions, [sessionId]: { ...s, is_escalated: true, status: 'escalated' } } }
    }),

  addEscalationAlert: (alert) =>
    set((state) => ({ escalationAlerts: [alert, ...state.escalationAlerts].slice(0, 20) })),

  dismissEscalationAlert: (sessionId) =>
    set((state) => ({ escalationAlerts: state.escalationAlerts.filter((a) => a.session_id !== sessionId) })),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  setDashboardMetrics: (metrics) => set({ dashboardMetrics: metrics }),
}))
