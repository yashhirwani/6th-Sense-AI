"""
Reproducible export of the on-device detector used by the mobile app.

    YOLO11n (COCO-80) -> TFLite, 320x320, NMS embedded.
    Input : float32 [1, 320, 320, 3], RGB, 0..1 (NHWC)
    Output: float32 [1, 300, 6] = x1, y1, x2, y2 (input pixels), score, class_id

Ultralytics refuses direct TFLite export on Windows, so this uses the SavedModel path (onnx2tf),
which also emits *_float16.tflite. Run inside the export venv (see scripts/env.ps1):

    D:\6thSenseAI\tools\export\.venv\Scripts\python.exe tools/export_yolo_tflite.py
"""
import shutil
from pathlib import Path

import numpy as np
from ai_edge_litert.interpreter import Interpreter
from PIL import Image
from ultralytics import YOLO

OUT_DIR = Path(r"D:\6thSenseAI\models\yolo")
APP_MODEL = Path(__file__).resolve().parents[1] / "mobile" / "assets" / "models" / "yolo11n_320.tflite"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model = YOLO(str(OUT_DIR / "yolo11n.pt"))
    saved = Path(model.export(format="saved_model", imgsz=320, nms=True))
    tflite = saved / "yolo11n_float16.tflite"

    # Sanity check on the Ultralytics sample image: expect a bus and several people.
    it = Interpreter(model_path=str(tflite))
    it.allocate_tensors()
    img = Image.open(OUT_DIR / "bus.jpg").convert("RGB")
    w, h = img.size
    s = min(w, h)
    crop = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((320, 320))
    it.set_tensor(it.get_input_details()[0]["index"], (np.asarray(crop, np.float32) / 255.0)[None])
    it.invoke()
    rows = it.get_tensor(it.get_output_details()[0]["index"])[0]
    found = {model.names[int(r[5])] for r in rows if r[4] > 0.4}
    assert {"bus", "person"} <= found, f"unexpected detections: {found}"

    shutil.copy(tflite, APP_MODEL)
    print(f"OK {found} -> {APP_MODEL}")


if __name__ == "__main__":
    main()
