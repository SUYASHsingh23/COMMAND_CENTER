import { useRef, useCallback, useState } from 'react'
import { useConversationStore } from '@/store/conversation'
import { useAudioPlayback } from '@/hooks/useAudioPlayback'

interface UseWebRTCOptions {
  onAgentAudioStateChange?: (isPlaying: boolean) => void
}

interface UseWebRTCReturn {
  isConnecting: boolean
  isConnected: boolean
  isSpeaking: boolean
  error: string | null
  connect: (sessionId: string) => Promise<void>
  disconnect: () => void
  startSpeaking: () => void
  stopSpeaking: () => void
  sendText: (text: string) => void
}

function waitForOpen(ws: WebSocket, ms = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return }
    const t = setTimeout(() => reject(new Error('WebSocket open timed out')), ms)
    ws.addEventListener('open', () => { clearTimeout(t); resolve() }, { once: true })
    ws.addEventListener('error', () => { clearTimeout(t); reject(new Error('WebSocket connection failed')) }, { once: true })
  })
}

export function useWebRTC({ onAgentAudioStateChange }: UseWebRTCOptions): UseWebRTCReturn {
  const [isConnecting, setIsConnecting] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const isSendingRef = useRef(false)  // true only while PTT button is held
  const setListening = useConversationStore((s) => s.setListening)
  const { play: playTTS, stop: stopTTS } = useAudioPlayback(onAgentAudioStateChange, ctxRef)


  const connect = useCallback(async (sessionId: string) => {
    if (!sessionId) {
      console.error('[WebRTC] connect() called with empty sessionId')
      setError('Session ID missing — try again')
      return
    }

    console.log('[WebRTC] Connecting for session:', sessionId)
    setIsConnecting(true)
    setError(null)

    try {
      // 1. Open WebSocket first (no audio yet)
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const url = `${protocol}://${window.location.hostname}:8000/sessions/${sessionId}/audio`
      console.log('[AudioWS] Opening:', url)

      const ws = new WebSocket(url)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onmessage = async (ev: MessageEvent) => {
        if (ev.data instanceof ArrayBuffer && ev.data.byteLength > 0) {
          console.log('[AudioWS] Received agent TTS audio:', ev.data.byteLength, 'bytes')
          await playTTS(ev.data)
        }
      }
      ws.onerror = (e) => console.error('[AudioWS] Error:', e)
      ws.onclose = (e) => console.log('[AudioWS] Closed:', e.code, e.reason)

      await waitForOpen(ws)
      console.log('[AudioWS] WebSocket OPEN')

      // 2. Request microphone with standard audio constraints
      console.log('[Mic] Requesting microphone...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      console.log('[Mic] Got stream with tracks:', stream.getAudioTracks().map(t => t.label))

      // 3. Build audio graph — use native sample rate to avoid OS resampling delay
      // We downsample manually to 16kHz in the processor callback.
      const ctx = new AudioContext()  // native sample rate (usually 44100 or 48000 Hz)
      ctxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()
      const nativeSR = ctx.sampleRate
      console.log('[Mic] AudioContext state:', ctx.state, '@ native sampleRate:', nativeSR)

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source

      // Larger buffer (8192) reduces callback frequency, prevents audio drops under JS load
      const processor = ctx.createScriptProcessor(8192, 1, 1)
      processorRef.current = processor

      processor.onaudioprocess = (e) => {
        // Only send if PTT is held AND WebSocket is open
        if (!isSendingRef.current) return
        if (ws.readyState !== WebSocket.OPEN) return

        const float32 = e.inputBuffer.getChannelData(0)

        // Downsample from native rate to 16000 Hz for Sarvam STT
        const targetSR = 16000
        const ratio = nativeSR / targetSR
        const outLen = Math.round(float32.length / ratio)
        const resampled = new Float32Array(outLen)
        for (let i = 0; i < outLen; i++) {
          // Linear interpolation between nearest samples
          const src = i * ratio
          const lo = Math.floor(src)
          const hi = Math.min(lo + 1, float32.length - 1)
          const frac = src - lo
          resampled[i] = float32[lo] * (1 - frac) + float32[hi] * frac
        }

        // Convert Float32 → Int16 (standard clamped formula)
        const int16 = new Int16Array(outLen)
        for (let i = 0; i < outLen; i++) {
          const s = Math.max(-1, Math.min(1, resampled[i]))
          int16[i] = Math.round(s * 32767)
        }
        ws.send(int16.buffer)
      }

      // Silent gain — keeps graph alive without speaker feedback
      const gain = ctx.createGain()
      gain.gain.value = 0
      source.connect(processor)
      processor.connect(gain)
      gain.connect(ctx.destination)

      setIsConnected(true)
      setIsConnecting(false)
      console.log('[WebRTC] Ready — press and hold the Talk button to speak')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[WebRTC] Connection failed:', msg)
      setError(msg)
      setIsConnecting(false)
    }
  }, [playTTS])

  const disconnect = useCallback(() => {
    console.log('[WebRTC] Disconnecting...')
    stopTTS()
    isSendingRef.current = false
    processorRef.current?.disconnect()
    sourceRef.current?.disconnect()
    ctxRef.current?.close().catch(() => {})
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (wsRef.current) {
      wsRef.current.onmessage = null
      wsRef.current.close()
      wsRef.current = null
    }
    processorRef.current = null
    sourceRef.current = null
    ctxRef.current = null
    streamRef.current = null
    setListening(false)
    setIsConnected(false)
    setIsSpeaking(false)
    setError(null)
    console.log('[WebRTC] Disconnected')
  }, [stopTTS, setListening])

  // PTT: called on button press-down
  const startSpeaking = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn('[PTT] WebSocket not open — cannot start speaking')
      return
    }
    console.log('[PTT] Button held — streaming audio to backend')
    isSendingRef.current = true
    setIsSpeaking(true)
    setListening(true)
  }, [setListening])

  // PTT: called on button release
  const stopSpeaking = useCallback(() => {
    if (!isSendingRef.current) return
    console.log('[PTT] Button released — flushing audio buffer to STT')
    isSendingRef.current = false
    setIsSpeaking(false)
    setListening(false)

    // Send immediate flush signal to backend — triggers STT without waiting for VAD timer
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'flush' }))
      console.log('[PTT] Flush signal sent to backend')
    }
  }, [setListening])

  const sendText = useCallback((text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ text }))
    } else {
      console.warn('Cannot send text: WebSocket not open')
    }
  }, [])

  return {
    isConnecting,
    isConnected,
    isSpeaking,
    error,
    connect,
    disconnect,
    startSpeaking,
    stopSpeaking,
    sendText,
  }
}
