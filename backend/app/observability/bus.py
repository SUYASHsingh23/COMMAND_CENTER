import logging
from app.api.websocket.broadcast import manager
from app.api.websocket.events import BaseEvent

logger = logging.getLogger(__name__)


class EventBus:
    async def emit(self, session_id: str, event: BaseEvent):
        payload = event.model_dump()
        logger.debug("Event emitted — session=%s type=%s", session_id, event.event)
        await manager.broadcast(session_id, payload)


event_bus = EventBus()
