import asyncio
import logging
import time
import edge_tts
from app.core.config import get_settings
import re

logger = logging.getLogger(__name__)
settings = get_settings()

MAX_CHUNK_CHARS = 180

def _split_into_chunks(text: str) -> list[str]:
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    chunks: list[str] = []
    current = ""
    for sent in sentences:
        if not sent.strip():
            continue
        if len(current) + len(sent) <= MAX_CHUNK_CHARS:
            current = (current + " " + sent).strip()
        else:
            if current:
                chunks.append(current)
            if len(sent) > MAX_CHUNK_CHARS:
                parts = [sent[i:i + MAX_CHUNK_CHARS] for i in range(0, len(sent), MAX_CHUNK_CHARS)]
                chunks.extend(parts)
                current = ""
            else:
                current = sent
    if current:
        chunks.append(current)
    return chunks or [text]


class EdgeTTSClient:
    def __init__(self, voice: str = "en-IN-NeerjaNeural"):
        self.voice = voice
        # output format as mp3
        self.output_format = "audio-24khz-48kbitrate-mono-mp3"

    async def synthesize(self, text: str) -> bytes:
        t0 = time.monotonic()
        communicate = edge_tts.Communicate(text, self.voice)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        
        logger.info("TTS latency: %.2fs for %d chars", time.monotonic() - t0, len(text))
        if not audio_data:
            raise ValueError("No audio returned from Edge TTS")
        return audio_data

    async def synthesize_streaming(self, text: str):
        chunks = _split_into_chunks(text)
        t_start = time.monotonic()
        first_token = True

        # Process chunks sequentially to preserve natural speech order
        # We can pre-fetch the next chunk if we want, but sequential is safe.
        for i, chunk_text in enumerate(chunks):
            try:
                communicate = edge_tts.Communicate(chunk_text, self.voice)
                chunk_audio = b""
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        chunk_audio += chunk["data"]
                
                if chunk_audio:
                    if first_token:
                        logger.info("TTS first-chunk latency: %.2fs", time.monotonic() - t_start)
                        first_token = False
                    yield chunk_audio
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("TTS chunk %d error: %s", i, exc)
