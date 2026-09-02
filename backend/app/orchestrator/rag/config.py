"""
RAG Module Configuration

All settings are configurable via environment variables with sensible defaults.
Paths are resolved relative to the project root (knowledge/ folder and .chroma_db/).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

# Project root = command_center_3.0/
_PROJECT_ROOT = Path(__file__).resolve().parents[4]


@dataclass
class RAGConfig:
    """
    Central configuration for the RAG module.

    All paths are resolved relative to the project root by default.
    Override any field via environment variables prefixed with RAG_.
    """

    # --- Embedding Model ---
    embedding_model: str = field(
        default_factory=lambda: os.getenv("RAG_EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    )
    embedding_dimension: int = field(
        default_factory=lambda: int(os.getenv("RAG_EMBEDDING_DIM", "384"))
    )

    # --- Paths (auto-resolved to project knowledge base) ---
    kb_dir: str = field(default="")
    chroma_dir: str = field(default="")

    # --- Search Settings ---
    top_k: int = field(
        default_factory=lambda: int(os.getenv("RAG_TOP_K", "5"))
    )
    min_relevance_score: float = field(
        default_factory=lambda: float(os.getenv("RAG_MIN_SCORE", "0.20"))
    )
    chunk_size: int = field(
        default_factory=lambda: int(os.getenv("RAG_CHUNK_SIZE", "500"))
    )
    chunk_overlap: int = field(
        default_factory=lambda: int(os.getenv("RAG_CHUNK_OVERLAP", "50"))
    )

    # --- Redis Cache Settings ---
    redis_host: str = field(
        default_factory=lambda: os.getenv("REDIS_HOST", "localhost")
    )
    redis_port: int = field(
        default_factory=lambda: int(os.getenv("REDIS_PORT", "6379"))
    )
    redis_db: int = field(
        default_factory=lambda: int(os.getenv("REDIS_DB", "0"))
    )
    redis_password: str = field(
        default_factory=lambda: os.getenv("REDIS_PASSWORD", "")
    )
    redis_max_connections: int = field(
        default_factory=lambda: int(os.getenv("REDIS_MAX_CONNECTIONS", "50"))
    )
    cache_ttl: int = field(
        default_factory=lambda: int(os.getenv("RAG_CACHE_TTL", "300"))
    )
    enable_redis: bool = field(
        default_factory=lambda: os.getenv("RAG_ENABLE_REDIS", "true").lower() == "true"
    )

    # --- FAISS Settings ---
    faiss_use_gpu: bool = field(
        default_factory=lambda: os.getenv("RAG_FAISS_GPU", "false").lower() == "true"
    )

    # --- ChromaDB Settings ---
    chroma_collection_name: str = field(
        default_factory=lambda: os.getenv("RAG_CHROMA_COLLECTION", "insureai_knowledge_base")
    )

    def __post_init__(self) -> None:
        """Resolve paths relative to the project root if not explicitly set."""
        if not self.kb_dir:
            self.kb_dir = str(
                Path(os.getenv("RAG_KB_DIR", str(_PROJECT_ROOT / "knowledge")))
            )
        if not self.chroma_dir:
            self.chroma_dir = str(
                Path(os.getenv("RAG_CHROMA_DIR", str(_PROJECT_ROOT / ".chroma_db")))
            )


# Module-level default config instance
rag_config = RAGConfig()
