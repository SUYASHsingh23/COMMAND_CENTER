"""
Knowledge Base Seeder — ChromaDB edition.

Workflow:
  1. Text is chunked with RecursiveCharacterTextSplitter (overlap for context continuity)
  2. Chunks are batch-embedded with SentenceTransformer all-MiniLM-L6-v2 (local, free)
  3. Embeddings are upserted into ChromaDB with rich metadata
  4. Doc record written to knowledge_document table for audit trail
  5. Content-hash deduplication avoids re-indexing unchanged documents

Domain-agnostic: add any domain's documents to KNOWLEDGE_BASE (or load from files/DB).
"""
from __future__ import annotations

import hashlib
import logging
import uuid
import os
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeDocument
from app.database.session import async_session_factory
from app.orchestrator.rag.embedder import TextEmbedder

logger = logging.getLogger(__name__)

# ─── Knowledge base documents ─────────────────────────────────────────────────
# InsureAI — Insurance knowledge base covering Health, Home, and Motor insurance.
# Each entry: title, category, content (plain text; will be auto-chunked).
KNOWLEDGE_BASE = []


# ─── Chunking config ──────────────────────────────────────────────────────────
# chunk_size   : max characters per chunk (≈ 120 tokens for English text)
# chunk_overlap: overlap between consecutive chunks to preserve context
_CHUNK_SIZE    = 600
_CHUNK_OVERLAP = 80


def _chunk_text(text: str, title: str) -> list[str]:
    """Split text into overlapping chunks using LangChain's recursive splitter."""
    from langchain_text_splitters import RecursiveCharacterTextSplitter  # noqa: PLC0415
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=_CHUNK_SIZE,
        chunk_overlap=_CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(text)
    # If a document is short enough to fit in one chunk, still return it
    return chunks if chunks else [text]


def _load_markdown_policies() -> list[dict]:
    docs = []
    # Path relative to backend/app/orchestrator/rag/seeder.py -> backend/../knowledge/policies
    base_dir = Path(__file__).resolve().parent.parent.parent.parent.parent / "knowledge" / "policies"
    if not base_dir.exists():
        logger.warning("Policy directory not found at %s", base_dir)
        return docs
    
    for md_file in base_dir.glob("*.md"):
        content = md_file.read_text(encoding="utf-8")
        
        # Split by "## " or "### "
        sections = re.split(r'\n(#{2,3})\s', content)
        
        if sections[0].strip():
            docs.append({
                "title": f"{md_file.stem} - Introduction",
                "category": "policy",
                "content": sections[0].strip()
            })
            
        for i in range(1, len(sections), 2):
            body = sections[i+1]
            lines = body.split('\n', 1)
            title = lines[0].strip()
            text = lines[1].strip() if len(lines) > 1 else ""
            
            if text:
                docs.append({
                    "title": title,
                    "category": "policy",
                    "content": text
                })
                
    return docs

async def seed_knowledge_base(db: AsyncSession) -> int:
    """
    Ingest all KNOWLEDGE_BASE entries and Markdown policies into ChromaDB.

    Returns:
        Number of newly seeded documents (0 if all already indexed).
    """
    from app.orchestrator.rag.manager import _get_collection  # noqa: PLC0415
    collection = _get_collection()
    embedder = TextEmbedder()
    seeded = 0
    seen_hashes = set()

    dynamic_docs = _load_markdown_policies()
    all_docs = KNOWLEDGE_BASE + dynamic_docs

    for item in all_docs:
        content_hash = hashlib.sha256(item["content"].encode()).hexdigest()

        if content_hash in seen_hashes:
            continue
        seen_hashes.add(content_hash)

        # Check if already indexed in PostgreSQL audit table
        existing = await db.execute(
            select(KnowledgeDocument).where(KnowledgeDocument.content_hash == content_hash)
        )
        if existing.scalar_one_or_none():
            logger.debug("Skipping already-indexed doc: %s", item["title"])
            continue

        # ── 1. Chunk ──────────────────────────────────────────────────────────
        chunks = _chunk_text(item["content"], item["title"])
        logger.info("Seeding '%s' → %d chunk(s)", item["title"], len(chunks))

        # ── 2. Batch embed (single model.encode call for all chunks) ──────────
        embeddings = embedder.embed_batch_sync(chunks)

        # ── 3. Create stable doc_id for all chunks of this document ───────────
        doc_id = str(uuid.uuid4())

        # ── 4. Build ChromaDB upsert payload ──────────────────────────────────
        chunk_ids  = [f"{doc_id}_{i}" for i in range(len(chunks))]
        metadatas  = [
            {
                "doc_id":   doc_id,
                "title":    item["title"],
                "category": item["category"],
                "source":   "internal_policy",
                "chunk_index": i,
            }
            for i in range(len(chunks))
        ]

        collection.upsert(
            ids=chunk_ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )

        # ── 5. Write audit record to PostgreSQL ───────────────────────────────
        doc = KnowledgeDocument(
            doc_id=uuid.UUID(doc_id),
            title=item["title"],
            category=item["category"],
            source="internal_policy",
            content_hash=content_hash,
            embedding_model="all-MiniLM-L6-v2",
        )
        db.add(doc)
        seeded += 1

    await db.commit()
    total = collection.count()
    logger.info(
        "Knowledge base seeding done: %d new docs, %d total chunks in ChromaDB",
        seeded, total,
    )
    return seeded
