from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message_type: str, payload: dict[str, Any]) -> None:
        envelope = {
            "type": message_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "payload": payload,
        }
        stale: list[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(envelope)
            except Exception:
                stale.append(connection)
        for connection in stale:
            self.disconnect(connection)


manager = ConnectionManager()
