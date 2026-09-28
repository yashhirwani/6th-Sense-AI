"""API contract. Mirrors mobile/src/services/api/types.ts (keep both in sync)."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

AssistMode = Literal["describe", "ask", "find", "read", "document", "product", "currency", "medicine", "people"]
Bearing = Literal["left", "front", "right"]


class Box(BaseModel):
    x: float
    y: float
    w: float
    h: float


class WireDetection(BaseModel):
    label: str
    confidence: float
    box: Box
    bearing: Bearing
    clock: int
    distance_m: float | None = None
    approaching: bool = False


class WireLocation(BaseModel):
    lat: float
    lon: float
    accuracy_m: float | None = None
    place: str | None = None


class AssistRequest(BaseModel):
    mode: AssistMode
    query: str | None = Field(default=None, max_length=2000)
    language: Literal["en", "hi"] = "en"
    image_b64: str | None = Field(default=None, max_length=8_000_000)
    detections: list[WireDetection] = Field(default_factory=list, max_length=100)
    ocr_text: str | None = Field(default=None, max_length=50_000)
    location: WireLocation | None = None
    conversation_id: str | None = None
    barcode: str | None = Field(default=None, max_length=64)
    allow_faces: bool = False


class ServerHazard(BaseModel):
    label: str
    severity: Literal["caution", "warning", "critical"]
    bearing: Bearing
    distance_m: float | None = None
    message: str
    confidence: float


class AssistResult(BaseModel):
    request_id: str
    conversation_id: str
    answer: str
    source: Literal["cloud-vlm", "local-llm", "rules"]
    model: str | None
    hazards: list[ServerHazard] = Field(default_factory=list)
    structured: dict[str, Any] | None = None
    latency_ms: int


class DeviceAuthRequest(BaseModel):
    device_id: str = Field(min_length=8, max_length=64)
    platform: str | None = Field(default=None, max_length=16)


class TokenResponse(BaseModel):
    token: str
    user_id: str


class LlmCaps(BaseModel):
    provider: str | None
    model: str | None
    available: bool
    vision: bool


class LocalLlmCaps(BaseModel):
    available: bool
    model: str | None


class Capabilities(BaseModel):
    version: str
    llm: LlmCaps
    local_llm: LocalLlmCaps
    open_vocab_detector: bool
    ocr: bool
    stt: bool
    faces: bool
    depth: bool
    product_lookup: bool
    sms_dispatch: bool


class MemoryIn(BaseModel):
    id: str = Field(min_length=4, max_length=32)
    object: str = Field(max_length=80)
    context: str | None = Field(default=None, max_length=1000)
    place: str | None = Field(default=None, max_length=200)
    lat: float | None = None
    lon: float | None = None
    confidence: float = 1.0
    source: Literal["auto", "user"] = "user"
    created_at: datetime | None = None


class MemoryOut(BaseModel):
    id: str
    object: str
    context: str | None
    place: str | None
    lat: float | None
    lon: float | None
    confidence: float
    created_at: datetime


class ContactIn(BaseModel):
    id: str
    name: str = Field(max_length=100)
    phone: str = Field(max_length=32)
    relation: str | None = Field(default=None, max_length=50)
    is_primary: bool = False


class DispatchRequest(BaseModel):
    trigger: Literal["fall", "voice", "manual"]
    message: str = Field(max_length=600)
    lat: float | None = None
    lon: float | None = None
    contacts: list[ContactIn] = Field(default_factory=list, max_length=10)


class DispatchResult(BaseModel):
    sent: int
    failed: int


class EventIn(BaseModel):
    trigger: str
    status: str
    detail: str | None = None
    lat: float | None = None
    lon: float | None = None


class FaceEnroll(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    images_b64: list[str] = Field(min_length=1, max_length=8)
    consent: bool


class KnownPersonOut(BaseModel):
    id: str
    name: str
    created_at: datetime
    samples: int


class PlaceOut(BaseModel):
    id: str
    name: str
    building: str | None
    floor: str | None


class NodeOut(BaseModel):
    id: str
    name: str


class NodeLookup(BaseModel):
    place: PlaceOut
    node: NodeOut


class LocalizeRequest(BaseModel):
    image_b64: str = Field(max_length=8_000_000)


class LocalizeResult(BaseModel):
    place: PlaceOut | None
    node: NodeOut | None
    tags: list[int]


class RouteStep(BaseModel):
    instruction: str
    distance_m: float
    heading_deg: float | None
    node_id: str
    landmark: str | None


class RouteResult(BaseModel):
    from_node: str
    to_node: str
    total_m: float
    steps: list[RouteStep]


class LatencyIn(BaseModel):
    kind: str = Field(max_length=16)
    total_ms: int | None = None
    first_audio_ms: int | None = None
    server_ms: int | None = None
    source: str | None = Field(default=None, max_length=16)
