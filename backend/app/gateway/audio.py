import asyncio
import logging
import struct
import math
from app.speech.stt import SarvamSTTClient
from app.speech.barge_in import BargeInDetector

logger = logging.getLogger(__name__)

# Silence detection: 0.45s of audio below speech threshold = end of utterance
# (was 0.7s — too long, causing slow STT finalization)
VAD_SILENCE_DURATION = 0.45
# RMS threshold below which audio is considered silence
# CRITICAL: Was 200.0 — too high. Soft voices / Indian accent at ~80-150 RMS
# were being silently dropped as "silence" and never sent to STT.
SPEECH_RMS_THRESHOLD = 80.0
# Minimum consecutive silent chunks before silence timer starts
MIN_SPEECH_CHUNKS_BEFORE_VAD = 1



class AudioRouter:
    def __init__(self, session_id: str, language: str = "en-IN"):
        self.session_id = session_id
        self.stt_client = SarvamSTTClient(session_id=session_id, language=language)
        self.barge_in_detector = BargeInDetector()
        self._silence_timer: asyncio.Task | None = None
        self._receiving = False
        self._tts_active = False
        self._on_barge_in: list = []
        self._speech_chunk_count = 0

    def on_transcript(self, handler):
        self.stt_client.on_transcript(handler)

    def on_barge_in(self, handler):
        self._on_barge_in.append(handler)

    def set_tts_active(self, active: bool):
        self._tts_active = active
        if not active:
            self.barge_in_detector.reset()

    @property
    def tts_active(self) -> bool:
        return self._tts_active

    @property
    def barge_in_detected(self) -> bool:
        return self.barge_in_detector.detected

    def _is_speech(self, pcm_bytes: bytes) -> bool:
        sample_count = len(pcm_bytes) // 2
        if sample_count == 0:
            return False
        samples = struct.unpack(f"<{sample_count}h", pcm_bytes[: sample_count * 2])
        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
        return rms > SPEECH_RMS_THRESHOLD

    async def receive_chunk(self, audio_bytes: bytes):
        if not audio_bytes:
            return

        # Barge-in detection when TTS is playing
        if self._tts_active:
            interrupted = self.barge_in_detector.check(audio_bytes, tts_active=True)
            if interrupted:
                logger.info("Barge-in detected for session %s", self.session_id)
                for handler in self._on_barge_in:
                    try:
                        await handler()
                    except Exception as exc:
                        logger.error("Barge-in handler error: %s", exc)
                self._tts_active = False
                self.barge_in_detector.reset()

        is_speech = self._is_speech(audio_bytes)

        if is_speech:
            self._speech_chunk_count += 1
            self._receiving = True
            await self.stt_client.process_chunk(audio_bytes)
            # Speech detected — reset the silence timer so it won't fire
            self._reset_silence_timer()
            logger.debug(
                "Audio chunk received — speech detected (chunk #%d, session %s)",
                self._speech_chunk_count, self.session_id
            )
        else:
            # Silence chunk — only start VAD timer if we already had speech
            if self._receiving and self._speech_chunk_count >= MIN_SPEECH_CHUNKS_BEFORE_VAD:
                # Keep the timer running (don't reset it on silence)
                if self._silence_timer is None or self._silence_timer.done():
                    self._reset_silence_timer()
                    logger.debug("Silence detected after speech — VAD timer running (session %s)", self.session_id)

    def _reset_silence_timer(self):
        if self._silence_timer and not self._silence_timer.done():
            self._silence_timer.cancel()
        self._silence_timer = asyncio.create_task(self._silence_timeout())

    async def _silence_timeout(self):
        await asyncio.sleep(VAD_SILENCE_DURATION)
        if self._receiving and self._speech_chunk_count >= MIN_SPEECH_CHUNKS_BEFORE_VAD:
            logger.info(
                "VAD silence timeout — finalizing utterance for session %s (%d speech chunks collected)",
                self.session_id, self._speech_chunk_count
            )
            self._receiving = False
            self._speech_chunk_count = 0
            await self.stt_client.finalize_utterance()

    async def flush(self):
        if self._silence_timer and not self._silence_timer.done():
            self._silence_timer.cancel()
        if self._receiving and self._speech_chunk_count >= MIN_SPEECH_CHUNKS_BEFORE_VAD:
            self._receiving = False
            self._speech_chunk_count = 0
            await self.stt_client.finalize_utterance()

    async def close(self):
        await self.flush()
