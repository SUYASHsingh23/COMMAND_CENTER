/**
 * Auth API service — wraps all /api/v1/auth/* endpoints.
 * Manages token storage in memory (access) + localStorage (refresh).
 */

const BASE = '/api/v1/auth'

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface CustomerProfile {
  customer_id: string
  name: string
  email: string | null
  phone: string | null
  account_number: string | null
  plan: string | null
  customer_tier: string
  preferred_language: string
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

// ─── In-memory access token (never persisted to localStorage) ─────────────────
let _accessToken: string | null = null

export const tokenStore = {
  setAccess: (t: string) => { _accessToken = t },
  getAccess: () => _accessToken,
  clearAccess: () => { _accessToken = null },

  setRefresh: (t: string) => localStorage.setItem('cc_refresh', t),
  getRefresh: () => localStorage.getItem('cc_refresh'),
  clearRefresh: () => localStorage.removeItem('cc_refresh'),

  clear: () => {
    _accessToken = null
    localStorage.removeItem('cc_refresh')
  },
}

// ─── Base fetch with auth header injection ────────────────────────────────────
async function authFetch<T>(
  path: string,
  options: RequestInit = {},
  useBearer = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (useBearer && _accessToken) {
    headers['Authorization'] = `Bearer ${_accessToken}`
  }
  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? 'Request failed')
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ─── Auth API ─────────────────────────────────────────────────────────────────
export const authApi = {
  register(name: string, email: string, phone: string | null, password: string) {
    return authFetch<TokenResponse>('/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone, password }),
    }, false)
  },

  login(email: string, password: string) {
    return authFetch<TokenResponse>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false)
  },

  refresh(refresh_token: string) {
    return authFetch<TokenResponse>('/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token }),
    }, false)
  },

  logout(refresh_token: string) {
    return authFetch<void>('/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token }),
    })
  },

  me() {
    return authFetch<CustomerProfile>('/me')
  },
}
