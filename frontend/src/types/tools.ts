export interface ToolExecution {
  exec_id: string
  conversation_id: string
  tool_name: string
  input_params: Record<string, unknown>
  output: Record<string, unknown>
  status: 'success' | 'failed' | 'timeout'
  duration_ms: number | null
  timestamp: string
}

export interface WorkflowExecution {
  wf_exec_id: string
  conversation_id: string
  workflow_name: string
  state: 'running' | 'completed' | 'failed'
  steps_completed: string[]
  started_at: string
  completed_at: string | null
}

export interface PolicyDecision {
  decision_id: string
  conversation_id: string
  policy_name: string | null
  action_proposed: string | null
  authorized: boolean
  reason: string | null
  timestamp: string
}
