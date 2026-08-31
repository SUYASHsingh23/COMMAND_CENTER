import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import { authApi, tokenStore, type CustomerProfile, type TokenResponse } from '@/services/authApi'

// ─── Context Shape ────────────────────────────────────────────────────────────
export interface AuthState {
  customer: CustomerProfile | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, phone: string | null, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true) // true until initial check done
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Schedule silent token refresh before expiry
  const scheduleRefresh = useCallback((expiresInSeconds: number) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    // Refresh 60 seconds before expiry
    const delay = Math.max((expiresInSeconds - 60) * 1000, 5000)
    refreshTimerRef.current = setTimeout(async () => {
      const rt = tokenStore.getRefresh()
      if (!rt) return
      try {
        const tokens = await authApi.refresh(rt)
        tokenStore.setAccess(tokens.access_token)
        tokenStore.setRefresh(tokens.refresh_token)
        scheduleRefresh(tokens.expires_in)
      } catch {
        // Refresh failed — session expired, log the user out
        tokenStore.clear()
        setCustomer(null)
      }
    }, delay)
  }, [])

  // Store token pair and fetch profile
  const handleTokens = useCallback(async (tokens: TokenResponse) => {
    tokenStore.setAccess(tokens.access_token)
    tokenStore.setRefresh(tokens.refresh_token)
    scheduleRefresh(tokens.expires_in)
    const profile = await authApi.me()
    setCustomer(profile)
  }, [scheduleRefresh])

  // On mount: try to restore session from stored refresh token
  useEffect(() => {
    const restore = async () => {
      const rt = tokenStore.getRefresh()
      if (!rt) {
        setIsLoading(false)
        return
      }
      try {
        const tokens = await authApi.refresh(rt)
        await handleTokens(tokens)
      } catch {
        tokenStore.clear()
      } finally {
        setIsLoading(false)
      }
    }
    restore()
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [handleTokens])

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await authApi.login(email, password)
    await handleTokens(tokens)
  }, [handleTokens])

  const register = useCallback(async (
    name: string,
    email: string,
    phone: string | null,
    password: string,
  ) => {
    const tokens = await authApi.register(name, email, phone, password)
    await handleTokens(tokens)
  }, [handleTokens])

  const logout = useCallback(async () => {
    const rt = tokenStore.getRefresh()
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    if (rt) {
      try { await authApi.logout(rt) } catch { /* best effort */ }
    }
    tokenStore.clear()
    setCustomer(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      customer,
      isAuthenticated: customer !== null,
      isLoading,
      login,
      register,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
