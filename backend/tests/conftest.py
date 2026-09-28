import os
import tempfile
from pathlib import Path

# Isolated, offline configuration BEFORE the app is imported.
_tmp = Path(tempfile.mkdtemp(prefix="sixthsense-test-"))
os.environ.update(
    {
        "DATABASE_URL": f"sqlite:///{(_tmp / 'test.db').as_posix()}",
        "JWT_SECRET": "test-secret-test-secret-test-secret-123",
        "GEMINI_API_KEY": "",
        "OLLAMA_URL": "http://127.0.0.1:9",  # nothing listens here -> no local LLM
        "ENABLE_OPEN_VOCAB": "false",
        "ENABLE_POSE": "false",
        "ENABLE_FACES": "false",
        "ENABLE_MEMORY_EMBEDDINGS": "false",
        "ENABLE_OCR": "false",
        "TWILIO_ACCOUNT_SID": "",
        "WARM_MODELS_ON_STARTUP": "false",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth(client):
    def make(device: str = "device-test-0001") -> dict[str, str]:
        r = client.post("/v1/auth/device", json={"device_id": device, "platform": "android"})
        assert r.status_code == 200
        return {"Authorization": f"Bearer {r.json()['token']}"}

    return make
