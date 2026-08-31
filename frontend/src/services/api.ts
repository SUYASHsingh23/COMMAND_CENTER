import { tokenStore } from '@/services/authApi'

const BASE_URL = '/api/v1'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const accessToken = tokenStore.getAccess()
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
    ...options,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }))
    throw new Error(error.detail ?? 'Request failed')
  }
  return response.json() as Promise<T>
}

export const api = {
  createSession(params: { customer_id?: string; channel?: string; language?: string }) {
    return request<{ session_id: string; conversation_id: string; status: string; started_at: string }>(
      '/conversations/sessions',
      { method: 'POST', body: JSON.stringify(params) }
    )
  },

  endSession(session_id: string) {
    return request<{ status: string }>(`/conversations/sessions/${session_id}/end`, { method: 'POST' })
  },

  getSession(session_id: string) {
    return request<import('@/types/conversation').Conversation>(`/conversations/sessions/${session_id}`)
  },

  getMessages(conversation_id: string) {
    return request<import('@/types/conversation').Message[]>(`/conversations/${conversation_id}/messages`)
  },

  sendWebRTCOffer(session_id: string, sdp: string, type: string) {
    return request<{ status: string }>(`/conversations/sessions/${session_id}/offer`, {
      method: 'POST',
      body: JSON.stringify({ sdp, type }),
    })
  },

  sendICECandidate(session_id: string, candidate: string, sdp_mid: string | null, sdp_m_line_index: number | null) {
    return request<{ status: string }>(`/conversations/sessions/${session_id}/ice-candidate`, {
      method: 'POST',
      body: JSON.stringify({ candidate, sdp_mid, sdp_m_line_index }),
    })
  },

  getCustomer(customer_id: string) {
    return request<import('@/types/conversation').Customer>(`/customers/${customer_id}`)
  },

  health() {
    return request<{ status: string }>('/health'.replace('/api/v1', ''))
  },
}
