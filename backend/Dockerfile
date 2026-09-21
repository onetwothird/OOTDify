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

CMD ["python", "app.py"]