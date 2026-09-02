"""
Hybrid RAG Search Engine — Main Orchestrator

Combines ChromaDB (semantic search with metadata filtering) + FAISS (fast ANN retrieval)
+ Redis (query result caching) into a single, production-grade search interface.

Uses Reciprocal Rank Fusion (RRF) to merge results from both retrieval sources.

BACKWARD COMPATIBILITY:
  This module exposes the same RAGManager / RAGResult / RetrievedPassage interface
  as the previous implementation so agent.py requires zero changes.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .cache import RAGCache
from .config import RAGConfig, rag_config
from .document_loader import DocumentLoader, KBChunk
from .faiss_index import FAISSIndex
from .vector_store import ChromaVectorStore

logger = logging.getLogger("rag.search_engine")


# ── New-style result (used by RAGSearchEngine) ─────────────────────────────────

@dataclass
class RAGSearchResult:
    """A single RAG search result with content and provenance metadata."""

    content: str
    source: str              # e.g., "motor_insurance_kb.json"
    domain: str              # e.g., "motor_insurance"
    section_title: str       # e.g., "Zero Depreciation Cover"
    doc_type: str            # "faq" | "section" | "paragraph"
    score: float             # 0.0 to 1.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "content": self.content,
            "source": self.source,
            "domain": self.domain,
            "section_title": self.section_title,
            "doc_type": self.doc_type,
            "score": round(self.score, 4),
            "metadata": self.metadata,
        }


# ── Backward-compatible result types (used by agent.py / manager interface) ────

@dataclass
class RetrievedPassage:
    """Backward-compatible passage type matching the old RAGManager interface."""
    doc_id: str
    chunk_id: str
    title: str
    category: str
    content: str
    score: float   # cosine similarity [0, 1]


@dataclass
class RAGResult:
    """Backward-compatible result type matching the old RAGManager interface."""
    query: str
    passages: list[RetrievedPassage] = field(default_factory=list)

    def to_context_block(self) -> str:
        if not self.passages:
            return ""
        lines = ["[KNOWLEDGE BASE]:"]
        for p in self.passages:
            lines.append(f"  [{p.category.upper()}] {p.title}: {p.content}")
        return "\n".join(lines)


# ── Core Search Engine ─────────────────────────────────────────────────────────

class RAGSearchEngine:
    """
    Production-grade RAG search engine combining ChromaDB + FAISS + Redis.

    Features:
    - Dual retrieval: ChromaDB (metadata-aware) + FAISS (speed)
    - Reciprocal Rank Fusion for result merging
    - Redis caching for repeated queries
    - Graceful degradation at every layer
    - Async-safe for 30-40+ concurrent queries
    - Hot-reload support for knowledge base updates
    """

    def __init__(self, config: Optional[RAGConfig] = None) -> None:
        self.config = config or rag_config
        self.document_loader = DocumentLoader(self.config)
        self.vector_store = ChromaVectorStore(self.config)
        self.faiss_index = FAISSIndex(self.config)
        self.cache = RAGCache(self.config)

        self._chunks: List[KBChunk] = []
        self._chunk_map: Dict[str, KBChunk] = {}  # ID → chunk for result enrichment
        self._initialized = False
        self._lock = asyncio.Lock()

    async def initialize(self) -> Dict[str, Any]:
        """
        Full initialization pipeline:
        1. Load JSON knowledge base documents
        2. Chunk documents
        3. Upsert into ChromaDB (skips if already indexed)
        4. Build FAISS index from ChromaDB embeddings
        5. Connect Redis cache

        Returns:
            Status dict with component health information.
        """
        async with self._lock:
            status: Dict[str, Any] = {}

            try:
                # 1. Load and chunk documents
                self._chunks = self.document_loader.load_all()
                self._chunk_map = {c.id: c for c in self._chunks}
                status["documents_loaded"] = len(self._chunks)
                logger.info(f"Loaded {len(self._chunks)} document chunks")

                # 2. Initialize ChromaDB and upsert
                self.vector_store.initialize()
                existing_count = self.vector_store.count()

                if existing_count < len(self._chunks):
                    upserted = self.vector_store.upsert_documents(self._chunks)
                    status["chromadb_upserted"] = upserted
                    logger.info(f"Upserted {upserted} chunks into ChromaDB")
                else:
                    status["chromadb_upserted"] = 0
                    logger.info(
                        f"ChromaDB already has {existing_count} docs, skipping upsert"
                    )
                status["chromadb"] = "healthy"

                # 3. Build FAISS index from ChromaDB embeddings
                try:
                    embeddings, ids = self.vector_store.get_all_embeddings()
                    if embeddings.size > 0:
                        self.faiss_index.build_index(embeddings, ids)
                        status["faiss"] = "healthy"
                        status["faiss_docs"] = self.faiss_index.doc_count
                    else:
                        status["faiss"] = "empty"
                except Exception as e:
                    logger.warning(f"FAISS index build failed (non-fatal): {e}")
                    status["faiss"] = f"error: {e}"

                # 4. Connect Redis cache
                redis_ok = await self.cache.initialize()
                status["redis"] = "healthy" if redis_ok else "unavailable"

                self._initialized = True
                logger.info(f"RAG Search Engine initialized: {status}")

            except Exception as e:
                logger.error(f"RAG initialization failed: {e}", exc_info=True)
                status["error"] = str(e)
                self._initialized = True  # Allow degraded operation

            return status

    async def search(
        self,
        query: str,
        top_k: Optional[int] = None,
        domain: Optional[str] = None,
        doc_type: Optional[str] = None,
    ) -> List[RAGSearchResult]:
        """
        Hybrid semantic search: ChromaDB + FAISS, merged with RRF.

        Args:
            query: The search query text
            top_k: Number of results to return (defaults to config.top_k)
            domain: Optional filter by domain ("health_insurance", "motor_insurance", "home_insurance")
            doc_type: Optional filter by doc_type ("faq", "section", "policy_clause")

        Returns:
            List of RAGSearchResult objects sorted by relevance score
        """
        if not self._initialized:
            logger.warning("RAG engine not initialized, returning empty results")
            return []

        k = top_k or self.config.top_k

        # 1. Check Redis cache
        cached = await self.cache.get(query, domain)
        if cached:
            return [
                RAGSearchResult(
                    content=r["content"],
                    source=r.get("source", ""),
                    domain=r.get("domain", ""),
                    section_title=r.get("section_title", ""),
                    doc_type=r.get("doc_type", ""),
                    score=r.get("score", 0.0),
                    metadata=r.get("metadata", {}),
                )
                for r in cached[:k]
            ]

        # 2. ChromaDB semantic search
        chroma_results = []
        try:
            chroma_results = self.vector_store.search(
                query=query,
                top_k=k * 2,  # Over-fetch for better RRF merge
                domain_filter=domain,
                doc_type_filter=doc_type,
            )
        except Exception as e:
            logger.warning(f"ChromaDB search error: {e}")

        # 3. FAISS ANN search
        faiss_results: List[Dict[str, Any]] = []
        try:
            if self.faiss_index.is_ready:
                query_embedding = self.vector_store.embed_query(query)
                faiss_hits = self.faiss_index.search(query_embedding, top_k=k * 2)

                for doc_id, score in faiss_hits:
                    chunk = self._chunk_map.get(doc_id)
                    if chunk:
                        if domain and chunk.domain != domain:
                            continue
                        if doc_type and chunk.doc_type != doc_type:
                            continue
                        faiss_results.append(
                            {
                                "id": doc_id,
                                "content": chunk.content,
                                "metadata": {
                                    "domain": chunk.domain,
                                    "section_id": chunk.section_id,
                                    "section_title": chunk.section_title,
                                    "doc_type": chunk.doc_type,
                                    "source_file": chunk.source_file,
                                },
                                "score": score,
                                "source": "faiss",
                            }
                        )
        except Exception as e:
            logger.warning(f"FAISS search error: {e}")

        # 4. Merge via Reciprocal Rank Fusion (RRF)
        merged = self._reciprocal_rank_fusion(chroma_results, faiss_results, k=k)

        # 5. Convert to RAGSearchResult objects
        results: List[RAGSearchResult] = []
        for item in merged:
            meta = item.get("metadata", {})
            raw_score = item.get("score", item.get("rrf_score", 0.0))
            result = RAGSearchResult(
                content=item["content"],
                source=meta.get("source_file", ""),
                domain=meta.get("domain", ""),
                section_title=meta.get("section_title", ""),
                doc_type=meta.get("doc_type", ""),
                score=raw_score,
                metadata={**meta, "rrf_score": item.get("rrf_score", 0.0)},
            )
            results.append(result)

        # 6. Cache results in Redis
        if results:
            await self.cache.set(
                query,
                [r.to_dict() for r in results],
                domain=domain,
            )

        logger.info(
            f"RAG search: query='{query[:60]}', domain={domain}, "
            f"chroma={len(chroma_results)}, faiss={len(faiss_results)}, "
            f"merged={len(results)}"
        )

        return results

    def _reciprocal_rank_fusion(
        self,
        chroma_results: List[Dict[str, Any]],
        faiss_results: List[Dict[str, Any]],
        k: int = 5,
        rrf_k: int = 60,
    ) -> List[Dict[str, Any]]:
        """
        Merge results from two retrieval sources using Reciprocal Rank Fusion.

        RRF score = sum(1 / (rrf_k + rank)) for each source where the doc appears.
        This balances results from different systems without requiring score normalization.
        """
        doc_scores: Dict[str, Dict[str, Any]] = {}

        for rank, result in enumerate(chroma_results):
            doc_id = result["id"]
            rrf_score = 1.0 / (rrf_k + rank + 1)
            if doc_id not in doc_scores:
                doc_scores[doc_id] = {**result, "rrf_score": 0.0}
            doc_scores[doc_id]["rrf_score"] += rrf_score

        for rank, result in enumerate(faiss_results):
            doc_id = result["id"]
            rrf_score = 1.0 / (rrf_k + rank + 1)
            if doc_id not in doc_scores:
                doc_scores[doc_id] = {**result, "rrf_score": 0.0}
            doc_scores[doc_id]["rrf_score"] += rrf_score

        merged = sorted(doc_scores.values(), key=lambda x: x["rrf_score"], reverse=True)
        return merged[:k]

    async def reload_documents(self) -> Dict[str, Any]:
        """Hot-reload: re-read KB files, re-chunk, re-embed, rebuild FAISS, flush cache."""
        async with self._lock:
            logger.info("Hot-reloading RAG knowledge base...")

            if not self._initialized:
                return await self.initialize()

            self.vector_store.clear()
            await self.cache.invalidate()

            self._chunks = self.document_loader.load_all()
            self._chunk_map = {c.id: c for c in self._chunks}

            upserted = self.vector_store.upsert_documents(self._chunks)

            embeddings, ids = self.vector_store.get_all_embeddings()
            if embeddings.size > 0:
                self.faiss_index.rebuild(embeddings, ids)

            status = {
                "reloaded": True,
                "chunks": len(self._chunks),
                "upserted": upserted,
                "faiss_rebuilt": self.faiss_index.is_ready,
            }
            logger.info(f"RAG hot-reload complete: {status}")
            return status

    async def health_check(self) -> Dict[str, Any]:
        """Comprehensive health check for all RAG components."""
        return {
            "initialized": self._initialized,
            "documents_loaded": len(self._chunks),
            "chromadb": {
                "status": "healthy" if self.vector_store.ping() else "unhealthy",
                "doc_count": self.vector_store.count(),
            },
            "faiss": {
                "status": "healthy" if self.faiss_index.is_ready else "not_built",
                "doc_count": self.faiss_index.doc_count,
            },
            "redis": {
                "status": "healthy" if await self.cache.ping() else "unavailable",
                "enabled": self.config.enable_redis,
            },
        }

    @property
    def is_ready(self) -> bool:
        return self._initialized

    async def close(self) -> None:
        """Graceful shutdown — close Redis connections."""
        await self.cache.close()
        logger.info("RAG Search Engine shut down")


# ── Backward-Compatible RAGManager ────────────────────────────────────────────
# Wraps RAGSearchEngine to expose the same interface that agent.py expects.

class RAGManager:
    """
    Backward-compatible wrapper around RAGSearchEngine.

    Exposes the original RAGManager interface:
        search(query_embedding, top_k, min_score) → list[RetrievedPassage]
        retrieve(query, query_embedding, db, conversation_id, top_k) → RAGResult

    Internally delegates to the global rag_engine singleton which uses
    ChromaDB + FAISS + Redis for production-grade retrieval.
    """

    def search(
        self,
        query_embedding: list[float],
        top_k: int = 3,
        min_score: float = 0.20,
    ) -> list[RetrievedPassage]:
        """
        Execute a vector similarity search against ChromaDB.
        Note: query_embedding is ignored — the new engine embeds at query time
        using the same model as documents for symmetric search.
        This method is kept for interface compatibility only.
        """
        # Sync search via ChromaDB direct (for callers that pre-compute embeddings)
        collection = _get_legacy_collection()
        if collection is None or collection.count() == 0:
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
            # Cosine distance from chromadb: ∈ [0, 2]; convert to similarity ∈ [0, 1]
            similarity = round(1.0 - dist / 2.0, 4)
            if similarity < min_score:
                continue
            passages.append(
                RetrievedPassage(
                    doc_id=meta.get("doc_id", cid),
                    chunk_id=cid,
                    title=meta.get("section_title", meta.get("title", "")),
                    category=meta.get("domain", meta.get("category", "general")),
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
        db,
        conversation_id=None,
        top_k: int = 3,
    ) -> RAGResult:
        """
        Full retrieval pipeline using the new hybrid engine:
        1. Hybrid search (ChromaDB + FAISS + RRF)
        2. Log retrievals to knowledge_retrieval table (PostgreSQL)
        """
        # Use the global engine for hybrid search
        search_results = await rag_engine.search(query, top_k=top_k)

        # Convert to backward-compatible RetrievedPassage objects
        passages: list[RetrievedPassage] = []
        for r in search_results:
            passages.append(
                RetrievedPassage(
                    doc_id=r.metadata.get("section_id", ""),
                    chunk_id=r.source,
                    title=r.section_title,
                    category=r.domain,
                    content=r.content,
                    score=r.score,
                )
            )

        # Log to PostgreSQL if we have a DB session and conversation_id
        # We store without doc_id FK (chunks don't have KnowledgeDocument rows)
        # Instead, pack section_title and source_file into the passage JSON field
        if passages and conversation_id and db is not None:
            try:
                import json as _json
                from app.models.knowledge import KnowledgeRetrieval  # noqa: PLC0415
                for p in passages:
                    try:
                        # Store rich context including source file in passage field
                        passage_data = {
                            "content": p.content[:400],
                            "title": p.title,
                            "source": p.chunk_id,
                            "domain": p.category,
                        }
                        record = KnowledgeRetrieval(
                            conversation_id=conversation_id,
                            query=query,
                            doc_id=None,  # No FK — chunks are in ChromaDB/FAISS, not knowledge_document
                            passage=_json.dumps(passage_data, ensure_ascii=False)[:1000],
                            relevance_score=p.score,
                        )
                        db.add(record)
                    except Exception as exc:
                        logger.error("RAG retrieval persist error: %s", exc)
                await db.commit()
            except Exception as exc:
                logger.error("RAG retrieval DB log error: %s", exc)

        return RAGResult(query=query, passages=passages)



def _get_legacy_collection():
    """
    Return the ChromaDB collection from the new engine's vector store.
    Used by RAGManager.search() for backward-compatible embedding-based queries.
    """
    if rag_engine.vector_store._initialized:
        return rag_engine.vector_store._collection
    return None


# ── Global Singleton ───────────────────────────────────────────────────────────
# Initialized once on app startup via seed_knowledge_base() in main.py

rag_engine = RAGSearchEngine()
