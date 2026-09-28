"""Runtime configuration. Everything secret comes from environment variables / backend/.env - never code."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    # --- server ---
    host: str = "0.0.0.0"
    port: int = 8000
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'sixthsense.db').as_posix()}"
    # Required in production; a random per-process secret is generated when empty (tokens then reset on restart).
    jwt_secret: str = ""
    jwt_ttl_days: int = 180
    cors_origins: str = "*"

    # --- cloud reasoning (Google Gemini) ---
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.8-flash"
    # Tried in order when the primary model is overloaded (503) or rate-limited (429).
    gemini_fallback_models: str = "gemini-3.5-flash,gemini-3.5-flash-lite"
    gemini_timeout_s: float = 20.0
    gemini_timeout_fast_s: float = 10.0  # Gemini rejects deadlines under 10 s
    # Spoken answers must be fast: low thinking for scene Q&A, medium for documents/extraction.
    gemini_thinking_fast: str = "low"
    gemini_thinking_detailed: str = "medium"

    # --- local fallback (Ollama, text-only reasoning over on-device detections + OCR) ---
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5:3b"

    # Max seconds server-side perception may delay the answer (late results still become hazard alerts).
    perception_budget_fast_s: float = 1.5
    perception_budget_detailed_s: float = 8.0
    warm_models_on_startup: bool = True

    # --- models / data ---
    models_dir: Path = Path(r"D:\6thSenseAI\models")
    enable_open_vocab: bool = True
    open_vocab_model: str = "yolov8s-worldv2.pt"
    enable_pose: bool = True
    enable_ocr: bool = True
    enable_faces: bool = True
    enable_memory_embeddings: bool = True
    face_match_threshold: float = 0.42  # SFace cosine; OpenCV recommends 0.363 - stricter to avoid false names

    # --- product lookup ---
    open_food_facts_url: str = "https://world.openfoodfacts.org/api/v2/product"
    http_user_agent: str = "6thSenseAI/0.1 (assistive app research project)"

    # --- emergency SMS (optional; when unset the phone's SMS composer is used) ---
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""

    # --- privacy ---
    conversation_ttl_hours: int = 24

    @property
    def gemini_enabled(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def sms_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)


@lru_cache
def get_settings() -> Settings:
    return Settings()
