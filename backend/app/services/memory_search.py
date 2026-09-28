"""Semantic search over memories ("purse" finds "handbag"), with a fuzzy-text fallback."""
from __future__ import annotations

import logging
from functools import lru_cache

import numpy as np
from rapidfuzz import fuzz

from ..config import get_settings

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


def embed(text: str) -> bytes | None:
    if not get_settings().enable_memory_embeddings:
        return None
    try:
        v = _model().encode([text], normalize_embeddings=True)[0].astype(np.float32)
        return v.tobytes()
    except Exception as e:
        log.warning("embedding unavailable: %s", e)
        return None


def rank(query: str, items: list[tuple[str, str, bytes | None]]) -> list[tuple[str, float]]:
    """items: (id, text, embedding). Returns [(id, score)] best first."""
    qv = None
    if get_settings().enable_memory_embeddings:
        emb = embed(query)
        qv = np.frombuffer(emb, dtype=np.float32) if emb else None
    scored = []
    for mid, text, e in items:
        s = fuzz.WRatio(query.lower(), text.lower()) / 100.0
        if qv is not None and e:
            s = max(s, float(np.dot(qv, np.frombuffer(e, dtype=np.float32))))
        scored.append((mid, s))
    return sorted(scored, key=lambda x: -x[1])
