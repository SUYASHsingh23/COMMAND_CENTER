export interface Customer {
  customer_id: string
  name: string
  phone: string | null
  email: string | null
  account_number: string | null
  plan: string | null
  created_at: string
}

export interface Account {
  account_id: string
  customer_id: string
  plan_name: string | null
  status: 'active' | 'suspended' | 'cancelled'
  balance: number
  billing_cycle: string
}

export interface Message {
  message_id: string
  conversation_id: string
  role: 'customer' | 'agent'
  content: string
  timestamp: string
  turn_index: number | null
}

export interface ConversationState {
  state_id: string
  conversation_id: string
  current_workflow: string | null
  customer_verified: boolean
  task_status: Record<string, string>
  updated_at: string
}

export interface Conversation {
  conversation_id: string
  session_id: string
  customer_id: string | null
  channel: string
  status: 'active' | 'completed' | 'escalated'
  started_at: string
  ended_at: string | null
  sentiment: 'positive' | 'neutral' | 'frustrated' | 'angry'
  intent_summary: string | null
  language: string
  messages: Message[]
}

export interface Session {
  session_id: string
  conversation_id: string
  status: string
  started_at: string
}

export interface Intent {
  intent_id: string
  detected_intents: string[]
  entities: Record<string, string>
  sentiment: string
  urgency: 'low' | 'medium' | 'high'
  confidence: number | null
}
