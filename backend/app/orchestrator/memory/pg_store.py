import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.conversation import Conversation, Message, Intent
from app.models.memory import Memory

logger = logging.getLogger(__name__)


class PGMemoryStore:
    async def get_conversation(self, db: AsyncSession, session_id: str) -> Conversation | None:
        result = await db.execute(
            select(Conversation).where(Conversation.session_id == session_id)
        )
        return result.scalar_one_or_none()

    async def get_recent_messages(self, db: AsyncSession, conversation_id, limit: int = 10) -> list[dict]:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.turn_index.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        messages = [{"role": m.role, "content": m.content} for m in reversed(rows)]
        return messages

    async def get_last_intents(self, db: AsyncSession, conversation_id, limit: int = 3) -> list[dict]:
        result = await db.execute(
            select(Intent)
            .where(Intent.conversation_id == conversation_id)
            .order_by(Intent.intent_id.desc())
            .limit(limit)
        )
        rows = result.scalars().all()
        return [{"intents": r.detected_intents, "sentiment": r.sentiment, "urgency": r.urgency} for r in rows]

    async def save_intent(
        self,
        db: AsyncSession,
        conversation_id,
        message_id,
        intents: list[str],
        entities: dict,
        sentiment: str,
        urgency: str,
        confidence: float,
    ) -> None:
        try:
            record = Intent(
                conversation_id=conversation_id,
                message_id=message_id,
                detected_intents=intents,
                entities=entities,
                sentiment=sentiment,
                urgency=urgency,
                confidence=confidence,
            )
            db.add(record)
            await db.commit()
        except Exception as exc:
            logger.error("PGMemoryStore save_intent error: %s", exc)
            await db.rollback()

    async def save_long_term_memory(
        self,
        db: AsyncSession,
        conversation_id,
        customer_id,
        memory_type: str,
        key: str,
        value: str,
    ) -> None:
        try:
            record = Memory(
                conversation_id=conversation_id,
                customer_id=customer_id,
                memory_type=memory_type,
                key=key,
                value=value,
            )
            db.add(record)
            await db.commit()
        except Exception as exc:
            logger.error("PGMemoryStore save_long_term_memory error: %s", exc)
            await db.rollback()

    async def get_long_term_memories(
        self,
        db: AsyncSession,
        customer_id,
        keys: list[str] | None = None,
    ) -> dict[str, str]:
        try:
            q = select(Memory).where(
                Memory.customer_id == customer_id,
                Memory.memory_type == "long_term",
            )
            if keys:
                q = q.where(Memory.key.in_(keys))
            result = await db.execute(q)
            rows = result.scalars().all()
            return {r.key: r.value for r in rows}
        except Exception as exc:
            logger.error("PGMemoryStore get_long_term_memories error: %s", exc)
            return {}
