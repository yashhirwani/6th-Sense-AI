"""Mid-stream cloud failures must never produce a misleading or half-JSON spoken answer."""
from app.services import llm, orchestrator
from app.services.llm import LlmError


class FlakyEngine:
    name = "gemini"
    vision = True

    def __init__(self, pieces, fail=True):
        self.pieces = pieces
        self.fail = fail

    async def stream(self, req, usage):
        for p in self.pieces:
            yield p
        if self.fail:
            raise LlmError("The cloud AI is taking too long to answer.", "504")


def _use(monkeypatch, engine):
    router = llm.get_router()
    monkeypatch.setattr(router, "pick", lambda: engine)
    monkeypatch.setattr(orchestrator, "get_router", lambda: router)


def test_text_answer_cut_off_is_flagged(client, auth, monkeypatch):
    _use(monkeypatch, FlakyEngine(["Watch out for low bollards ahead, and a blue"]))
    r = client.post("/v1/assist", headers=auth(), json={"mode": "describe"}).json()
    assert r["answer"].endswith("Sorry, the answer was cut off.")
    assert r["source"] == "cloud-vlm"


def test_partial_json_never_spoken(client, auth, monkeypatch):
    _use(monkeypatch, FlakyEngine(['{"spoken_summary": "A 500']))
    r = client.post("/v1/assist", headers=auth(), json={"mode": "currency"}).json()
    assert "{" not in r["answer"]
    assert r["answer"].startswith("The cloud AI is taking too long to answer.")
    assert r["source"] == "rules"


def test_invalid_json_without_error(client, auth, monkeypatch):
    _use(monkeypatch, FlakyEngine(['{"spoken_summary": "x"'], fail=False))
    r = client.post("/v1/assist", headers=auth(), json={"mode": "medicine"}).json()
    assert r["answer"].startswith("I couldn't read that clearly")


def test_structured_success(client, auth, monkeypatch):
    payload = '{"spoken_summary": "A 500 rupee note, front side.", "currency": "INR", "denomination": "500", "orientation": "front", "condition": "good", "confidence": 0.93}'
    _use(monkeypatch, FlakyEngine([payload[:30], payload[30:]], fail=False))
    r = client.post("/v1/assist", headers=auth(), json={"mode": "currency"}).json()
    assert r["answer"] == "A 500 rupee note, front side."
    assert r["structured"]["denomination"] == "500"
    assert "genuine" in r["structured"]["notices"][0]
