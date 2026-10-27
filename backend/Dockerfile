# OOTDify AI backend — optional Docker image (local dev convenience).
#
# This is NOT required: the primary local-dev path is the venv flow described
# in the root README. This image packages the Flask app + YOLO stack for anyone
# who would rather run it isolated from their host Python.
#
# Build/run (from the repo root):
#   docker compose up --build
#
# Runtime notes:
#   * YOLO/pose/segmentation weights are auto-downloaded on first boot into
#     /app/models/yolo (volume-mounted so downloads persist across restarts).
#   * uploads/ outputs/ data/ are volume-mounted so jobs survive container
#     restarts.
#   * backend/.env is optional; without it the app still boots and `/health`
#     works (the try-on worker pauses "Supabase not configured").
#   * Hosted platforms (Railway etc.) inject $PORT and only route traffic to
#     that port — gunicorn binds it below. FLASK_PORT still overrides locally.

# 3.12 matches the pinned local venv interpreter (cpython-3.12).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FLASK_DEBUG=0

WORKDIR /app

# OpenCV/Ultralytics runtime system libraries.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libgl1 \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000

# Serve with gunicorn (production WSGI server), not the Flask dev server.
# One worker with threads: each worker process would otherwise load its own
# copy of the YOLO models (hundreds of MB of RAM on a small instance), and the
# try-on job worker already runs as a background thread in this process.
# Port precedence mirrors config.py: FLASK_PORT (local/compose) beats the
# platform-injected PORT (Railway) beats the 5000 default.
# Long timeout covers first-boot weight downloads + model warmup inference.
# Access log to stdout so every request (method, path, status, duration in µs)
# shows in the platform logs — needed to tell dropped requests from app errors.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${FLASK_PORT:-${PORT:-5000}} --workers 1 --threads 8 --timeout 300 --graceful-timeout 30 --access-logfile - --access-logformat '%(h)s \"%(r)s\" %(s)s %(B)s %(D)sus' app:app"]