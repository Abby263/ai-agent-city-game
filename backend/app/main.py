from __future__ import annotations

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import cognition, engine, router
from app.config import get_settings
from app.database import SessionLocal, init_db
from app.realtime import manager
from app.schemas import SimulationModeRequest, TriggerEventRequest
from app.seed import ensure_seeded

settings = get_settings()

app = FastAPI(title="AgentCity API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "agentcity-api"}


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    with SessionLocal() as db:
        ensure_seeded(db)


@app.websocket("/ws/city")
async def websocket_city(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        with SessionLocal() as db:
            state = engine.get_state(db)
            await websocket.send_json(
                {
                    "type": "city_state",
                    "timestamp": state.events[-1].timestamp.isoformat() if state.events else None,
                    "payload": state.model_dump(mode="json"),
                }
            )

        while True:
            message = await websocket.receive_json()
            command = message.get("command")
            with SessionLocal() as db:
                if command == "tick":
                    result = engine.tick(db, cognition)
                    state = result["state"]
                    await manager.broadcast("tick", state.model_dump(mode="json"))
                elif command == "trigger_event":
                    request = TriggerEventRequest(**message.get("payload", {}))
                    state = engine.trigger_event(db, request)
                    await manager.broadcast("city_state", state.model_dump(mode="json"))
                elif command == "start":
                    state = engine.start(db)
                    await manager.broadcast("city_state", state.model_dump(mode="json"))
                elif command == "pause":
                    state = engine.pause(db)
                    await manager.broadcast("city_state", state.model_dump(mode="json"))
                elif command == "set_mode":
                    request = SimulationModeRequest(**message.get("payload", {}))
                    state = engine.set_mode(db, request)
                    await manager.broadcast("city_state", state.model_dump(mode="json"))
    except WebSocketDisconnect:
        manager.disconnect(websocket)
