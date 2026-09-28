# 6th Sense AI

AI-powered multimodal assistant for blind and low-vision people: point the phone, speak naturally, and hear
what is around you — with haptic and directional audio cues.

| Folder | What it is |
|---|---|
| `mobile/` | The app (Expo SDK 57 / React Native, Android + iOS). UI ported 1:1 from the Stitch design. |
| `backend/` | FastAPI AI server: Gemini reasoning, extra detectors, OCR, faces, memory, navigation, emergency. |
| `stitch_sixth_sense_ai_assistant/` | Original Stitch design export — the visual source of truth (read-only). |
| `scripts/` | `env.ps1` / `env.sh` (keeps all toolchains/caches on `D:\6thSenseAI`), `build-android.ps1`. |
| `tools/` | `export_yolo_tflite.py` — reproduces the on-device YOLO11n model. |

## How it works

```
Phone (always on-device, works offline)            Backend (when reachable + cloud processing on)
 camera ─► YOLO11n TFLite (~6 fps) ─► tracker ─►     photo + detections + OCR text
   hazards (vehicles, bikes, obstacles) ─► voice      ─► YOLO-World hazards (stairs, wet floor, manholes…)
 ML Kit OCR, barcode/QR, speech-to-text, TTS          ─► pose cues (hand raised, pointing, fallen)
 fall detection, haptics, stereo earcons               ─► OCR, product DB, opt-in faces
 memories, emergency contacts (SQLite)                 ─► Google Gemini (vision) ─► streamed spoken answer
```

If the server or Gemini is unavailable the app keeps working: it answers from on-device detection and says
that cloud AI reasoning is unavailable. If the cloud is slow, the phone speaks its own summary after 2.5 s.

## Run the backend

```powershell
. .\scripts\env.ps1
cd backend
copy .env.example .env      # then set GEMINI_API_KEY (and JWT_SECRET)
.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `GEMINI_API_KEY` stays on the server only; the app never sees it.
- Default model `gemini-3.8-flash`, falling back to `gemini-3.5-flash` → `gemini-3.5-flash-lite` on overload.
- Optional offline reasoning: install Ollama and `ollama pull qwen2.5:3b` (models in `D:\ollama models`).
- Optional automatic emergency SMS: set the `TWILIO_*` variables.
- Tests: `.venv\Scripts\python.exe -m pytest` · live check: `.venv\Scripts\python.exe tools\live_check.py`

## Run the app on an Android phone

1. `powershell -ExecutionPolicy Bypass -File scripts\build-android.ps1` → APK in `D:\6thSenseAI\builds\`.
2. Install it (`adb install <apk>`), open it, complete onboarding.
3. Phone and PC on the same Wi-Fi: Settings (avatar) → AI Server → `http://<PC-IP>:8000` → Save & test.

Development: `cd mobile; npx tsc --noEmit; npx jest`.

## Indoor navigation demo

The backend seeds a demo building (`campus-demo`). Location codes are QR codes with the text
`6S:campus-demo:<node>` (e.g. `6S:campus-demo:c302` = Classroom 302) or AprilTags (tag36h11, ids 1–7).

## Honest limits

Distances are monocular estimates ("about N metres"). Hazard detection and road-crossing help are assistive
information, not a safety guarantee. Currency: denomination only, no counterfeit detection. Medicine: only
what is printed on the label. Faces: opt-in, consent recorded, embeddings only, names only above a strict
threshold. On-device SMS requires pressing Send (OS rule) unless server SMS is configured.
