"""Known-person recognition (social assistant), opt-in only.

Detector: YuNet; recogniser: SFace (ArcFace-style 128-d embeddings) - both run in OpenCV (no compiled
extras needed on Windows). Only embeddings are stored. A name is returned only above a strict cosine
threshold; everything else is reported as an unknown person.
"""
from __future__ import annotations

import logging
import threading
import urllib.request
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from ..config import get_settings

log = logging.getLogger(__name__)

MODELS = {
    "face_detection_yunet_2023mar.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
    "face_recognition_sface_2021dec.onnx": "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx",
}

_lock = threading.Lock()


def _model_path(name: str) -> Path:
    d = get_settings().models_dir / "faces"
    d.mkdir(parents=True, exist_ok=True)
    p = d / name
    if not p.exists():
        log.info("downloading %s", name)
        urllib.request.urlretrieve(MODELS[name], p)
    return p


@lru_cache(maxsize=1)
def _models():
    det = cv2.FaceDetectorYN.create(str(_model_path("face_detection_yunet_2023mar.onnx")), "", (320, 320), 0.8, 0.3, 50)
    rec = cv2.FaceRecognizerSF.create(str(_model_path("face_recognition_sface_2021dec.onnx")), "")
    return det, rec


def available() -> bool:
    if not get_settings().enable_faces:
        return False
    try:
        _models()
        return True
    except Exception as e:
        log.warning("face models unavailable: %s", e)
        return False


def embed_faces(img: Image.Image) -> list[tuple[np.ndarray, tuple[float, float, float, float]]]:
    """Returns (embedding[128], normalised box) per detected face."""
    det, rec = _models()
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    h, w = bgr.shape[:2]
    with _lock:
        det.setInputSize((w, h))
        _, faces = det.detect(bgr)
        if faces is None:
            return []
        out = []
        for f in faces:
            aligned = rec.alignCrop(bgr, f)
            emb = rec.feature(aligned).flatten().astype(np.float32)
            emb /= np.linalg.norm(emb) + 1e-9
            x, y, fw, fh = (float(v) for v in f[:4])
            out.append((emb, (x / w, y / h, fw / w, fh / h)))
        return out


def best_match(emb: np.ndarray, gallery: list[tuple[str, np.ndarray]]) -> tuple[str | None, float]:
    """gallery: [(name, embeddings[n,128])]. Cosine similarity against every sample; best name wins."""
    best_name, best = None, -1.0
    for name, embs in gallery:
        sim = float(np.max(embs @ emb))
        if sim > best:
            best_name, best = name, sim
    if best >= get_settings().face_match_threshold:
        return best_name, best
    return None, best
