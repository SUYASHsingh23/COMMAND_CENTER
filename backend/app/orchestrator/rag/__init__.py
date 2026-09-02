"""
RAG Module — Production-Grade Retrieval-Augmented Generation Engine

Architecture: ChromaDB (persistent vector store) + FAISS (in-memory ANN) + Redis (cache)
Document Sources: knowledge/policies/*.md + knowledge/faqs/*.json
Retrieval: Reciprocal Rank Fusion (RRF) merging of ChromaDB + FAISS results

Usage:
    from app.orchestrator.rag import RAGManager, TextEmbedder, seed_knowledge_base

    # Seed on startup (in main.py lifespan)
    await seed_knowledge_base(db)

    # In agent.py (unchanged interface)
    manager = RAGManager()
    result = await manager.retrieve(query, embedding, db, conversation_id)
    context = result.to_context_block()
"""

from app.orchestrator.rag.search_engine import (
    RAGManager,
    RAGResult,
    RetrievedPassage,
    rag_engine,
    RAGSearchEngine,
    RAGSearchResult,
)
from app.orchestrator.rag.embedder import TextEmbedder
from app.orchestrator.rag.seeder import seed_knowledge_base
from app.orchestrator.rag.config import RAGConfig, rag_config

__all__ = [
    "RAGManager",
    "RAGResult",
    "RetrievedPassage",
    "TextEmbedder",
    "seed_knowledge_base",
    "rag_engine",
    "RAGSearchEngine",
    "RAGSearchResult",
    "RAGConfig",
    "rag_config",
]
