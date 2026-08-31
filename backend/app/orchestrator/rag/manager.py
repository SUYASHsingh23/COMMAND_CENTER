"""
RAGManager — ChromaDB-backed semantic retrieval.

Architecture:
  - PersistentClient stores vectors on disk (.chroma_db/ at backend root)
  - Collection: "knowledge_base"  (HNSW index, cosine distance)
  - Query: returns top-k nearest neighbours by cosine similarity
  - Retrieval log: written to knowledge_retrieval table (unchanged)

Thread-safety: ChromaDB client is created once per process and shared.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import chromadb
from chromadb.config import Settings
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeRetrieval

logger = logging.getLogger(__name__)

# Persistent storage right next to the backend directory
_CHROMA_PATH = str(Path(__file__).resolve().parents[4] / ".chroma_db")
_COLLECTION_NAME = "knowledge_base"

# Module-level singleton — created once per worker process
_chroma_client: chromadb.PersistentClient | None = None
_collection = None


def _get_collection():
    """Return the ChromaDB collection, initialising the client if needed."""
    global _chroma_client, _collection
    if _collection is None:
        _chroma_client = chromadb.PersistentClient(
            path=_CHROMA_PATH,
            settings=Settings(anonymized_telemetry=False),
        )
        _collection = _chroma_client.get_or_create_collection(
            name=_COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},   # cosine distance for semantic search
        )
        logger.info(
            "ChromaDB collection '%s' ready — %d docs, path: %s",
            _COLLECTION_NAME, _collection.count(), _CHROMA_PATH,
        )
    return _collection


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class RetrievedPassage:
    doc_id: str
    chunk_id: str
    title: str
    category: str
    content: str
    score: float   # cosine similarity [0, 1]


@dataclass
class RAGResult:
    query: str
    passages: list[RetrievedPassage] = field(default_factory=list)

    def to_context_block(self) -> str:
        if not self.passages:
            return ""
        lines = ["[KNOWLEDGE BASE]:"]
        for p in self.passages:
            lines.append(f"  [{p.category.upper()}] {p.title}: {p.content}")
        return "\n".join(lines)


# ─── RAGManager ───────────────────────────────────────────────────────────────

class RAGManager:
    """
    Semantic RAG retrieval backed by ChromaDB.

    Usage:
        manager = RAGManager()
        result = await manager.retrieve(query, query_embedding, db, conversation_id)
    """

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 3,
        min_score: float = 0.30,
    ) -> list[RetrievedPassage]:
        """
        Execute a vector similarity search against ChromaDB.
        ChromaDB returns distances (0=identical, 2=opposite for cosine).
        We convert: similarity = 1 - distance/2   → range [0, 1].
        """
        collection = _get_collection()
        if collection.count() == 0:
            logger.warning("RAG: knowledge base is empty — no results returned")
            return []

        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=min(top_k, collection.count()),
            include=["documents", "metadatas", "distances"],
        )

        passages: list[RetrievedPassage] = []
        docs      = results.get("documents", [[]])[0]
        metas     = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]
        ids       = results.get("ids", [[]])[0]

        for doc, meta, dist, cid in zip(docs, metas, distances, ids):
            # ChromaDB cosine distance ∈ [0, 2]; convert to similarity ∈ [0, 1]
            similarity = round(1.0 - dist / 2.0, 4)
            if similarity < min_score:
                continue
            passages.append(
                RetrievedPassage(
                    doc_id=meta.get("doc_id", ""),
                    chunk_id=cid,
                    title=meta.get("title", ""),
                    category=meta.get("category", "general"),
                    content=doc,
                    score=similarity,
                )
            )

        logger.debug(
            "RAG search returned %d passages above min_score=%.2f",
            len(passages), min_score,
        )
        return passages

    async def retrieve(
        self,
        query: str,
        query_embedding: list[float],
        db: AsyncSession,
        conversation_id=None,
        top_k: int = 3,
    ) -> RAGResult:
        """
        Full retrieval pipeline:
        1. Vector search (ChromaDB)
        2. Log retrievals to knowledge_retrieval table
        """
        passages = self.search(query_embedding, top_k=top_k)

        if passages and conversation_id:
            for p in passages:
                try:
                    record = KnowledgeRetrieval(
                        conversation_id=conversation_id,
                        query=query,
                        doc_id=uuid.UUID(p.doc_id) if p.doc_id else None,
                        passage=p.content[:500],
                        relevance_score=p.score,
                    )
                    db.add(record)
                    await db.commit()
                except Exception as exc:
                    logger.error("RAG retrieval persist error: %s", exc)

        return RAGResult(query=query, passages=passages)
