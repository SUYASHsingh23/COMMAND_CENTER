import struct
import math


class BargeInDetector:
    def __init__(self, rms_threshold: float = 400.0, window_samples: int = 160):
        self.rms_threshold = rms_threshold
        self.window_samples = window_samples
        self._detected = False

    @property
    def detected(self) -> bool:
        return self._detected

    def reset(self):
        self._detected = False

    def is_speech(self, pcm_bytes: bytes) -> bool:
        sample_count = len(pcm_bytes) // 2
        if sample_count == 0:
            return False

        samples = struct.unpack(f"<{sample_count}h", pcm_bytes[: sample_count * 2])
        window = samples[: min(self.window_samples, len(samples))]

        rms = math.sqrt(sum(s * s for s in window) / len(window))
        return rms > self.rms_threshold

    def check(self, pcm_bytes: bytes, tts_active: bool) -> bool:
        if not tts_active:
            return False
        if self.is_speech(pcm_bytes):
            self._detected = True
        return self._detected
