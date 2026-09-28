"""Reasoning engines behind /v1/assist.

- GeminiProvider : cloud vision-language reasoning (image + grounding context), streamed. Google Gen AI SDK
                   (`google-genai`), key from GEMINI_API_KEY in backend/.env - never sent to the phone.
- OllamaProvider : local, text-only fallback (reasons over on-device detections + OCR, no image).
The router picks the best engine that is actually available; with none, /assist answers from detections
only and says that cloud AI reasoning is unavailable.
"""
from __future__ import annotations

import base64
import json
import logging
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import httpx
from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from ..config import get_settings

log = logging.getLogger(__name__)

BLOCKED = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT"}


class LlmError(Exception):
    """Engine failed; `spoken` is a safe message for the user."""

    def __init__(self, spoken: str, detail: str = ""):
        super().__init__(detail or spoken)
        self.spoken = spoken


@dataclass
class LlmRequest:
    system: str
    user_text: str
    image_jpeg_b64: str | None = None
    history: list[dict[str, str]] = field(default_factory=list)  # [{"role": "user"|"assistant", "content": str}]
    detailed: bool = False
    json_schema: dict[str, Any] | None = None
    max_tokens: int = 2048


@dataclass
class LlmUsage:
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None


class GeminiProvider:
    name = "gemini"
    vision = True

    def __init__(self) -> None:
        s = get_settings()
        self.model = s.gemini_model
        self.fallbacks = [m.strip() for m in s.gemini_fallback_models.split(",") if m.strip()]
        # Fail fast (no hidden SDK retries): on overload we switch model instead of waiting.
        self._client = genai.Client(
            api_key=s.gemini_api_key,
            http_options=types.HttpOptions(timeout=int(s.gemini_timeout_s * 1000), retry_options=types.HttpRetryOptions(attempts=1)),
        )
        self._timeout_fast = s.gemini_timeout_fast_s
        self._timeout_detailed = s.gemini_timeout_s
        self._level_fast = s.gemini_thinking_fast
        self._level_detailed = s.gemini_thinking_detailed

    async def stream(self, req: LlmRequest, usage: LlmUsage) -> AsyncIterator[str]:
        contents: list[types.Content] = [
            types.Content(role="model" if h["role"] == "assistant" else "user", parts=[types.Part.from_text(text=h["content"])])
            for h in req.history
        ]
        parts: list[types.Part] = []
        if req.image_jpeg_b64:
            parts.append(types.Part.from_bytes(data=base64.b64decode(req.image_jpeg_b64), mime_type="image/jpeg"))
        parts.append(types.Part.from_text(text=req.user_text))
        contents.append(types.Content(role="user", parts=parts))

        config = types.GenerateContentConfig(
            system_instruction=req.system,
            max_output_tokens=req.max_tokens,
            # Spoken scene answers must be fast; documents/extraction get more reasoning.
            thinking_config=types.ThinkingConfig(thinking_level=self._level_detailed if req.detailed else self._level_fast),
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            # Per-attempt deadline: short for spoken scene answers, so an overloaded model is skipped quickly.
            http_options=types.HttpOptions(timeout=int((self._timeout_detailed if req.detailed else self._timeout_fast) * 1000), retry_options=types.HttpRetryOptions(attempts=1)),
        )
        if req.json_schema:
            config.response_mime_type = "application/json"
            config.response_json_schema = req.json_schema

        models = [self.model, *self.fallbacks]
        for i, model in enumerate(models):
            emitted = False
            try:
                async for text in self._attempt(model, contents, config, usage):
                    emitted = True
                    yield text
                return
            except LlmError as e:
                cause = e.__cause__
                overloaded = (isinstance(cause, genai_errors.APIError) and cause.code in (429, 500, 503, 504)) or isinstance(cause, httpx.TimeoutException)
                if emitted or not overloaded or i == len(models) - 1:
                    raise
                log.warning("gemini model %s unavailable (%s); trying %s", model, getattr(cause, "code", type(cause).__name__), models[i + 1])

    async def _attempt(self, model: str, contents: list[types.Content], config: types.GenerateContentConfig, usage: LlmUsage) -> AsyncIterator[str]:
        finish: str | None = None
        try:
            stream = await self._client.aio.models.generate_content_stream(model=model, contents=contents, config=config)
            async for chunk in stream:
                if chunk.prompt_feedback and chunk.prompt_feedback.block_reason:
                    raise LlmError("I can't help with that request.", f"blocked: {chunk.prompt_feedback.block_reason}")
                if chunk.candidates and chunk.candidates[0].finish_reason:
                    finish = str(chunk.candidates[0].finish_reason.value if hasattr(chunk.candidates[0].finish_reason, "value") else chunk.candidates[0].finish_reason)
                if chunk.usage_metadata:
                    usage.input_tokens = chunk.usage_metadata.prompt_token_count
                    usage.output_tokens = chunk.usage_metadata.candidates_token_count
                    usage.cache_read_tokens = chunk.usage_metadata.cached_content_token_count
                if chunk.model_version:
                    usage.model = chunk.model_version
                text = chunk.text
                if text:
                    yield text
        except genai_errors.ClientError as e:
            if e.code in (401, 403):
                raise LlmError("The cloud AI key on the server is invalid or not allowed.", str(e)) from e
            if e.code == 429:
                raise LlmError("The cloud AI is busy or out of quota right now. Please try again in a moment.", str(e)) from e
            raise LlmError("The cloud AI could not process that request.", str(e)) from e
        except genai_errors.ServerError as e:
            raise LlmError("The cloud AI had a problem answering.", str(e)) from e
        except genai_errors.APIError as e:
            raise LlmError("The cloud AI had a problem answering.", str(e)) from e
        except httpx.TimeoutException as e:
            raise LlmError("The cloud AI is taking too long to answer.", str(e)) from e
        except (httpx.HTTPError, OSError) as e:
            raise LlmError("The server cannot reach the cloud AI.", str(e)) from e

        usage.model = usage.model or model
        if finish in BLOCKED:
            raise LlmError("I can't help with that request.", f"finish_reason={finish}")


class OllamaProvider:
    name = "ollama"
    vision = False

    def __init__(self) -> None:
        s = get_settings()
        self.url = s.ollama_url.rstrip("/")
        self.model = s.ollama_model

    async def available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=2.0) as c:
                r = await c.get(f"{self.url}/api/tags")
                return r.status_code == 200 and any(m.get("name", "").startswith(self.model.split(":")[0]) for m in r.json().get("models", []))
        except httpx.HTTPError:
            return False

    async def stream(self, req: LlmRequest, usage: LlmUsage) -> AsyncIterator[str]:
        messages = [{"role": "system", "content": req.system}, *req.history, {"role": "user", "content": req.user_text}]
        body: dict[str, Any] = {"model": self.model, "messages": messages, "stream": True, "options": {"temperature": 0.2, "num_predict": req.max_tokens}}
        if req.json_schema:
            body["format"] = req.json_schema
        usage.model = self.model
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=3.0)) as c:
                async with c.stream("POST", f"{self.url}/api/chat", json=body) as r:
                    if r.status_code != 200:
                        raise LlmError("The local AI model is not ready.", f"ollama {r.status_code}")
                    async for line in r.aiter_lines():
                        if not line:
                            continue
                        chunk = json.loads(line)
                        piece = chunk.get("message", {}).get("content", "")
                        if piece:
                            yield piece
                        if chunk.get("done"):
                            usage.input_tokens = chunk.get("prompt_eval_count")
                            usage.output_tokens = chunk.get("eval_count")
        except httpx.HTTPError as e:
            raise LlmError("The local AI model is not reachable.", str(e)) from e


class LlmRouter:
    def __init__(self) -> None:
        s = get_settings()
        self.cloud = GeminiProvider() if s.gemini_enabled else None
        self.ollama = OllamaProvider()
        self._ollama_ok: bool | None = None

    async def refresh(self) -> None:
        self._ollama_ok = await self.ollama.available()

    @property
    def ollama_ok(self) -> bool:
        return bool(self._ollama_ok)

    def pick(self) -> GeminiProvider | OllamaProvider | None:
        if self.cloud:
            return self.cloud
        if self._ollama_ok:
            return self.ollama
        return None


_router: LlmRouter | None = None


def get_router() -> LlmRouter:
    global _router
    if _router is None:
        _router = LlmRouter()
    return _router
