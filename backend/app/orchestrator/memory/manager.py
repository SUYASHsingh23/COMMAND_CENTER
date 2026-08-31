from dataclasses import dataclass, field
from app.orchestrator.memory.redis_store import RedisMemoryStore
from app.orchestrator.memory.pg_store import PGMemoryStore
from app.orchestrator.intent.extractor import IntentResult


@dataclass
class SessionMemory:
    session_id: str
    state: dict = field(default_factory=dict)
    history: list[dict] = field(default_factory=list)
    recent_messages: list[dict] = field(default_factory=list)
    prior_intents: list[dict] = field(default_factory=list)
    long_term: dict[str, str] = field(default_factory=dict)


class MemoryManager:
    def __init__(self):
        self.redis = RedisMemoryStore()
        self.pg = PGMemoryStore()

    async def load(self, session_id: str, db, customer_id=None) -> SessionMemory:
        state = await self.redis.load_state(session_id)
        history = await self.redis.load_history(session_id)

        recent_messages: list[dict] = []
        prior_intents: list[dict] = []
        long_term: dict[str, str] = {}

        conversation = await self.pg.get_conversation(db, session_id)
        if conversation:
            recent_messages = await self.pg.get_recent_messages(db, conversation.conversation_id, limit=8)
            prior_intents = await self.pg.get_last_intents(db, conversation.conversation_id, limit=3)
            cid = customer_id or state.get("customer_id")
            if cid:
                long_term = await self.pg.get_long_term_memories(db, cid)

        return SessionMemory(
            session_id=session_id,
            state=state,
            history=history,
            recent_messages=recent_messages,
            prior_intents=prior_intents,
            long_term=long_term,
        )

    async def after_turn(
        self,
        session_id: str,
        db,
        transcript: str,
        response: str,
        intent_result: IntentResult,
        domain: str,
        conversation_id=None,
        message_id=None,
    ) -> None:
        await self.redis.append_turn(session_id, "user", transcript)
        await self.redis.append_turn(session_id, "assistant", response)
        await self.redis.set_field(session_id, "domain", domain)

        if conversation_id and message_id:
            await self.pg.save_intent(
                db=db,
                conversation_id=conversation_id,
                message_id=message_id,
                intents=intent_result.intents,
                entities=intent_result.entities,
                sentiment=intent_result.sentiment,
                urgency=intent_result.urgency,
                confidence=intent_result.confidence,
            )

    async def set_customer_verified(self, session_id: str, customer_id: str) -> None:
        state = await self.redis.load_state(session_id)
        state["customer_verified"] = True
        state["customer_id"] = customer_id
        await self.redis.save_state(session_id, state)

    async def update_task_status(self, session_id: str, task: str, status: str) -> None:
        state = await self.redis.load_state(session_id)
        state.setdefault("task_status", {})[task] = status
        await self.redis.save_state(session_id, state)

    async def set_field(self, session_id: str, field: str, value) -> None:
        """Proxy to redis_store.set_field for one-off state updates from outside the manager."""
        await self.redis.set_field(session_id, field, value)
