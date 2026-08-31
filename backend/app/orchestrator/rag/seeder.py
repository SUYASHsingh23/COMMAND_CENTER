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

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeDocument
from app.database.session import async_session_factory
from app.orchestrator.rag.embedder import TextEmbedder

logger = logging.getLogger(__name__)

# ─── Knowledge base documents ─────────────────────────────────────────────────
# Replace / extend these entries for any domain (telecom, insurance, IT, etc.)
# Each entry: title, category, content (plain text; will be auto-chunked).
KNOWLEDGE_BASE = [
    {
        "title": "Refund Policy",
        "category": "billing",
        "content": (
            "ConnectPlus offers full refunds within 7 days of billing for incorrect charges. "
            "Refunds for service outages exceeding 24 hours are automatically credited. "
            "Disputed amounts above INR 5000 require supervisor approval. "
            "Refunds are processed within 3-5 business days to the original payment method."
        ),
    },
    {
        "title": "Service Outage Compensation",
        "category": "billing",
        "content": (
            "Customers experiencing verified service outages exceeding 4 hours receive automatic bill credit. "
            "Credits equal one day of service charges per 4-hour outage block. "
            "Outage compensation is applied to the next billing cycle. "
            "Customers can call support to request manual credit if auto-credit is not applied within 72 hours."
        ),
    },
    {
        "title": "Plan Upgrade Process",
        "category": "sales",
        "content": (
            "Customers can upgrade their plan at any time. The new plan takes effect within 2 hours of confirmation. "
            "Pro-rated billing applies — the customer pays only for the days at each plan level. "
            "No additional fees are charged for upgrades. "
            "Customers can downgrade once per billing cycle without penalty."
        ),
    },
    {
        "title": "Cancellation Policy",
        "category": "sales",
        "content": (
            "ConnectPlus requires 30 days notice for service cancellation. "
            "Early termination fees apply for customers within the minimum contract period: "
            "INR 2000 for broadband, INR 1000 for mobile. "
            "Customers who cancel due to service quality issues within 30 days of activation "
            "are exempt from termination fees. Equipment must be returned within 14 days."
        ),
    },
    {
        "title": "Technical Support SLA",
        "category": "technical",
        "content": (
            "Critical technical issues (no service) are resolved within 4 hours. "
            "High priority issues (degraded service) are resolved within 8 hours. "
            "Standard tickets are resolved within 48 hours. "
            "Field engineer visits can be scheduled for next-business-day for most areas. "
            "Remote diagnostics are attempted first before field visits."
        ),
    },
    {
        "title": "Router and Equipment Policy",
        "category": "technical",
        "content": (
            "ConnectPlus provides routers on a rental basis at INR 200 per month. "
            "Customers experiencing hardware failure receive a replacement within 24 hours. "
            "Customer-caused damage voids the replacement guarantee. "
            "Customers who own their equipment must ensure compatibility with ConnectPlus "
            "network standards (DOCSIS 3.1 or higher for broadband)."
        ),
    },
    {
        "title": "Billing Dispute Resolution",
        "category": "billing",
        "content": (
            "Customers disputing a charge must contact support within 60 days of the invoice date. "
            "Dispute investigations are completed within 7 business days. "
            "Disputed amounts are suspended from collections during investigation. "
            "If the dispute is resolved in favor of the customer, the credit appears within 2 billing cycles. "
            "Customers receive written resolution notices."
        ),
    },
    {
        "title": "Data and Speed Policy",
        "category": "technical",
        "content": (
            "ConnectPlus Fiber 200 provides up to 200 Mbps download and 100 Mbps upload. "
            "Fiber 500 provides up to 500 Mbps download and 250 Mbps upload. "
            "Basic plan provides up to 50 Mbps download. "
            "During peak hours (6PM-11PM), speeds may be up to 20% lower due to network congestion management. "
            "Fair Usage Policy applies above 1TB monthly data."
        ),
    },
    {
        "title": "Identity Verification Requirements",
        "category": "account",
        "content": (
            "Agents must verify customer identity before discussing account details, billing, or making changes. "
            "Verification requires any two of: registered phone number, account number, registered email, "
            "or last 4 digits of Aadhaar. "
            "Failed verification after 3 attempts triggers a security hold requiring in-store verification."
        ),
    },
    {
        "title": "Auto-Pay and Payment Methods",
        "category": "billing",
        "content": (
            "ConnectPlus accepts UPI, credit cards, debit cards, net banking, and cheques. "
            "Auto-pay customers receive a 5% discount on monthly bills. "
            "Auto-pay failures result in a 3-day grace period before service suspension. "
            "Customers are notified via SMS and email before any service suspension."
        ),
    },
]

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


async def seed_knowledge_base(db: AsyncSession) -> int:
    """
    Ingest all KNOWLEDGE_BASE entries into ChromaDB.

    Returns:
        Number of newly seeded documents (0 if all already indexed).
    """
    from app.orchestrator.rag.manager import _get_collection  # noqa: PLC0415
    collection = _get_collection()
    embedder = TextEmbedder()
    seeded = 0

    for item in KNOWLEDGE_BASE:
        content_hash = hashlib.sha256(item["content"].encode()).hexdigest()

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
