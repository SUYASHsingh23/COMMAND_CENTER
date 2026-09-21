"""
RAG Module — Production-Grade Retrieval-Augmented Generation Engine

Architecture: ChromaDB (persistent vector store) + FAISS (in-memory ANN) + Redis (cache)
Document Sources: knowledge/policies/*.md + knowledge/faqs/*.json
Retrieval: Reciprocal Rank Fusion (RRF) merging of ChromaDB + FAISS results

Usage:
    from app.orchestrator.rag import rag_engine, seed_knowledge_base

    # Seed on startup (in main.py lifespan)
    await seed_knowledge_base(db)

    # Search
    results = await rag_engine.search("What is zero depreciation?", top_k=5)
    for r in results:
        print(r.section_title, r.content, r.score)
"""

from app.orchestrator.rag.search_engine import (
    rag_engine,
    RAGSearchEngine,
    RAGResult,
)
from app.orchestrator.rag.embedder import TextEmbedder
from app.orchestrator.rag.seeder import seed_knowledge_base
from app.orchestrator.rag.config import RAGConfig, rag_config

__all__ = [
    "rag_engine",
    "RAGSearchEngine",
    "RAGResult",
    "TextEmbedder",
    "seed_knowledge_base",
    "RAGConfig",
    "rag_config",
]
