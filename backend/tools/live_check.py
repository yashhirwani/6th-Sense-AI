"""End-to-end check against a RUNNING backend (real engines, real network):
    .venv\\Scripts\\python.exe tools\\live_check.py [http://127.0.0.1:8000] [image.jpg]
Exercises auth, capabilities, streamed describe (SSE), a follow-up question, and structured extraction.
"""
import base64
import json
import sys
import time
from pathlib import Path

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
IMG = Path(sys.argv[2] if len(sys.argv) > 2 else r"D:\6thSenseAI\models\yolo\bus.jpg")


def main() -> None:
    c = httpx.Client(base_url=BASE, timeout=120)
    caps = c.get("/v1/capabilities").json()
    print("capabilities:", json.dumps(caps["llm"]), "ocr:", caps["ocr"], "open-vocab:", caps["open_vocab_detector"])
    tok = c.post("/v1/auth/device", json={"device_id": "live-check-device-01", "platform": "test"}).json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    img = base64.b64encode(IMG.read_bytes()).decode()

    # Streamed scene description, as the phone does it.
    t0 = time.perf_counter()
    first = None
    result = None
    with c.stream("POST", "/v1/assist", headers={**h, "Accept": "text/event-stream"}, json={"mode": "describe", "image_b64": img, "detections": []}) as r:
        buf = ""
        for chunk in r.iter_text():
            buf += chunk
            while "\n\n" in buf:
                block, buf = buf.split("\n\n", 1)
                ev = block.split("\n", 1)[0].removeprefix("event: ")
                data = json.loads(block.split("data: ", 1)[1])
                if ev == "delta" and first is None:
                    first = time.perf_counter() - t0
                if ev == "result":
                    result = data
                if ev == "error":
                    print("ERROR EVENT", data)
    print(f"\n[describe] first text {first:.2f}s, total {time.perf_counter() - t0:.2f}s, source={result['source']} model={result['model']}")
    print("  answer:", result["answer"])
    print("  hazards:", [hz["message"] for hz in result["hazards"]])

    # Follow-up question in the same conversation.
    r = c.post("/v1/assist", headers=h, json={"mode": "ask", "query": "What colour is the bus, and how many people are next to it?", "image_b64": img, "conversation_id": result["conversation_id"]}).json()
    print(f"\n[ask] {r['latency_ms']} ms, source={r['source']}\n  answer:", r["answer"])

    # Structured extraction path (JSON schema).
    r = c.post("/v1/assist", headers=h, json={"mode": "currency", "image_b64": img}).json()
    print(f"\n[currency on a non-money photo] {r['latency_ms']} ms\n  answer:", r["answer"], "\n  structured:", r["structured"])


if __name__ == "__main__":
    main()
