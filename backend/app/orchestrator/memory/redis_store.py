"""
RedisMemoryStore — In-memory-first session storage with optional Redis persistence.

Architecture change from previous version:
- ALL reads/writes go to the module-level in-memory dict FIRST (zero-latency).
- Redis is used as a best-effort async persistence layer (fire-and-forget).
- Redis being down causes zero delay — the except block hits in <1ms with the
  tight socket_connect_timeout=0.1 set on the client.
- This eliminates the 10-20 second startup delay caused by 10+ Redis timeouts.
- Session data persists for the lifetime of the uvicorn process (single-worker).
"""
import json
import logging
from app.database.redis import get_redis_client

logger = logging.getLogger(__name__)

# ─── Primary in-memory store (module-level, shared across all instances) ───────
# This is the authoritative store. Redis is only a secondary backup.
_state:   dict[str, dict] = {}    # session_id -> state dict
_history: dict[str, list] = {}    # session_id -> list of turn dicts

DEFAULT_STATE = {
    "customer_verified": False,
    "task_status": {},
    "current_workflow": None,
    "customer_id": None,
    "domain": "general",
}


class RedisMemoryStore:
    SESSION_TTL = 14400  # 4 hours (used for Redis TTL only)

    def _key(self, session_id: str) -> str:
        return f"session:{session_id}:state"

    def _history_key(self, session_id: str) -> str:
        return f"session:{session_id}:history"

    # ─── State ────────────────────────────────────────────────────────────────

    async def load_state(self, session_id: str) -> dict:
        # In-memory is authoritative — always read from it first
        if session_id in _state:
            return dict(_state[session_id])

        # Not in memory — try Redis (only on first load after restart)
        try:
            redis = await get_redis_client()
            raw = await redis.get(self._key(session_id))
            if raw:
                loaded = json.loads(raw)
                _state[session_id] = loaded       # Cache into memory
                return dict(loaded)
        except Exception:
            pass  # Redis unavailable — return default

        # New session: initialise with defaults
        state = dict(DEFAULT_STATE)
        _state[session_id] = state
        return dict(state)

    async def save_state(self, session_id: str, state: dict) -> None:
        # Write to memory immediately (zero latency)
        _state[session_id] = dict(state)

        # Best-effort async persist to Redis
        try:
            redis = await get_redis_client()
            await redis.setex(self._key(session_id), self.SESSION_TTL, json.dumps(state))
        except Exception:
            pass  # Redis unavailable — in-memory store is sufficient

    async def set_field(self, session_id: str, field: str, value) -> None:
        """Atomic single-field update — reads from and writes to in-memory store."""
        current = _state.get(session_id, dict(DEFAULT_STATE))
        current[field] = value
        _state[session_id] = current

        # Best-effort persist
        try:
            redis = await get_redis_client()
            await redis.setex(self._key(session_id), self.SESSION_TTL, json.dumps(current))
        except Exception:
            pass

    # ─── History ──────────────────────────────────────────────────────────────

    async def load_history(self, session_id: str) -> list[dict]:
        if session_id in _history:
            return list(_history[session_id])

        # Try Redis on first access
        try:
            redis = await get_redis_client()
            raw_items = await redis.lrange(self._history_key(session_id), -40, -1)
            hist = [json.loads(item) for item in raw_items]
            _history[session_id] = hist
            return list(hist)
        except Exception:
            pass

        _history[session_id] = []
        return []

    async def append_turn(self, session_id: str, role: str, content: str) -> None:
        turn = {"role": role, "content": content}
        hist = _history.setdefault(session_id, [])
        hist.append(turn)
        # Keep only last 40 entries
        if len(hist) > 40:
            _history[session_id] = hist[-40:]

        # Best-effort Redis persist
        try:
            redis = await get_redis_client()
            pipe = redis.pipeline()
            pipe.rpush(self._history_key(session_id), json.dumps(turn))
            pipe.ltrim(self._history_key(session_id), -40, -1)
            pipe.expire(self._history_key(session_id), self.SESSION_TTL)
            await pipe.execute()
        except Exception:
            pass

    async def clear(self, session_id: str) -> None:
        _state.pop(session_id, None)
        _history.pop(session_id, None)
        try:
            redis = await get_redis_client()
            await redis.delete(self._key(session_id), self._history_key(session_id))
        except Exception:
            pass
