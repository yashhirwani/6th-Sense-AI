"""HTTP routes (/v1). Every data route is scoped to the authenticated device user."""
from __future__ import annotations

import asyncio
import json
import statistics
from datetime import datetime, timezone

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from . import __version__
from .config import get_settings
from .db import get_db
from .models import Conversation, EmergencyContact, EmergencyEvent, KnownPerson, LatencyLog, Memory, Place, User
from .schemas import (
    AssistRequest,
    AssistResult,
    Capabilities,
    ContactIn,
    DeviceAuthRequest,
    DispatchRequest,
    DispatchResult,
    EventIn,
    FaceEnroll,
    KnownPersonOut,
    LatencyIn,
    LlmCaps,
    LocalizeRequest,
    LocalizeResult,
    LocalLlmCaps,
    MemoryIn,
    MemoryOut,
    NodeLookup,
    NodeOut,
    PlaceOut,
    RouteResult,
    RouteStep,
    TokenResponse,
)
from .security import current_user, issue_token
from .services import faces, navigation, vision
from .services.llm import get_router
from .services.memory_search import embed, rank
from .services.orchestrator import Orchestrator
from .services.sms import send_sms

router = APIRouter(prefix="/v1")


# ------------------------------------------------------------------ health / auth


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "version": __version__}


@router.get("/capabilities", response_model=Capabilities)
async def capabilities() -> Capabilities:
    s = get_settings()
    r = get_router()
    await r.refresh()
    return Capabilities(
        version=__version__,
        llm=LlmCaps(provider="gemini" if r.cloud else ("ollama" if r.ollama_ok else None), model=r.cloud.model if r.cloud else (r.ollama.model if r.ollama_ok else None), available=r.pick() is not None, vision=r.cloud is not None),
        local_llm=LocalLlmCaps(available=r.ollama_ok, model=r.ollama.model if r.ollama_ok else None),
        open_vocab_detector=vision.open_vocab_available(),
        ocr=vision.ocr_available(),
        stt=False,  # speech-to-text runs on the phone
        faces=s.enable_faces,
        depth=False,
        product_lookup=True,
        sms_dispatch=s.sms_enabled,
    )


@router.post("/auth/device", response_model=TokenResponse)
def auth_device(body: DeviceAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.device_id == body.device_id).one_or_none()
    if user is None:
        user = User(device_id=body.device_id, platform=body.platform)
        db.add(user)
        db.commit()
    return TokenResponse(token=issue_token(user.id), user_id=user.id)


# ------------------------------------------------------------------ assist


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/assist", response_model=AssistResult)
async def assist(body: AssistRequest, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    orch = Orchestrator(db, user)
    if "text/event-stream" not in request.headers.get("accept", ""):
        result = None
        async for kind, payload in orch.run(body):
            if kind == "result":
                result = payload
        return result

    async def gen():
        try:
            async for kind, payload in orch.run(body):
                if kind == "delta":
                    yield _sse("delta", payload)
                else:
                    yield _sse("result", payload.model_dump(mode="json"))
        except Exception as e:  # surface as an SSE error the app can speak
            yield _sse("error", {"detail": f"Server error: {type(e).__name__}"})
            raise

    return StreamingResponse(gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ------------------------------------------------------------------ memories


def _mem_out(m: Memory) -> MemoryOut:
    return MemoryOut(id=m.id, object=m.object, context=m.context, place=m.place, lat=m.lat, lon=m.lon, confidence=m.confidence, created_at=m.created_at)


@router.post("/memories", response_model=MemoryOut)
async def add_memory(body: MemoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> MemoryOut:
    existing = db.get(Memory, body.id)
    if existing and existing.user_id != user.id:
        raise HTTPException(409, "id in use")
    text = " ".join(filter(None, [body.object, body.context, body.place]))
    m = existing or Memory(id=body.id, user_id=user.id)
    for k, v in body.model_dump(exclude={"id", "created_at"}).items():
        setattr(m, k, v)
    m.created_at = body.created_at or datetime.now(timezone.utc)
    m.embedding = await asyncio.to_thread(embed, text)
    db.add(m)
    db.commit()
    return _mem_out(m)


@router.get("/memories", response_model=list[MemoryOut])
def list_memories(limit: int = Query(100, le=500), user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Memory).filter(Memory.user_id == user.id).order_by(Memory.created_at.desc()).limit(limit).all()
    return [_mem_out(m) for m in rows]


@router.get("/memories/search", response_model=list[MemoryOut])
async def search_memories(q: str = Query(min_length=1, max_length=100), limit: int = Query(3, le=20), user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(Memory).filter(Memory.user_id == user.id).order_by(Memory.created_at.desc()).limit(500).all()
    ranked = await asyncio.to_thread(rank, q, [(m.id, " ".join(filter(None, [m.object, m.context])), m.embedding) for m in rows])
    by_id = {m.id: m for m in rows}
    return [_mem_out(by_id[mid]) for mid, score in ranked[:limit] if score >= 0.55]


@router.delete("/memories/{mid}", status_code=204)
def delete_memory(mid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.query(Memory).filter(Memory.user_id == user.id, Memory.id == mid).delete()
    db.commit()
    return Response(status_code=204)


@router.delete("/memories", status_code=204)
def delete_all_memories(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.query(Memory).filter(Memory.user_id == user.id).delete()
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ emergency


@router.put("/emergency/contacts", response_model=list[ContactIn])
def put_contacts(body: list[ContactIn], user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.query(EmergencyContact).filter(EmergencyContact.user_id == user.id).delete()
    for c in body[:10]:
        db.add(EmergencyContact(id=c.id, user_id=user.id, name=c.name, phone=c.phone, relation=c.relation, is_primary=c.is_primary))
    db.commit()
    return body


@router.post("/emergency/dispatch", response_model=DispatchResult)
async def dispatch(body: DispatchRequest, user: User = Depends(current_user), db: Session = Depends(get_db)) -> DispatchResult:
    if not get_settings().sms_enabled:
        raise HTTPException(503, "Automatic SMS is not configured on this server")
    contacts = body.contacts or [ContactIn(id=c.id, name=c.name, phone=c.phone, relation=c.relation, is_primary=c.is_primary) for c in db.query(EmergencyContact).filter(EmergencyContact.user_id == user.id)]
    results = await asyncio.gather(*(send_sms(c.phone, body.message) for c in contacts))
    sent = sum(results)
    db.add(EmergencyEvent(user_id=user.id, trigger=body.trigger, status="dispatched" if sent else "failed", detail=f"server SMS sent={sent} failed={len(results) - sent}", lat=body.lat, lon=body.lon))
    db.commit()
    return DispatchResult(sent=sent, failed=len(results) - sent)


@router.post("/emergency/events", status_code=204)
def log_event(body: EventIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.add(EmergencyEvent(user_id=user.id, **body.model_dump()))
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ faces (opt-in)


@router.get("/faces", response_model=list[KnownPersonOut])
def list_faces(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.query(KnownPerson).filter(KnownPerson.user_id == user.id).order_by(KnownPerson.name).all()
    return [KnownPersonOut(id=r.id, name=r.name, created_at=r.created_at, samples=r.samples) for r in rows]


@router.post("/faces", response_model=KnownPersonOut)
async def enrol_face(body: FaceEnroll, user: User = Depends(current_user), db: Session = Depends(get_db)) -> KnownPersonOut:
    if not body.consent:
        raise HTTPException(400, "Consent of the person is required to enrol their face")
    if not await asyncio.to_thread(faces.available):
        raise HTTPException(503, "Face recognition models are not available on this server")
    embs = []
    for b64 in body.images_b64:
        found = await asyncio.to_thread(faces.embed_faces, vision.decode_image(b64))
        if len(found) == 1:
            embs.append(found[0][0])
    if len(embs) < max(1, len(body.images_b64) - 1):
        raise HTTPException(422, "Each photo must show exactly one clear face")
    arr = np.stack(embs).astype(np.float32)
    p = KnownPerson(user_id=user.id, name=body.name.strip(), embeddings=arr.tobytes(), samples=len(embs), consent=True)
    db.add(p)
    db.commit()
    return KnownPersonOut(id=p.id, name=p.name, created_at=p.created_at, samples=p.samples)


@router.delete("/faces/{pid}", status_code=204)
def delete_face(pid: str, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.query(KnownPerson).filter(KnownPerson.user_id == user.id, KnownPerson.id == pid).delete()
    db.commit()
    return Response(status_code=204)


# ------------------------------------------------------------------ indoor navigation


def _place_out(p: Place) -> PlaceOut:
    return PlaceOut(id=p.id, name=p.name, building=p.building, floor=p.floor)


def _node(p: Place, nid: str) -> dict:
    node = next((n for n in p.graph["nodes"] if n["id"] == nid), None)
    if node is None:
        raise HTTPException(404, "Unknown location code")
    return node


@router.get("/places", response_model=list[PlaceOut])
def list_places(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return [_place_out(p) for p in db.query(Place).all()]


@router.get("/places/{pid}/nodes/{nid}", response_model=NodeLookup)
def get_node(pid: str, nid: str, _: User = Depends(current_user), db: Session = Depends(get_db)) -> NodeLookup:
    p = db.get(Place, pid)
    if p is None:
        raise HTTPException(404, "Unknown building")
    n = _node(p, nid)
    return NodeLookup(place=_place_out(p), node=NodeOut(id=n["id"], name=n["name"]))


@router.get("/places/{pid}/route", response_model=RouteResult)
def route(pid: str, from_: str = Query(alias="from"), to: str = Query(), _: User = Depends(current_user), db: Session = Depends(get_db)) -> RouteResult:
    p = db.get(Place, pid)
    if p is None:
        raise HTTPException(404, "Unknown building")
    _node(p, from_)
    goal = navigation.resolve_node(p.graph, to)
    if goal is None:
        raise HTTPException(404, f"I don't know a place called {to} in this building")
    if goal == from_:
        return RouteResult(from_node=from_, to_node=goal, total_m=0, steps=[])
    path = navigation.shortest_path(p.graph, from_, goal)
    if path is None:
        raise HTTPException(404, "No walkable route found")
    steps = navigation.route_steps(p.graph, path)
    return RouteResult(from_node=from_, to_node=goal, total_m=round(sum(s["distance_m"] for s in steps), 1), steps=[RouteStep(**s) for s in steps])


@router.post("/nav/localize", response_model=LocalizeResult)
async def localize(body: LocalizeRequest, _: User = Depends(current_user), db: Session = Depends(get_db)) -> LocalizeResult:
    tags = await asyncio.to_thread(navigation.detect_apriltags, vision.decode_image(body.image_b64))
    for p in db.query(Place).all():
        for n in p.graph["nodes"]:
            if n.get("apriltag") in tags:
                return LocalizeResult(place=_place_out(p), node=NodeOut(id=n["id"], name=n["name"]), tags=tags)
    return LocalizeResult(place=None, node=None, tags=tags)


# ------------------------------------------------------------------ research metrics


@router.post("/telemetry/latency", status_code=204)
def post_latency(body: LatencyIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    db.add(LatencyLog(user_id=user.id, **body.model_dump()))
    db.commit()
    return Response(status_code=204)


@router.get("/metrics/latency")
def latency_summary(_: User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Median / p90 end-to-end and first-audio latency per mode and engine (research evaluation)."""
    out: dict[str, dict] = {}
    for row in db.query(LatencyLog).all():
        key = f"{row.kind}/{row.source}"
        out.setdefault(key, {"total": [], "first_audio": [], "server": []})
        for field, v in (("total", row.total_ms), ("first_audio", row.first_audio_ms), ("server", row.server_ms)):
            if v is not None:
                out[key][field].append(v)

    def stats(v: list[int]) -> dict:
        if not v:
            return {}
        s = sorted(v)
        return {"n": len(s), "median": statistics.median(s), "p90": s[min(len(s) - 1, int(len(s) * 0.9))]}

    return {k: {f: stats(v) for f, v in d.items()} for k, d in out.items()}


# ------------------------------------------------------------------ privacy


@router.delete("/me/data", status_code=204)
def delete_my_data(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    for model in (Memory, EmergencyContact, EmergencyEvent, KnownPerson, Conversation, LatencyLog):
        db.query(model).filter(model.user_id == user.id).delete()
    db.delete(user)
    db.commit()
    return Response(status_code=204)
