import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.conversation import Conversation, ConversationState
from app.api.websocket.broadcast import manager
from app.api.websocket.events import SessionCreatedEvent, SessionEndedEvent

logger = logging.getLogger(__name__)


class SessionManager:
    async def create_session(
        self,
        db: AsyncSession,
        customer_id: str | None = None,
        channel: str = "web",
        language: str = "en",
    ) -> Conversation:
        session_id = str(uuid.uuid4())

        conversation = Conversation(
            session_id=session_id,
            customer_id=uuid.UUID(customer_id) if customer_id else None,
            channel=channel,
            status="active",
            language=language,
        )
        db.add(conversation)

        state = ConversationState(conversation=conversation)
        db.add(state)

        await db.flush()
        await db.commit()
        await db.refresh(conversation)

        event = SessionCreatedEvent(
            session_id=session_id,
            conversation_id=str(conversation.conversation_id),
            customer_id=customer_id,
            channel=channel,
        )
        await manager.broadcast(session_id, event.model_dump())



        logger.info("Session created: %s (conversation: %s)", session_id, conversation.conversation_id)

        # ── Eagerly pre-load full customer context into session state ─────────
        # This populates customer profile, account, invoices, and appointments
        # so the agent can respond instantly without waiting for DB calls.
        if customer_id:
            try:
                from app.orchestrator.memory.redis_store import RedisMemoryStore
                from app.orchestrator.context.customer_loader import load_customer_context

                store = RedisMemoryStore()
                # Store customer_id first (marks session as authenticated)
                await store.set_field(session_id, "customer_id", customer_id)
                await store.set_field(session_id, "customer_verified", True)

                # Fetch the full bundle and cache it
                context = await load_customer_context(customer_id)
                if context:
                    await store.set_field(session_id, "customer_profile", context["customer"])
                    await store.set_field(session_id, "customer_context", context)
                    logger.info(
                        "Session %s: customer context pre-loaded for %s",
                        session_id, context["customer"].get("name", customer_id),
                    )
            except Exception as exc:
                logger.warning("Could not pre-load customer context for session %s: %s", session_id, exc)

        return conversation



    async def get_session(self, db: AsyncSession, session_id: str) -> Conversation | None:
        result = await db.execute(
            select(Conversation)
            .options(selectinload(Conversation.messages))
            .where(Conversation.session_id == session_id)
        )
        return result.scalar_one_or_none()

    async def end_session(self, db: AsyncSession, session_id: str) -> Conversation | None:
        conversation = await self.get_session(db, session_id)
        if not conversation:
            return None

        now = datetime.now(timezone.utc)
        duration_sec = None
        if conversation.started_at:
            started = conversation.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            duration_sec = int((now - started).total_seconds())

        conversation.status = "completed"
        conversation.ended_at = now
        await db.commit()
        await db.flush()

        event = SessionEndedEvent(
            session_id=session_id,
            duration_sec=duration_sec,
        )
        await manager.broadcast(session_id, event.model_dump())

        logger.info("Session ended: %s (duration: %ss)", session_id, duration_sec)
        return conversation


session_manager = SessionManager()
