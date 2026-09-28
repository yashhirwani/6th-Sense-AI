"""Loads every server-side model once and runs it on a real image, printing timings.
Usage (from backend/):  .venv\\Scripts\\python.exe tools\\smoke_models.py [image.jpg]
"""
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import faces, vision  # noqa: E402
from app.services.memory_search import rank  # noqa: E402


def timed(label, fn, *a):
    t = time.perf_counter()
    try:
        out = fn(*a)
        print(f"[ok]   {label:<28} {1000 * (time.perf_counter() - t):7.0f} ms  -> {out}")
        return out
    except Exception as e:  # report and continue
        print(f"[FAIL] {label:<28} {type(e).__name__}: {e}")
        return None


def main() -> None:
    img_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(r"D:\6thSenseAI\models\yolo\bus.jpg")
    img = Image.open(img_path).convert("RGB")
    print(f"image {img_path} {img.size}")

    for _ in range(2):  # second pass shows warm latency
        dets = timed("open-vocab (YOLO-World)", lambda: [(d.label, d.confidence, d.bearing) for d in vision.detect_open_vocab(img, ["bus", "person", "stairs", "traffic cone", "door"], 0.25)])
        timed("pose / behaviour cues", lambda: [p["cues"] for p in vision.people_cues(img)])

    text_img = Image.new("RGB", (640, 240), "white")
    d = ImageDraw.Draw(text_img)
    try:
        font = ImageFont.truetype("arial.ttf", 44)
    except OSError:
        font = ImageFont.load_default()
    d.text((20, 40), "EXIT - Platform 2", fill="black", font=font)
    d.text((20, 130), "Paracetamol 500 mg", fill="black", font=font)
    for _ in range(2):
        timed("OCR (RapidOCR)", vision.run_ocr, text_img)

    timed("faces available", faces.available)
    timed("faces in bus.jpg", lambda: len(faces.embed_faces(img)))
    timed("memory semantic search", lambda: rank("purse", [("a", "handbag on the sofa", None), ("b", "keys in kitchen", None)]))
    _ = dets


if __name__ == "__main__":
    main()
