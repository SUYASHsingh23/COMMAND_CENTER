import asyncio
import io
import logging
import struct
import wave
from typing import Callable, Awaitable
from datetime import datetime, timezone
import httpx
from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


class TranscriptEvent:
    def __init__(self, text: str, session_id: str, is_final: bool):
        self.event_type = "transcript.final" if is_final else "transcript.partial"
        self.session_id = session_id
        self.text = text
        self.is_final = is_final
        self.timestamp = datetime.now(timezone.utc).isoformat()


class SarvamSTTClient:
    def __init__(self, session_id: str, language: str = "en-IN", sample_rate: int = 16000):
        self.session_id = session_id
        self.language = language
        self.sample_rate = sample_rate
        self._pcm_chunks: list[bytes] = []
        self._on_transcript: list[Callable[[TranscriptEvent], Awaitable[None]]] = []

    def on_transcript(self, handler: Callable[[TranscriptEvent], Awaitable[None]]):
        self._on_transcript.append(handler)

    async def _emit(self, event: TranscriptEvent):
        for handler in self._on_transcript:
            try:
                await handler(event)
            except Exception as exc:
                logger.error("Transcript handler error: %s", exc)

    async def process_chunk(self, audio_chunk: bytes):
        self._pcm_chunks.append(audio_chunk)

    async def finalize_utterance(self) -> TranscriptEvent | None:
        if not self._pcm_chunks:
            return None

        raw_pcm = b"".join(self._pcm_chunks)
        self._pcm_chunks.clear()

        if len(raw_pcm) < 640:  # 40ms at 16kHz — was 1600 (100ms), short words were dropped
            logger.debug("STT: utterance too short (%d bytes), skipping", len(raw_pcm))
            return None



        wav_bytes = self._pcm_to_wav(raw_pcm)
        logger.info("STT: sending %d WAV bytes to Sarvam for session %s", len(wav_bytes), self.session_id)

        try:
            transcript = await self._call_sarvam_stt(wav_bytes)
        except Exception as exc:
            logger.error("Sarvam STT error for session %s: %s", self.session_id, exc)
            return None

        if not transcript or not transcript.strip():
            logger.debug("STT: empty transcript returned for session %s", self.session_id)
            return None

        logger.info("STT transcript: '%s' (session %s)", transcript, self.session_id)
        event = TranscriptEvent(text=transcript.strip(), session_id=self.session_id, is_final=True)
        await self._emit(event)
        return event

    def _pcm_to_wav(self, pcm_bytes: bytes) -> bytes:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(self.sample_rate)
            wf.writeframes(pcm_bytes)
        return buf.getvalue()

    async def _call_sarvam_stt(self, wav_bytes: bytes) -> str | None:
        headers = {"api-subscription-key": settings.sarvam_api_key}
        files = {"file": ("audio.wav", wav_bytes, "audio/wav")}
        data = {
            "language_code": self.language,
            "model": "saarika:v2.5",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                SARVAM_STT_URL,
                headers=headers,
                files=files,
                data=data,
            )
            if response.status_code != 200:
                logger.error("Sarvam STT HTTP %d: %s", response.status_code, response.text[:300])
                return None
            result = response.json()
            return result.get("transcript") or result.get("text")
