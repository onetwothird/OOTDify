# OOTDify AI Backend (Flask + YOLO)

Modular Flask backend that receives full-body photos from the Expo app, runs
YOLO person/object detection, and returns clean JSON. Built to be extended
with pose estimation, human segmentation, clothing classification and virtual
try-on later.

## Project layout

```
backend/
├── app.py                  # Flask app factory + wiring (model warmup, CORS, error handlers)
├── config.py               # All settings, read from environment variables (.env)
├── requirements.txt        # Python dependencies
├── .env.example            # Template — copy to .env and fill in secrets
├── routes/
│   ├── __init__.py
│   ├── detection.py        # POST /api/detect, GET /api/detect/annotated/<f>, GET /health
│   ├── pose.py             # POST /api/pose, GET /api/pose/annotated/<f>
│   ├── segmentation.py     # POST /api/segment, GET /api/segment/annotated/<f>
│   ├── tryon.py            # POST /api/try-on (job), GET /api/try-on/<id>, GET /api/try-on/result/<f>
│   └── recommend.py        # POST /api/recommend (server-side outfit suggestions)
├── services/
│   ├── __init__.py
│   ├── yolo_service.py     # Loads YOLO once, runs inference, returns JSON-ready data
│   ├── pose_service.py     # yolov8n-pose: 17-point body keypoints per person
│   ├── segmentation_service.py  # yolov8n-seg: instance masks as polygons
│   ├── tryon_service.py    # Async job system + VTON integration boundary
│   ├── recommend_service.py     # Rule-based outfit recommender (LLM swap point)
│   └── image_service.py    # Upload validation, safe filenames, cleanup
├── models/yolo/            # Model weights live here (auto-downloads on first run)
├── uploads/                # Temporary uploads (deleted after processing)
├── outputs/                # Annotated / generated result images
├── data/jobs/              # Try-on job records (JSON)
└── scripts/test_api.py     # CLI smoke test against a running server
```

## Purpose of each file

| File | Purpose |
| --- | --- |
| `app.py` | `create_app()` factory. Registers blueprints, CORS, error handlers. Warms up the YOLO model at startup. Run with `python app.py`. |
| `config.py` | Reads `FLASK_*`, `YOLO_*`, upload limits etc. from the environment; defines folder paths and `ensure_dirs()`. |
| `routes/detection.py` | The HTTP layer: validates the upload, delegates to the YOLO service, serialises the result, cleans up temp files. Routes are thin — no AI logic lives here. |
| `services/yolo_service.py` | The AI layer. `YOLOService` holds one loaded model for the process lifetime; `detect()` returns `DetectionResult` (classes, confidences, boxes, optional annotated file). |
| `services/image_service.py` | `secure_filename` + UUID naming, extension/format checks, PIL image verification, best-effort cleanup. |
| `models/yolo/` | Folder where `yolo11n.pt` is stored (auto-downloaded on first run). |
| `uploads/` / `outputs/` | Runtime folders; gitignored. Uploads are deleted after processing. |

## Setup (Windows)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# optional: create .env from the template
Copy-Item .env.example .env
```

The first launch downloads `yolo11n.pt` (~5–6 MB) into `models/yolo/` and may
compile a cached YOLO op the first time — be patient.

## Run

```powershell
python app.py
# or
flask --app app run --debug
```

Server listens on `0.0.0.0:5000` so your phone (same Wi-Fi) can reach it at
`http://<your-local-ip>:5000`.

## Test

With the server running, in a second terminal:

```powershell
.\.venv\Scripts\python scripts\test_api.py C:\path\to\a\photo.jpg
```

or from a shell:

```powershell
curl -F "image=@C:\path\to\photo.jpg" "http://127.0.0.1:5000/api/detect?annotated=true"
```

Expected JSON:

```json
{
  "success": true,
  "detections": [
    { "class": "person", "confidence": 0.97, "bbox": { "x1": 120, "y1": 80, "x2": 850, "y2": 1600 } }
  ],
  "annotated_image_url": "/api/detect/annotated/uuid_photo_annotated.jpg",
  "inference_ms": 210.4,
  "model": "yolo11n",
  "error": null
}
```

Open `http://127.0.0.1:5000/api/detect/annotated/<filename>` to view boxes.

## Common errors

| Symptom | Fix |
| --- | --- |
| `ModuleNotFoundError: ultralytics` | Activate the venv and `pip install -r requirements.txt`. |
| Model downloads every boot / "not found" | Keep `YOLO_MODEL_PATH` inside the repo (default). The `.pt` file downloads once. |
| `HRFPN`/compile warnings on first run | Normal — Ultralytics is building a cache; second request is much faster. |
| Phone cannot reach the API (`Network request failed`) | Use the PC's LAN IP (not `localhost`); see root README networking section. Allow port 5000 through Windows Firewall. |
| `413 File too large` | Your photo exceeds 10 MB. Raise `MAX_CONTENT_LENGTH` or compress the photo on-device (see Expo `quality`). |

## Adding a new AI service later

1. Create `services/<name>_service.py`.
2. Give it a `configure(...)` + module singleton like `yolo_service.py`.
3. Add a route in `routes/` and register the blueprint in `app.py`.
4. Keep every service independent so models load once per process.

## Connecting the virtual try-on model (the integration boundary)

Everything around the VTON model is real: the job system (`POST /api/try-on`
creates a job, `GET /api/try-on/<id>` polls it), person detection and human
segmentation run with real YOLO models, and uploads are validated + cleaned up.

The only missing piece is **`run_virtual_tryon()` in `services/tryon_service.py`**.
Until a model is installed it raises `TryOnNotConfiguredError`, so every job
ends in the honest `failed` state with
`error.code = "tryon_model_not_configured"` — the app shows that instead of a
fake image. To plug in a real model:

1. Set `VIRTUAL_TRYON_MODEL_PATH` in `backend/.env`.
2. Implement `run_virtual_tryon()` (load once, call the model, save the output
   to the outputs folder, return the filename). The route layer already serves
   result files from that folder.