"""Server-side perception that complements the phone:

- Open-vocabulary hazard detection (YOLO-World): stairs, wet-floor signs, construction, manholes...
  classes the phone's COCO model cannot see. Also used for "find <anything>".
- Behaviour cues from pose (YOLO11n-pose): hand raised / waving, pointing, lying on the ground.
- OCR (RapidOCR = PaddleOCR models on ONNX Runtime).

All models load lazily on first use, and every function degrades to "not available" instead of failing
the request. Outputs are cues for the language model, not ground truth - thresholds are conservative.
"""
from __future__ import annotations

import base64
import io
import logging
import math
import threading
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import numpy as np
from PIL import Image, ImageOps

from ..config import get_settings

log = logging.getLogger(__name__)

# Portrait phone camera, see mobile/src/services/perception/geometry.ts.
HFOV_DEG = 54.0


def decode_image(b64: str) -> Image.Image:
    img = Image.open(io.BytesIO(base64.b64decode(b64, validate=False)))
    img = ImageOps.exif_transpose(img).convert("RGB")
    return img


def to_jpeg_b64(img: Image.Image, max_side: int = 1280, quality: int = 80) -> str:
    im = img.copy()
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def bearing_for(cx_norm: float) -> tuple[str, int]:
    angle = math.degrees(math.atan((cx_norm - 0.5) / (0.5 / math.tan(math.radians(HFOV_DEG / 2)))))
    bearing = "left" if angle < -HFOV_DEG / 6 else "right" if angle > HFOV_DEG / 6 else "front"
    clock = 12 + round(angle / 30)
    return bearing, (clock - 12 if clock > 12 else clock)


# ---------------------------------------------------------------- open-vocabulary hazards

# label -> (severity, typical height m or None, spoken name)
HAZARD_VOCAB: dict[str, tuple[str, float | None, str]] = {
    "staircase": ("warning", None, "stairs"),
    "stairs": ("warning", None, "stairs"),
    "escalator": ("warning", None, "an escalator"),
    "wet floor sign": ("warning", 0.6, "a wet floor sign"),
    "puddle": ("caution", None, "a puddle"),
    "open manhole": ("critical", None, "an open manhole"),
    "pothole": ("warning", None, "a pothole"),
    "construction barrier": ("warning", 1.0, "a construction barrier"),
    "traffic cone": ("caution", 0.7, "a traffic cone"),
    "scaffolding": ("warning", None, "scaffolding"),
    "ladder": ("caution", None, "a ladder"),
    "glass door": ("caution", 2.1, "a glass door"),
    "pole": ("caution", None, "a pole"),
    "low hanging sign": ("warning", None, "a low hanging sign"),
    "curb": ("caution", None, "a curb"),
    "zebra crossing": ("caution", None, "a zebra crossing"),
}
LANDMARK_VOCAB = ["door", "exit sign", "elevator", "chair", "table", "person"]

_ov_lock = threading.Lock()


@lru_cache(maxsize=1)
def _open_vocab_model():
    from ultralytics import YOLOWorld

    s = get_settings()
    path = s.models_dir / "yolo" / s.open_vocab_model
    path.parent.mkdir(parents=True, exist_ok=True)
    return YOLOWorld(str(path) if path.exists() else s.open_vocab_model)


def open_vocab_available() -> bool:
    return get_settings().enable_open_vocab


@dataclass
class OvDetection:
    label: str
    confidence: float
    box: tuple[float, float, float, float]  # x, y, w, h normalised
    bearing: str
    clock: int
    distance_m: float | None


def detect_open_vocab(img: Image.Image, classes: list[str], conf: float = 0.25) -> list[OvDetection]:
    """Runs YOLO-World with the given text classes. Thread-safe (set_classes mutates the model)."""
    if not open_vocab_available():
        return []
    try:
        model = _open_vocab_model()
    except Exception as e:  # model download/load failure must not break /assist
        log.warning("open-vocab detector unavailable: %s", e)
        return []
    with _ov_lock:
        model.set_classes(classes)
        res = model.predict(img, conf=conf, imgsz=640, verbose=False)[0]
    w, h = img.size
    out: list[OvDetection] = []
    for b in res.boxes:
        x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
        label = classes[int(b.cls)]
        nx, ny, nw, nh = x1 / w, y1 / h, (x2 - x1) / w, (y2 - y1) / h
        bearing, clock = bearing_for(nx + nw / 2)
        height = HAZARD_VOCAB.get(label, (None, None, None))[1]
        dist = None
        if height and 0.02 < nh < 0.98:
            focal = 0.5 / math.tan(math.radians(HFOV_DEG / 2)) * (w / h)  # focal in units of image height
            dist = round(height * focal / nh, 1)
        out.append(OvDetection(label, round(float(b.conf), 2), (nx, ny, nw, nh), bearing, clock, dist))
    return out


def hazards_from(dets: list[OvDetection]) -> list[dict[str, Any]]:
    out = []
    for d in dets:
        if d.label not in HAZARD_VOCAB:
            continue
        severity, _, spoken = HAZARD_VOCAB[d.label]
        # Something occupying the lower centre of the frame is in the walking path.
        in_path = d.bearing == "front" and d.box[1] + d.box[3] > 0.6
        if not in_path and severity == "caution":
            continue
        where = "ahead" if d.bearing == "front" else f"on your {d.bearing}"
        dist = f"about {d.distance_m:g} metres " if d.distance_m else ""
        lead = "Careful. " if severity != "caution" else ""
        out.append(
            {
                "label": d.label,
                "severity": severity,
                "bearing": d.bearing,
                "distance_m": d.distance_m,
                "message": f"{lead}Possibly {spoken} {dist}{where}.".replace("  ", " "),
                "confidence": d.confidence,
            }
        )
    return out


# ---------------------------------------------------------------- pose / behaviour cues

@lru_cache(maxsize=1)
def _pose_model():
    from ultralytics import YOLO

    s = get_settings()
    path = s.models_dir / "yolo" / "yolo11n-pose.pt"
    path.parent.mkdir(parents=True, exist_ok=True)
    return YOLO(str(path) if path.exists() else "yolo11n-pose.pt")


# COCO keypoint indices
NOSE, L_EYE, R_EYE, L_SH, R_SH, L_EL, R_EL, L_WR, R_WR, L_HIP, R_HIP = 0, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12


def _angle(a: np.ndarray, b: np.ndarray, c: np.ndarray) -> float:
    ba, bc = a - b, c - b
    cos = float(np.dot(ba, bc) / (np.linalg.norm(ba) * np.linalg.norm(bc) + 1e-6))
    return math.degrees(math.acos(max(-1.0, min(1.0, cos))))


def behaviour_cues(kp: np.ndarray, conf: np.ndarray, box_wh: tuple[float, float]) -> list[str]:
    """Single-frame heuristics on 17 COCO keypoints (pixels). Returns plain-language cues."""
    ok = conf > 0.5
    cues: list[str] = []
    bw, bh = box_wh
    # Lying on the ground: wide box and shoulders/hips spread horizontally rather than vertically.
    if bw > 1.3 * bh and ok[[L_SH, R_SH, L_HIP, R_HIP]].all():
        torso = (kp[L_HIP] + kp[R_HIP]) / 2 - (kp[L_SH] + kp[R_SH]) / 2
        if abs(torso[0]) > abs(torso[1]):
            cues.append("appears to be lying on the ground (possible fall)")
    for side, sh, el, wr in (("left", L_SH, L_EL, L_WR), ("right", R_SH, R_EL, R_WR)):
        if not ok[[sh, el, wr]].all():
            continue
        # Hand raised above the shoulder -> raising a hand / possibly waving (motion can't be confirmed from one photo).
        if kp[wr][1] < kp[sh][1] - 0.15 * bh:
            cues.append("has a hand raised, possibly waving or asking for attention")
            break
        # Arm extended roughly horizontally -> pointing.
        if _angle(kp[sh], kp[el], kp[wr]) > 150 and abs(kp[wr][1] - kp[sh][1]) < 0.15 * bh and abs(kp[wr][0] - kp[sh][0]) > 0.3 * bh:
            direction = "their right" if kp[wr][0] < kp[sh][0] else "their left"  # image left = subject's right
            cues.append(f"is pointing towards {direction}")
            break
    if ok[[NOSE, L_EYE, R_EYE]].all():
        cues.append("is facing the camera")
    return cues


def people_cues(img: Image.Image) -> list[dict[str, Any]]:
    if not get_settings().enable_pose:
        return []
    try:
        res = _pose_model().predict(img, conf=0.4, imgsz=640, verbose=False)[0]
    except Exception as e:
        log.warning("pose model unavailable: %s", e)
        return []
    if res.keypoints is None:
        return []
    w, h = img.size
    people = []
    for i, b in enumerate(res.boxes):
        x1, y1, x2, y2 = (float(v) for v in b.xyxy[0].tolist())
        kp = res.keypoints.xy[i].cpu().numpy()
        kc = res.keypoints.conf[i].cpu().numpy() if res.keypoints.conf is not None else np.ones(len(kp))
        bearing, clock = bearing_for(((x1 + x2) / 2) / w)
        people.append(
            {
                "bearing": bearing,
                "clock": clock,
                "box": ((x1 / w), (y1 / h), (x2 - x1) / w, (y2 - y1) / h),
                "cues": behaviour_cues(kp, kc, (x2 - x1, y2 - y1)),
            }
        )
    return people


# ---------------------------------------------------------------- OCR

@lru_cache(maxsize=1)
def _ocr_engine():
    from rapidocr_onnxruntime import RapidOCR

    return RapidOCR()


def ocr_available() -> bool:
    return get_settings().enable_ocr


def run_ocr(img: Image.Image) -> str:
    """Line-ordered text (top-to-bottom, left-to-right)."""
    if not ocr_available():
        return ""
    try:
        result, _ = _ocr_engine()(np.array(img))
    except Exception as e:
        log.warning("OCR failed: %s", e)
        return ""
    if not result:
        return ""
    lines = sorted(((min(p[1] for p in box), min(p[0] for p in box), text, score) for box, text, score in result), key=lambda r: (round(r[0] / 20), r[1]))
    return "\n".join(t for _, _, t, s in lines if float(s) >= 0.5)
