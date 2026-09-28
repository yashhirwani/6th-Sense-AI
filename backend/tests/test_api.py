import base64
import io
import json

import numpy as np
from PIL import Image

from app.services.prompts import SCHEMAS
from app.services.vision import behaviour_cues, bearing_for, hazards_from, OvDetection


def _jpeg_b64(w=64, h=64, color=(200, 180, 150)) -> str:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color).save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


def test_health_and_capabilities(client):
    assert client.get("/v1/health").json()["status"] == "ok"
    caps = client.get("/v1/capabilities").json()
    assert caps["llm"]["available"] is False  # no key, no Ollama in tests
    assert caps["sms_dispatch"] is False
    assert caps["stt"] is False


def test_auth_required(client):
    assert client.post("/v1/assist", json={"mode": "describe"}).status_code == 401
    assert client.get("/v1/memories", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_same_device_same_user(client):
    a = client.post("/v1/auth/device", json={"device_id": "device-abc-123"}).json()
    b = client.post("/v1/auth/device", json={"device_id": "device-abc-123"}).json()
    assert a["user_id"] == b["user_id"]


def test_assist_rules_mode_is_grounded_in_detections(client, auth):
    h = auth()
    det = {"label": "chair", "confidence": 0.9, "box": {"x": 0.4, "y": 0.4, "w": 0.2, "h": 0.3}, "bearing": "front", "clock": 12, "distance_m": 1.2, "approaching": False}
    r = client.post("/v1/assist", headers=h, json={"mode": "describe", "image_b64": _jpeg_b64(), "detections": [det, {**det, "label": "person", "bearing": "right", "distance_m": 2.0}]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "rules"
    assert "1 chair" in body["answer"] and "1 person" in body["answer"]
    assert "Cloud AI reasoning is unavailable" in body["answer"]  # honest about missing reasoning engine
    assert body["conversation_id"]


def test_assist_sse_stream(client, auth):
    h = {**auth(), "Accept": "text/event-stream"}
    with client.stream("POST", "/v1/assist", headers=h, json={"mode": "ask", "query": "What is here?"}) as r:
        assert r.status_code == 200
        raw = "".join(r.iter_text())
    events = [blk for blk in raw.split("\n\n") if blk.strip()]
    assert events[0].startswith("event: delta")
    last = events[-1]
    assert last.startswith("event: result")
    result = json.loads(last.split("data: ", 1)[1])
    assert result["source"] == "rules"


def test_read_mode_returns_ocr_text_without_llm(client, auth):
    r = client.post("/v1/assist", headers=auth(), json={"mode": "read", "ocr_text": "EXIT\nPlatform 2"})
    assert r.json()["answer"] == "EXIT\nPlatform 2"


def test_memories_crud_and_search(client, auth):
    h = auth("device-mem-0001")
    client.post("/v1/memories", headers=h, json={"id": "mem00001", "object": "wallet", "context": "on the desk by the window"})
    client.post("/v1/memories", headers=h, json={"id": "mem00002", "object": "keys", "context": "kitchen counter"})
    found = client.get("/v1/memories/search", params={"q": "wallet"}, headers=h).json()
    assert found[0]["id"] == "mem00001"
    # another user cannot see them
    assert client.get("/v1/memories", headers=auth("device-other-01")).json() == []
    assert client.delete("/v1/memories/mem00001", headers=h).status_code == 204
    assert [m["id"] for m in client.get("/v1/memories", headers=h).json()] == ["mem00002"]


def test_indoor_route_demo_building(client, auth):
    h = auth()
    node = client.get("/v1/places/campus-demo/nodes/c302", headers=h).json()
    assert node["node"]["name"] == "Classroom 302"
    r = client.get("/v1/places/campus-demo/route", params={"from": "c302", "to": "the exit"}, headers=h).json()
    assert r["to_node"] == "exit3"
    assert r["total_m"] == 35
    assert r["steps"][0]["instruction"].startswith("Walk about 8 metres to East Corridor")
    assert r["steps"][1]["instruction"].startswith("Turn left and walk about 12 metres")  # 90 -> 0 degrees
    assert client.get("/v1/places/campus-demo/route", params={"from": "c302", "to": "swimming pool"}, headers=h).status_code == 404


def test_apriltag_localize_no_tag(client, auth):
    r = client.post("/v1/nav/localize", headers=auth(), json={"image_b64": _jpeg_b64(200, 200)}).json()
    assert r == {"place": None, "node": None, "tags": []}


def test_emergency_dispatch_requires_sms_config(client, auth):
    r = client.post("/v1/emergency/dispatch", headers=auth(), json={"trigger": "fall", "message": "help"})
    assert r.status_code == 503


def test_faces_require_consent(client, auth):
    r = client.post("/v1/faces", headers=auth(), json={"name": "A", "images_b64": [_jpeg_b64()], "consent": False})
    assert r.status_code == 400


def test_delete_my_data(client, auth):
    h = auth("device-wipe-0001")
    client.post("/v1/memories", headers=h, json={"id": "memwipe1", "object": "bag"})
    assert client.delete("/v1/me/data", headers=h).status_code == 204
    assert client.get("/v1/memories", headers=h).status_code == 401  # user gone


def test_latency_metrics(client, auth):
    h = auth()
    for ms in (900, 1200, 3000):
        client.post("/v1/telemetry/latency", headers=h, json={"kind": "describe", "total_ms": ms, "first_audio_ms": ms // 2, "source": "cloud-vlm"})
    s = client.get("/v1/metrics/latency", headers=h).json()["describe/cloud-vlm"]
    assert s["total"]["median"] == 1200


# ---------------------------------------------------------------- pure logic


def test_structured_schemas_are_strict():
    for name, schema in SCHEMAS.items():
        assert schema["additionalProperties"] is False, name
        assert set(schema["required"]) == set(schema["properties"]), name


def test_bearing():
    assert bearing_for(0.05)[0] == "left"
    assert bearing_for(0.5) == ("front", 12)
    assert bearing_for(0.95)[0] == "right"


def test_open_vocab_hazard_messages():
    d = OvDetection("open manhole", 0.4, (0.4, 0.6, 0.2, 0.3), "front", 12, None)
    [h] = hazards_from([d])
    assert h["severity"] == "critical"
    assert h["message"].startswith("Careful. Possibly an open manhole")
    # a caution-level item off to the side is not announced
    assert hazards_from([OvDetection("traffic cone", 0.5, (0.0, 0.2, 0.1, 0.1), "left", 11, None)]) == []


def _pose(**pts):
    kp = np.zeros((17, 2), dtype=np.float32)
    for i, (x, y) in pts.items():
        kp[int(i[1:])] = (x, y)
    conf = np.array([1.0 if f"k{i}" in pts else 0.0 for i in range(17)])
    return kp, conf


def test_behaviour_hand_raised():
    kp, conf = _pose(k5=(40, 60), k6=(60, 60), k7=(30, 40), k9=(30, 10), k11=(42, 120), k12=(58, 120))
    assert any("hand raised" in c for c in behaviour_cues(kp, conf, (40, 160)))


def test_behaviour_lying_down():
    kp, conf = _pose(k5=(20, 50), k6=(20, 60), k11=(120, 52), k12=(120, 62))
    assert any("lying on the ground" in c for c in behaviour_cues(kp, conf, (160, 60)))
