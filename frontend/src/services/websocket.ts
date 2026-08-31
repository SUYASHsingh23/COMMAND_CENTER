import type { AnyEvent } from '@/types/events'

type EventHandler = (event: AnyEvent) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: EventHandler[] = []
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private maxReconnectDelay = 16000
  private shouldReconnect = false
  private currentUrl: string | null = null

  private _open(url: string) {
    this.currentUrl = url
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
    }

    this.ws = new WebSocket(url)

    this.ws.onmessage = (ev) => {
      try {
        const event = JSON.parse(ev.data) as AnyEvent
        this.handlers.forEach((h) => h(event))
      } catch {
        console.warn('WebSocket: failed to parse event', ev.data)
      }
    }

    this.ws.onclose = () => {
      if (this.shouldReconnect && this.currentUrl) {
        this.reconnectTimer = setTimeout(() => {
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
          if (this.currentUrl) this._open(this.currentUrl)
        }, this.reconnectDelay)
      }
    }

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
  }

  connect(sessionId: string) {
    this.shouldReconnect = true
    this.reconnectDelay = 1000
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const backendHost = window.location.hostname
    this._open(`${protocol}://${backendHost}:8000/sessions/${sessionId}/events`)
  }

  connectSupervisor() {
    this.shouldReconnect = true
    this.reconnectDelay = 1000
    // Connect directly to backend to bypass Vite proxy WebSocket upgrade issues
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const backendHost = window.location.hostname
    this._open(`${protocol}://${backendHost}:8000/events/stream`)
  }

  on(handler: EventHandler) {
    this.handlers.push(handler)
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler)
    }
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.close()
      this.ws = null
    }
    this.currentUrl = null
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

export const wsClient = new WebSocketClient()

class SupervisorWebSocketClient extends WebSocketClient {}
export const supervisorWsClient = new SupervisorWebSocketClient()
