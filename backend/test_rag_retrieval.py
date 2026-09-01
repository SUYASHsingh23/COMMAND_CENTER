import asyncio
import sys
from app.database.session import async_session_factory
from app.orchestrator.rag.manager import RAGManager
from app.orchestrator.rag.embedder import TextEmbedder

async def main():
    rag = RAGManager()
    embedder = TextEmbedder()
    
    query = "What is the Early Termination Fee for contract cancellations?"
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
        
    print(f"Querying: {query}")
    query_embedding = await embedder.embed(query)
    
    async with async_session_factory() as db:
        result = await rag.retrieve(
            query=query,
            query_embedding=query_embedding,
            db=db,
            conversation_id=None,
            top_k=3
        )
        
        print(f"\nFound {len(result.passages)} passages:\n")
        for i, p in enumerate(result.passages):
            print(f"--- Passage {i+1} (Score: {p.score:.4f}) ---")
            print(f"Title: {p.title}")
            print(f"Category: {p.category}")
            print(f"Content:\n{p.content}\n")
            
        print("\nContext Block:\n")
        print(result.to_context_block())

if __name__ == "__main__":
    asyncio.run(main())
