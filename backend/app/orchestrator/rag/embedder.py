"""
TextEmbedder — wraps SentenceTransformers for real semantic embeddings.

Model: all-MiniLM-L6-v2
  - 384-dimensional dense vectors
  - Runs 100% locally on CPU (no API key, no cost)
  - ~14k tokens/sec on CPU; excellent semantic quality for all domains
  - Model downloaded once and cached in ~/.cache/torch/sentence_transformers
"""
from __future__ import annotations

import asyncio
import functools
import logging
from typing import Union

logger = logging.getLogger(__name__)

# Lazy-loaded at first use so the app starts fast even before the model is warm
_model = None
_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


def _get_model():
    """Load the SentenceTransformer model once (singleton, thread-safe via GIL)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer  # noqa: PLC0415
        logger.info("Loading SentenceTransformer model: %s", _MODEL_NAME)
        _model = SentenceTransformer(_MODEL_NAME)
        logger.info("SentenceTransformer model loaded. Embedding dim=%d", EMBEDDING_DIM)
    return _model


class TextEmbedder:
    """
    Generates semantic embeddings using the all-MiniLM-L6-v2 model.
    Thread-safe: the underlying model object is a module-level singleton.
    """

    def embed_sync(self, text: str) -> list[float]:
        """Generate a 384-dim embedding synchronously (blocking, CPU-bound)."""
        model = _get_model()
        vec = model.encode(text, normalize_embeddings=True)
        return vec.tolist()

    def embed_batch_sync(self, texts: list[str]) -> list[list[float]]:
        """Batch encode for faster seeding. Returns list of embedding vectors."""
        model = _get_model()
        vecs = model.encode(texts, normalize_embeddings=True, batch_size=32, show_progress_bar=False)
        return [v.tolist() for v in vecs]

    async def embed(self, text: str) -> list[float]:
        """
        Async wrapper: runs synchronous model.encode in a thread-pool executor
        so the FastAPI event loop is never blocked.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, functools.partial(self.embed_sync, text)
        )

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Async batch embedding — used during seeding."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, functools.partial(self.embed_batch_sync, texts)
        )
