import React, { useRef, useCallback, useEffect } from 'react'

/**
 * Queue-based TTS audio playback using HTML5 Audio elements.
 *
 * WHY this approach instead of Web Audio API:
 * Chrome's autoplay policy blocks AudioContext.resume() in WebSocket callbacks
 * (not a user gesture). Using HTMLAudioElement with blob URLs works because
 * Chrome allows audio playback if the user has interacted with the page (which
 * they have, via the "Start Session" button click). Each WAV chunk is played
 * sequentially using a queue — when one ends, the next starts immediately.
 */
export function useAudioPlayback(
  onPlaybackStateChange?: (isPlaying: boolean) => void,
  _externalCtxRef?: React.MutableRefObject<AudioContext | null>,   // kept for API compatibility
) {
  const queueRef      = useRef<string[]>([])          // blob URLs waiting to play
  const isPlayingRef  = useRef(false)
  const currentRef    = useRef<HTMLAudioElement | null>(null)
  const blobUrls      = useRef<string[]>([])          // track all URLs for cleanup

  // Clean up blob URLs when hook unmounts
  useEffect(() => {
    return () => {
      blobUrls.current.forEach(url => URL.revokeObjectURL(url))
      blobUrls.current = []
    }
  }, [])

  const playNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      isPlayingRef.current = false
      onPlaybackStateChange?.(false)
      return
    }

    const url = queueRef.current.shift()!
    const audio = new Audio(url)
    currentRef.current = audio

    audio.onended = () => {
      URL.revokeObjectURL(url)
      blobUrls.current = blobUrls.current.filter(u => u !== url)
      playNext()
    }

    audio.onerror = (err) => {
      console.error('[AudioPlayback] Playback error:', err)
      URL.revokeObjectURL(url)
      blobUrls.current = blobUrls.current.filter(u => u !== url)
      playNext()
    }

    audio.play().catch(err => {
      console.error('[AudioPlayback] play() rejected:', err)
      playNext()
    })
  }, [onPlaybackStateChange])

  const play = useCallback(async (audioData: ArrayBuffer) => {
    try {
      const blob = new Blob([audioData], { type: 'audio/mpeg' })
      const url  = URL.createObjectURL(blob)
      blobUrls.current.push(url)
      queueRef.current.push(url)

      if (!isPlayingRef.current) {
        isPlayingRef.current = true
        onPlaybackStateChange?.(true)
        playNext()
      }
    } catch (err) {
      console.error('[AudioPlayback] Failed to queue audio:', err)
    }
  }, [playNext, onPlaybackStateChange])

  const stop = useCallback(() => {
    // Stop current audio
    if (currentRef.current) {
      currentRef.current.pause()
      currentRef.current.src = ''
      currentRef.current = null
    }
    // Clear queue and release blob URLs
    queueRef.current.forEach(url => URL.revokeObjectURL(url))
    queueRef.current = []
    blobUrls.current.forEach(url => {
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
    })
    blobUrls.current = []

    isPlayingRef.current = false
    onPlaybackStateChange?.(false)
  }, [onPlaybackStateChange])

  return { play, stop }
}
