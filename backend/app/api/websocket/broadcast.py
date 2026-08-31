import asyncio
import json
import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        self._session_connections: dict[str, list[WebSocket]] = defaultdict(list)
        self._supervisor_connections: list[WebSocket] = []

    async def connect_session(self, session_id: str, websocket: WebSocket):
        await websocket.accept()
        self._session_connections[session_id].append(websocket)
        logger.info("Session %s: event subscriber connected", session_id)

    async def connect_supervisor(self, websocket: WebSocket):
        await websocket.accept()
        self._supervisor_connections.append(websocket)
        logger.info("Supervisor event subscriber connected")

    def disconnect_session(self, session_id: str, websocket: WebSocket):
        connections = self._session_connections.get(session_id, [])
        if websocket in connections:
            connections.remove(websocket)
        if not connections:
            self._session_connections.pop(session_id, None)
        logger.info("Session %s: event subscriber disconnected", session_id)

    def disconnect_supervisor(self, websocket: WebSocket):
        if websocket in self._supervisor_connections:
            self._supervisor_connections.remove(websocket)
        logger.info("Supervisor event subscriber disconnected")

    async def broadcast_to_session(self, session_id: str, payload: dict):
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self._session_connections.get(session_id, [])):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_session(session_id, ws)

    async def broadcast_to_supervisors(self, payload: dict):
        message = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in list(self._supervisor_connections):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect_supervisor(ws)

    async def broadcast(self, session_id: str, payload: dict):
        await asyncio.gather(
            self.broadcast_to_session(session_id, payload),
            self.broadcast_to_supervisors(payload),
        )


manager = ConnectionManager()
