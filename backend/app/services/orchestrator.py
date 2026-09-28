"""/v1/assist pipeline.

phone photo + on-device detections + OCR + question
  -> server perception (open-vocab hazards, pose cues, faces, OCR, product DB) in parallel threads
  -> grounded context block
  -> best available engine: Gemini (vision) > Ollama (text over context) > deterministic rules
  -> streamed answer (SSE deltas) + structured result
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from datetime import datetime, timedelta, timezone
from typing import Any

import numpy as np
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Conversation, KnownPerson, Turn, User
from ..schemas import AssistRequest, AssistResult, ServerHazard
from . import faces, vision
from .llm import LlmError, LlmRequest, LlmUsage, get_router
from .products import lookup_barcode
from .prompts import CURRENCY_NOTICE, DETAILED_MODES, MEDICINE_NOTICE, MODE_INSTRUCTIONS, SCHEMAS, SYSTEM_PROMPT

log = logging.getLogger(__name__)

STRUCTURED_MODES = {"product", "medicine", "currency"}
HISTORY_TURNS = 6


def _plural(name: str, n: int) -> str:
    return name if n == 1 else ("people" if name == "person" else f"{name}s")


def _describe_detections(req: AssistRequest) -> str:
    if not req.detections:
        return "none"
    parts = []
    for d in sorted(req.detections, key=lambda d: d.distance_m if d.distance_m is not None else 99)[:15]:
        dist = f"~{d.distance_m:.1f} m" if d.distance_m is not None else "distance unknown"
        where = "ahead" if d.bearing == "front" else d.bearing
        extra = ", approaching" if d.approaching else ""
        parts.append(f"{d.label} ({where}, {d.clock} o'clock, {dist}{extra}, conf {d.confidence:.2f})")
    return "; ".join(parts)


def rules_answer(req: AssistRequest, extra_hazards: list[dict[str, Any]], people: list[dict[str, Any]]) -> str:
    """Deterministic answer when no language model is available - only states measured facts."""
    if req.mode in ("read", "document", "medicine") and req.ocr_text:
        return req.ocr_text.strip()
    counts: dict[str, int] = {}
    for d in req.detections:
        counts[d.label] = counts.get(d.label, 0) + 1
    parts = []
    for h in extra_hazards[:2]:
        parts.append(h["message"])
    if counts:
        items = ", ".join(f"{n} {_plural(label, n)}" for label, n in sorted(counts.items(), key=lambda kv: -kv[1])[:5])
        parts.append(f"I can see {items}.")
        near = [d for d in req.detections if d.distance_m is not None]
        if near:
            d = min(near, key=lambda d: d.distance_m or 99)
            where = "ahead" if d.bearing == "front" else f"on your {d.bearing}"
            parts.append(f"The nearest is a {d.label}, about {d.distance_m:.0f} metres {where}.")
    for p in people[:2]:
        if p["cues"]:
            where = "ahead" if p["bearing"] == "front" else f"on your {p['bearing']}"
            parts.append(f"A person {where} {p['cues'][0]}.")
    if not parts:
        return "I can't recognise anything clearly right now, and cloud AI reasoning is unavailable."
    return " ".join(parts) + " (Cloud AI reasoning is unavailable - this answer uses detection only.)"


class Orchestrator:
    def __init__(self, db: Session, user: User):
        self.db = db
        self.user = user

    # ---------------------------------------------------------------- conversation memory (text only)

    def _conversation(self, conv_id: str | None) -> Conversation:
        ttl = timedelta(hours=get_settings().conversation_ttl_hours)
        conv = self.db.get(Conversation, conv_id) if conv_id else None
        if conv is None or conv.user_id != self.user.id or conv.updated_at.replace(tzinfo=conv.updated_at.tzinfo or timezone.utc) < datetime.now(timezone.utc) - ttl:
            conv = Conversation(user_id=self.user.id)
            self.db.add(conv)
            self.db.flush()
        return conv

    def _history(self, conv: Conversation) -> list[dict[str, str]]:
        turns = conv.turns[-HISTORY_TURNS:]
        hist = [{"role": t.role, "content": t.text} for t in turns]
        while hist and hist[0]["role"] != "user":  # API requires user first
            hist.pop(0)
        return hist

    # ---------------------------------------------------------------- perception

    async def _perceive(self, req: AssistRequest, img) -> dict[str, Any]:
        mode = req.mode
        tasks: dict[str, Any] = {}
        if img is not None:
            if mode in ("describe", "ask", "find"):
                classes = list(vision.HAZARD_VOCAB) + vision.LANDMARK_VOCAB
                if mode == "find" and req.query:
                    classes = [req.query.strip().lower()[:60]]
                tasks["open_vocab"] = asyncio.to_thread(vision.detect_open_vocab, img, classes, 0.2 if mode == "find" else 0.3)
            if mode in ("describe", "people", "ask"):
                tasks["people"] = asyncio.to_thread(vision.people_cues, img)
            if mode in ("people", "describe") and req.allow_faces:
                tasks["faces"] = asyncio.to_thread(self._identify_faces, img)
            if mode in ("read", "document", "product", "medicine") and len(req.ocr_text or "") < 40:
                tasks["ocr"] = asyncio.to_thread(vision.run_ocr, img)
        if mode == "product" and req.barcode:
            tasks["product"] = lookup_barcode(req.barcode)
        s = get_settings()
        budget = s.perception_budget_detailed_s if mode in DETAILED_MODES else s.perception_budget_fast_s
        futures = {key: asyncio.ensure_future(t) for key, t in tasks.items()}
        if futures:
            await asyncio.wait(futures.values(), timeout=budget)
        out: dict[str, Any] = {}
        late: dict[str, asyncio.Future] = {}
        for key, fut in futures.items():
            if not fut.done():
                late[key] = fut  # keeps running; used for hazard alerts only
                continue
            if fut.exception() is not None:
                log.warning("perception step %s failed: %s", key, fut.exception())
                continue
            out[key] = fut.result()
        out["_late"] = late
        return out

    def _identify_faces(self, img) -> list[dict[str, Any]]:
        if not faces.available():
            return []
        rows = self.db.query(KnownPerson).filter(KnownPerson.user_id == self.user.id, KnownPerson.consent.is_(True)).all()
        gallery = [(r.name, np.frombuffer(r.embeddings, dtype=np.float32).reshape(-1, 128)) for r in rows]
        found = []
        for emb, box in faces.embed_faces(img):
            name, score = faces.best_match(emb, gallery) if gallery else (None, 0.0)
            bearing, _ = vision.bearing_for(box[0] + box[2] / 2)
            found.append({"name": name, "similarity": round(score, 2), "bearing": bearing})
        return found

    # ---------------------------------------------------------------- context

    def _context(self, req: AssistRequest, p: dict[str, Any], extra_hazards: list[dict[str, Any]]) -> str:
        lines = [f"Reply language: {'Hindi' if req.language == 'hi' else 'English'}."]
        lines.append(f"Phone detections (on-device YOLO, distances approximate): {_describe_detections(req)}.")
        ov = p.get("open_vocab") or []
        if ov:
            lines.append(
                "Server open-vocabulary detector (lower reliability): "
                + "; ".join(f"{d.label} ({'ahead' if d.bearing == 'front' else d.bearing}{f', ~{d.distance_m} m' if d.distance_m else ''}, conf {d.confidence})" for d in ov[:10])
                + "."
            )
        if extra_hazards:
            lines.append("Possible hazards to mention first: " + " ".join(h["message"] for h in extra_hazards[:3]))
        people = p.get("people") or []
        if people:
            desc = []
            for x in people[:8]:
                where = "ahead" if x["bearing"] == "front" else x["bearing"]
                desc.append(f"person {where}" + (f" who {', '.join(x['cues'])}" if x["cues"] else ""))
            lines.append("Body-pose cues from one photo (motion cannot be confirmed): " + "; ".join(desc) + ".")
        if "faces" in p:
            fs = p["faces"]
            if fs:
                lines.append(
                    "Enrolled face recognition: "
                    + "; ".join(f"{f['name']} ({f['bearing']}, similarity {f['similarity']})" if f["name"] else f"unrecognised person ({f['bearing']})" for f in fs)
                    + ". Use only these names."
                )
            else:
                lines.append("Enrolled face recognition: no faces clearly visible.")
        else:
            lines.append("Face recognition: off - do not name anyone.")
        ocr = req.ocr_text or p.get("ocr") or ""
        if ocr:
            lines.append(f"OCR text (may contain errors):\n\"\"\"\n{ocr[:6000]}\n\"\"\"")
        if p.get("product"):
            lines.append("Barcode database record (Open Food Facts): " + json.dumps(p["product"], ensure_ascii=False))
        elif req.mode == "product" and req.barcode:
            lines.append(f"Barcode {req.barcode} was not found in the product database.")
        if req.location:
            lines.append(f"Approximate GPS location: {req.location.lat:.5f}, {req.location.lon:.5f}.")
        return "\n".join(lines)

    # ---------------------------------------------------------------- main entry

    async def run(self, req: AssistRequest) -> AsyncIterator[tuple[str, Any]]:
        """Yields ("delta", {"text"}) events, then ("result", AssistResult)."""
        t0 = time.perf_counter()
        request_id = uuid.uuid4().hex
        img = vision.decode_image(req.image_b64) if req.image_b64 else None
        p = await self._perceive(req, img)
        extra_hazards = vision.hazards_from(p.get("open_vocab") or []) if req.mode != "find" else []

        conv = self._conversation(req.conversation_id)
        history = self._history(conv)
        router = get_router()
        engine = router.pick()
        structured: dict[str, Any] | None = None
        usage = LlmUsage()

        user_text = f"Task: {MODE_INSTRUCTIONS[req.mode]}\n\nContext:\n{self._context(req, p, extra_hazards)}"
        if req.query:
            user_text += f"\n\nUser: {req.query}"

        answer = ""
        source = "rules"
        if engine is None:
            answer = rules_answer(req, extra_hazards, p.get("people") or [])
            yield ("delta", {"text": answer})
        else:
            use_image = engine.vision and img is not None
            if not use_image and img is not None:
                user_text += "\n\n(No image is available to you: answer only from the context above, and say what you cannot know.)"
            llm_req = LlmRequest(
                system=SYSTEM_PROMPT,
                user_text=user_text,
                image_jpeg_b64=vision.to_jpeg_b64(img) if use_image else None,
                history=history,
                detailed=req.mode in DETAILED_MODES,
                json_schema=SCHEMAS.get(req.mode),
                max_tokens=8000 if req.mode in ("read", "document") else 2048,
            )
            source = "cloud-vlm" if engine.name == "gemini" else "local-llm"
            chunks: list[str] = []
            try:
                async for piece in engine.stream(llm_req, usage):
                    chunks.append(piece)
                    if req.mode not in STRUCTURED_MODES:
                        yield ("delta", {"text": piece})
            except LlmError as e:
                log.warning("engine %s failed: %s", engine.name, e)
                if chunks and req.mode not in STRUCTURED_MODES:
                    # Part of the answer was already spoken - say honestly that it was cut off.
                    suffix = " ... Sorry, the answer was cut off."
                    answer = "".join(chunks) + suffix
                    yield ("delta", {"text": suffix})
                else:
                    # Nothing usable (a partial JSON object is useless): detection-only answer instead.
                    chunks = []
                    answer = f"{e.spoken} {rules_answer(req, extra_hazards, p.get('people') or [])}"
                    source = "rules"
                    yield ("delta", {"text": answer})
            else:
                answer = "".join(chunks)
            if req.mode in STRUCTURED_MODES and chunks:
                try:
                    structured = json.loads("".join(chunks))
                    answer = structured.get("spoken_summary") or answer
                except json.JSONDecodeError:
                    structured = None
                    answer = "I couldn't read that clearly. Please hold the item steady and try again."
                    source = "rules"

        # Hazard detection that missed the speech deadline still reaches the phone as alerts.
        late_ov = p["_late"].get("open_vocab")
        if late_ov is not None and req.mode != "find":
            try:
                extra_hazards = vision.hazards_from(await asyncio.wait_for(late_ov, timeout=6.0))
            except Exception as e:  # noqa: BLE001 - best effort
                log.info("late open-vocab result dropped: %s", e)

        # Structured post-processing: merge the product DB record and add honest notices.
        if req.mode == "product" and p.get("product"):
            base = dict(p["product"])
            for k, v in (structured or {}).items():
                if v not in (None, [], {}) and k != "nutrition":
                    base[k] = v
            structured = {**base, "spoken_summary": answer}
        if req.mode == "medicine":
            structured = {**(structured or {}), "notices": [*((structured or {}).get("notices") or []), MEDICINE_NOTICE]}
        if req.mode == "currency":
            structured = {**(structured or {}), "notices": [CURRENCY_NOTICE]}
        if req.mode in ("read", "document"):
            structured = {"text": req.ocr_text or p.get("ocr") or None}
        if (p.get("people") is not None) and req.mode == "people":
            structured = {"people": p.get("people"), "faces": p.get("faces")}

        # Persist text only.
        q = req.query or f"[{req.mode}]"
        conv.turns.append(Turn(role="user", text=q, mode=req.mode))
        conv.turns.append(Turn(role="assistant", text=answer, mode=req.mode))
        conv.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        yield (
            "result",
            AssistResult(
                request_id=request_id,
                conversation_id=conv.id,
                answer=answer.strip(),
                source=source,
                model=usage.model,
                hazards=[ServerHazard(**h) for h in extra_hazards],
                structured=structured,
                latency_ms=int((time.perf_counter() - t0) * 1000),
            ),
        )
