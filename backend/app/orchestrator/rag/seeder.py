"""
Knowledge Base Seeder — New RAG Edition

Initializes the production-grade RAG engine (ChromaDB + FAISS + Redis) by loading
all knowledge base documents from:
  - knowledge/policies/*.md  — full policy wording documents
  - knowledge/faqs/*.json    — structured FAQ and scenario knowledge bases

This replaces the old ChromaDB-only seeder and runs on app startup via main.py lifespan.
"""
from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.orchestrator.rag.search_engine import rag_engine

logger = logging.getLogger(__name__)


async def seed_knowledge_base(db: AsyncSession) -> int:
    """
    Initialize and seed the RAG knowledge base.

    Workflow:
    1. DocumentLoader scans knowledge/policies/*.md + knowledge/faqs/*.json
    2. Chunks are upserted into ChromaDB (skips if already indexed)
    3. FAISS ANN index is built from ChromaDB embeddings
    4. Redis cache is connected (graceful degradation if unavailable)

    Returns:
        Number of document chunks loaded (0 if already indexed).
    """
    logger.info("Initializing RAG knowledge base (ChromaDB + FAISS + Redis)...")

    try:
        status = await rag_engine.initialize()

        chunks_loaded = status.get("documents_loaded", 0)
        upserted = status.get("chromadb_upserted", 0)
        faiss_status = status.get("faiss", "unknown")
        redis_status = status.get("redis", "unknown")

        logger.info(
            "RAG ready: %d chunks loaded, %d upserted to ChromaDB, "
            "FAISS=%s, Redis=%s",
            chunks_loaded, upserted, faiss_status, redis_status,
        )

        # Return upserted count (new docs added); 0 means already indexed
        return upserted

    except Exception as exc:
        logger.error("RAG knowledge base initialization failed: %s", exc, exc_info=True)
        return 0
