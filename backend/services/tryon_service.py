"""Virtual try-on job system (real pipeline, honest provider boundary).

The user data flow:

    app  ──(auth, validated upload)──▶  POST /api/tryon
        ──(job row, status=queued)──▶     TryOnJobStore
        ──(background worker)──▶          Pipeline.run(job)
            • download body photo + clothing images (private storage)
            • re-verify person via detection/pose/segmentation
            • VTONProvider.generate()   ← THE integration boundary
            • upload result to private `tryons` bucket
            • status: completed | failed   (error surfaced, honest)

PRIVACY / TEMP-FILE RULES (enforced in Pipeline.run):
  * All downloaded/rendered intermediates live under a per-job temp folder.
  * Temporary files are deleted in a `finally` block after processing —
    success or failure. Nothing intermediate is ever uploaded or retained.
  * The final generated image is written to the private `tryons` bucket at
    tryons/<uid>/<uuid>.<ext> and is only shown via short-lived signed URLs.
  * Failed jobs keep only their row (+ error text) — no media at all.

VTON PROVIDER BOUNDARY: until a real model weights file is placed at
TRYN_MODEL_PATH, jobs FAIL HONESTLY with "model not configured". There is no
mock generation toggle. Implement VTONProvider.generate() and point
TRYON_MODEL_PATH at the weights to plug in a real model.
"""
from __future__ import annotations

import atexit
import logging
import shutil
import tempfile
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

import requests

from config import Config
from services import storage_service
from services.supabase_client import SupabaseNotConfiguredError, get_supabase

logger = logging.getLogger(__name__)

BUCKET_PREFIXES = tuple(f"{b}/" for b in ("users", "wardrobe", "tryons", "avatars", "clothing"))

# User-facing job errors. The app shows `job.error` verbatim, so unexpected
# exception text (storage URLs, SDK internals) must never be stored there —
# it goes to the server log instead.
GENERIC_ERROR = "Something went wrong while creating your try-on. Please try again."
INTERRUPTED_ERROR = "This try-on was interrupted by a server restart. Please try again."

# How often the worker sweeps for jobs stuck in 'processing' (seconds).
STALE_SWEEP_INTERVAL = 60


class VtonNotConfiguredError(RuntimeError):
    """Raised when the VTON provider is not configured — jobs fail honestly."""


class TryOnError(RuntimeError):
    """Reflects a permanent job failure (bad input, provider error, ...)."""


# --------------------------------------------------------------------------
# VTON provider interface (integration boundary)
# --------------------------------------------------------------------------
class VTONProvider:
    """The only place a real virtual-try-on model plugs in.

    generate(inputs) receives a dict with local temp image paths and must
    return the path of the generated output image:

        inputs = {
            "person_image_path":  str,   # body photo (temp copy)
            "person_mask_path":   str | None,  # unused until a mask step lands
            "clothing_image_paths": [str],  # one or more garment images
            "body_measurements":  dict,   # pose summary from /api/body-photos
        }

    Until TRYON_MODEL_PATH is set, generate() raises VtonNotConfiguredError.
    """

    def __init__(self, model_path: str = "") -> None:
        self.model_path = model_path

    def is_configured(self) -> bool:
        return bool(self.model_path) and Path(self.model_path).exists()

    def generate(self, inputs: dict) -> Path:
        if not self.is_configured():
            raise VtonNotConfiguredError(
                "The virtual try-on model is not configured on the server "
                "(TRYON_MODEL_PATH is empty). No try-on image was generated — "
                "this feature will light up when a real VTON model is deployed."
            )
        raise NotImplementedError(
            "VTONProvider.generate() is the integration point for a real "
            "virtual-try-on model. Implement it, then set TRYON_MODEL_PATH."
        )


# --------------------------------------------------------------------------
# Job store (try_on_jobs table, service-role access)
# --------------------------------------------------------------------------
class TryOnJobStore:
    def __init__(self) -> None:
        self._client = get_supabase()

    def create(
        self,
        user_id: str,
        body_photo_id: Optional[str],
        clothing_ids: List[str],
        model_preset: Optional[str] = None,
    ) -> dict:
        row = (
            self._client.table("try_on_jobs")
            .insert(
                {
                    "user_id": user_id,
                    "body_photo_id": body_photo_id,
                    "model_preset": model_preset,
                    "clothing_ids": clothing_ids,
                    "status": "queued",
                }
            )
            .execute()
        )
        return row.data[0]

    def count_since(self, user_id: str, since: datetime) -> int:
        """How many jobs the user created since `since` (for the daily cap)."""
        rows = (
            self._client.table("try_on_jobs")
            .select("id")
            .eq("user_id", user_id)
            .gte("created_at", since.isoformat())
            .execute()
            .data
        )
        return len(rows or [])

    def get(self, job_id: str) -> Optional[dict]:
        rows = self._client.table("try_on_jobs").select("*").eq("id", job_id).limit(1).execute().data
        return rows[0] if rows else None

    def list_for_user(self, user_id: str) -> List[dict]:
        return (
            self._client.table("try_on_jobs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
            .data
        )

    def update(self, job_id: str, **fields) -> dict:
        fields.setdefault("updated_at", "now()")
        rows = self._client.table("try_on_jobs").update(fields).eq("id", job_id).execute().data
        return rows[0] if rows else {}

    def claim_next(self) -> Optional[dict]:
        """Atomically-ish claim the oldest queued job.

        Single local worker, so the select→update race window is negligible;
        the status guard ('processing' only if still 'queued') keeps it safe
        even with multiple workers.
        """
        queued = (
            self._client.table("try_on_jobs")
            .select("*")
            .eq("status", "queued")
            .order("created_at")
            .limit(1)
            .execute()
            .data
        )
        if not queued:
            return None
        job = queued[0]
        claimed = (
            self._client.table("try_on_jobs")
            .update({"status": "processing", "updated_at": "now()"})
            .eq("id", job["id"])
            .eq("status", "queued")
            .execute()
            .data
        )
        if claimed:
            logger.info("Try-on job %s claimed", job["id"])
            return claimed[0]
        logger.info("Try-on job %s was claimed by another worker; skipping", job["id"])
        return None

    def fail_stale_processing(self, stale_after_seconds: int) -> int:
        """Mark jobs stuck in 'processing' as failed; returns how many.

        A job only stays 'processing' past the threshold when the process that
        claimed it died mid-job (redeploy, crash, OOM). It is failed rather
        than re-queued so a job that crashes the worker can't loop forever;
        the user can retry it explicitly.
        """
        cutoff = (datetime.now(timezone.utc) - timedelta(seconds=stale_after_seconds)).isoformat()
        rows = (
            self._client.table("try_on_jobs")
            .update({"status": "failed", "error": INTERRUPTED_ERROR, "updated_at": "now()"})
            .eq("status", "processing")
            .lt("updated_at", cutoff)
            .execute()
            .data
        )
        for row in rows:
            logger.warning("Try-on job %s was stuck in processing; marked failed", row["id"])
        return len(rows)

    def delete(self, job_id: str) -> None:
        self._client.table("try_on_jobs").delete().eq("id", job_id).execute()


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------
def _is_own_wardrobe_ref(user_id: str, ref: str) -> bool:
    """True for `wardrobe/<user_id>/<file>`, the only shape the app writes.

    Rejects other users' paths, other buckets, `..` segments and external URLs,
    so a doctored row cannot make the server read someone else's image or an
    arbitrary URL.
    """
    parts = ref.split("/")
    return len(parts) >= 3 and parts[0] == "wardrobe" and parts[1] == user_id and all(parts[2:]) and ".." not in parts


def resolve_clothing_item(user_id: str, item_id: str) -> Optional[dict]:
    """Image and category for a clothing id the caller may use, else None.

    Checks the shared `clothing` catalog first, then the caller's own
    `clothing_items` (filtered by user_id, so another user's item is never
    returned), and its image_url must be in the caller's own wardrobe folder.
    Same queries and ownership filter as
    `TryOnPipeline._resolve_clothing_refs`.
    """
    for table, owned in (("clothing", False), ("clothing_items", True)):
        query = get_supabase().table(table).select("id, image_url, category").eq("id", item_id)
        if owned:
            query = query.eq("user_id", user_id)
        rows = query.execute().data or []
        for row in rows:
            ref = row.get("image_url")
            if ref and (not owned or _is_own_wardrobe_ref(user_id, ref)):
                return {"image_url": row["image_url"], "category": row.get("category")}
    return None


def _resolve_image_bytes(image_ref: str) -> bytes:
    """Fetch an image from private storage (bucket path) or a public URL."""
    if any(image_ref.startswith(prefix) for prefix in BUCKET_PREFIXES):
        bucket_name, object_path = image_ref.split("/", 1)
        return get_supabase().storage.from_(bucket_name).download(object_path)
    resp = requests.get(image_ref, timeout=30)
    resp.raise_for_status()
    return resp.content


def default_provider() -> VTONProvider:
    """Gemini when its key is set, else the local-model boundary (honest failure)."""
    from services import gemini_client

    if gemini_client.use_gemini():
        from services.gemini_tryon import GeminiTryOnProvider

        return GeminiTryOnProvider()
    return VTONProvider(Config.TRYON_MODEL_PATH)


class TryOnPipeline:
    def __init__(self, provider: Optional[VTONProvider] = None) -> None:
        self.provider = provider or default_provider()
        self.store = TryOnJobStore()

    def run(self, job: dict) -> None:
        """Process one claimed job end-to-end. Never raises for caller reasons:
        all outcomes are recorded on the job row (completed/failed).
        """
        job_id = job["id"]
        user_id = job["user_id"]
        started = time.perf_counter()
        logger.info("Try-on job %s processing started", job_id)
        workdir = Path(tempfile.mkdtemp(prefix=f"tryon_{job_id[:8]}_"))
        try:
            self._run_inner(job, user_id, workdir)
        except (VtonNotConfiguredError, TryOnError) as exc:
            # Expected, user-meaningful failures: the message is safe to show.
            logger.info("Try-on job %s failed: %s", job_id, exc)
            self.store.update(job_id, status="failed", error=str(exc))
        except Exception:  # unexpected: log details, store a generic message
            logger.exception("Try-on job %s failed unexpectedly", job_id)
            self.store.update(job_id, status="failed", error=GENERIC_ERROR)
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
            logger.info(
                "Try-on job %s finished in %.1fs; temp files cleaned up",
                job_id,
                time.perf_counter() - started,
            )

    # ------------------------------------------------------------ internals
    @staticmethod
    def _resolve_clothing_refs(user_id: str, clothing_ids: List[str]) -> List[str]:
        """The image reference (storage path or URL) of each clothing id."""
        return [row["image_url"] for row in TryOnPipeline._resolve_clothing_rows(user_id, clothing_ids)]

    @staticmethod
    def _resolve_clothing_rows(user_id: str, clothing_ids: List[str]) -> List[dict]:
        """Image reference plus name, category and color of each clothing id.

        Ids may reference:
          * public.clothing            (shared catalog, image_url column)
          * public.clothing_items      (user's own wardrobe, image_url column)
        Ownership of clothing_items is verified here (user_id filter), so a
        user can never feed another user's wardrobe item into their try-on.
        """
        rows: List[dict] = []
        if not clothing_ids:
            return rows

        catalog_rows = (
            get_supabase()
            .table("clothing")
            .select("id, image_url, name, category, color")
            .in_("id", clothing_ids)
            .execute()
            .data
        )
        catalog_map = {str(r["id"]): r for r in catalog_rows if r.get("image_url")}
        for cid in clothing_ids:
            if cid in catalog_map:
                rows.append(catalog_map[cid])

        item_rows = (
            get_supabase()
            .table("clothing_items")
            .select("id, image_url, name, category, color")
            .in_("id", clothing_ids)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        item_map = {str(r["id"]): r for r in item_rows if r.get("image_url")}
        for cid in clothing_ids:
            if cid in item_map:
                rows.append(item_map[cid])

        seen: set = set()
        unique: List[dict] = []
        for row in rows:
            if row["image_url"] not in seen:
                seen.add(row["image_url"])
                unique.append(row)
        return unique

    def _run_inner(self, job: dict, user_id: str, workdir: Path) -> None:
        from services.body_analysis import analyze_body_image

        # Fail fast: without a model the job can only fail, so don't download
        # private photos or run three CV models first.
        if not self.provider.is_configured():
            self.provider.generate({})  # raises VtonNotConfiguredError

        from services.gemini_tryon import garment_label, is_preset, photo_kind
        from services.selfie_check import FACE_KEYPOINTS, KEYPOINT_CONFIDENCE, MIN_FACE_KEYPOINTS

        preset = job.get("model_preset")
        person_img: Optional[Path] = None
        analysis: dict = {}
        if preset:
            # A described, made-up person: no photo of anyone is used.
            if not is_preset(preset):
                raise TryOnError("That model isn't available anymore. Pick another one.")
            kind = "preset"
        else:
            body_photo_id = job.get("body_photo_id")
            if not body_photo_id:
                raise TryOnError("Try-on job has no body photo.")

            # 1) Load the body photo row (owner == job.user_id is guaranteed by
            #    the store: job was created with that user's id).
            body = (
                get_supabase()
                .table("body_photos")
                .select("*")
                .eq("id", body_photo_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            )
            if not body:
                raise TryOnError("Body photo no longer exists.")
            body = body[0]

            # 2) Re-verify someone is there (defense in depth). A close face
            #    photo may not count as a "person" to the detector, so clear
            #    facial keypoints are enough.
            person_img = workdir / "person.jpg"
            person_img.write_bytes(_resolve_image_bytes(body["storage_path"]))
            analysis = analyze_body_image(str(person_img))
            pose = analysis.get("pose") or {}
            face_points = {
                kp.get("name")
                for kp in pose.get("keypoints") or []
                if kp.get("name") in FACE_KEYPOINTS and (kp.get("confidence") or 0) >= KEYPOINT_CONFIDENCE
            }
            logger.info(
                "Try-on job %s: photo re-verified (person=%s, face points=%d)",
                job["id"],
                analysis.get("personDetected"),
                len(face_points),
            )
            if not analysis.get("personDetected") and len(face_points) < MIN_FACE_KEYPOINTS:
                raise TryOnError("No person found in this photo. Try one that shows your face clearly.")
            kind = photo_kind(pose)

        # 3) Gather clothing images, each with a label built from its row.
        clothing_ids: List[str] = job.get("clothing_ids") or []
        rows = self._resolve_clothing_rows(user_id, clothing_ids)
        clothing_paths: List[str] = []
        labels: List[str] = []
        for i, row in enumerate(rows, start=1):
            dest = workdir / f"clothing_{uuid.uuid4().hex}.jpg"
            dest.write_bytes(_resolve_image_bytes(row["image_url"]))
            clothing_paths.append(str(dest))
            labels.append(garment_label(i, row))
        if not clothing_paths:
            raise TryOnError("No clothing images found for this try-on.")
        logger.info(
            "Try-on job %s: %d clothing image(s) fetched; generating (%s)", job["id"], len(clothing_paths), kind
        )

        # 4) The integration boundary — real model or honest failure.
        result_path = self.provider.generate(
            {
                "person_image_path": str(person_img) if person_img else None,
                "person_mask_path": None,
                "model_preset": preset,
                "photo_kind": kind,
                "clothing_image_paths": clothing_paths,
                "garment_labels": labels,
                "body_measurements": analysis,
                "output_dir": str(workdir),
            }
        )
        result_path = Path(result_path)
        if not result_path.is_file():
            raise TryOnError("VTON provider returned no output file.")

        # 5) Store the final result privately; the row keeps only its path.
        storage_path = storage_service.upload_file(
            "tryons", user_id, result_path, content_type="image/jpeg"
        )
        self.store.update(
            job["id"],
            status="completed",
            result_url=storage_path,
            photo_kind=kind,
            error=None,
        )
        logger.info("Try-on job %s completed -> %s", job["id"], storage_path)


# --------------------------------------------------------------------------
# Worker
# --------------------------------------------------------------------------
_stop = threading.Event()
_worker_thread: Optional[threading.Thread] = None

# Local artifact folders recorded by configure() (compat with the app factory).
_data_folder: Optional[Path] = None
_output_dir: Optional[Path] = None


def configure(data_folder=None, output_dir=None) -> None:
    """Record where local job artifacts may live (called by create_app()).

    Job rows persist to Supabase (TryOnJobStore); these folders are only for
    transient local files, which the pipeline deletes after every job.
    """
    global _data_folder, _output_dir
    _data_folder = Path(data_folder) if data_folder else Path(Config.TRYON_DATA_FOLDER)
    _output_dir = Path(output_dir) if output_dir else Path(Config.OUTPUT_FOLDER)
    (_data_folder / "jobs").mkdir(parents=True, exist_ok=True)


def stop_worker() -> None:
    """Signal the worker to stop and wait briefly so the process can exit cleanly."""
    global _worker_thread
    _stop.set()
    if _worker_thread is not None and _worker_thread.is_alive():
        try:
            _worker_thread.join(timeout=5)
        except RuntimeError:  # pragma: no cover - called from interpreter shutdown
            pass
        _worker_thread = None


def worker_loop() -> None:
    """Poll for queued jobs and process them one at a time (daemon thread)."""
    logger.info("Try-on worker started (poll interval %.1fs)", Config.TRYON_POLL_INTERVAL)
    last_sweep = 0.0
    while not _stop.is_set():
        try:
            pipeline = TryOnPipeline()
            while not _stop.is_set():
                if time.monotonic() - last_sweep >= STALE_SWEEP_INTERVAL:
                    pipeline.store.fail_stale_processing(Config.TRYON_STALE_AFTER_SECONDS)
                    last_sweep = time.monotonic()
                job = pipeline.store.claim_next()
                if job is None:
                    _stop.wait(Config.TRYON_POLL_INTERVAL)
                    continue
                pipeline.run(job)
        except SupabaseNotConfiguredError:
            logger.warning("Try-on worker paused: Supabase not configured.")
            _stop.wait(10)
        except Exception:
            logger.exception("Try-on worker error (continuing)")
            _stop.wait(Config.TRYON_POLL_INTERVAL)


def start_worker_if_enabled() -> None:
    if not Config.TRYON_WORKER_ENABLED:
        logger.info("Try-on worker disabled (TRYON_WORKER_ENABLED=0).")
        return
    global _worker_thread
    _worker_thread = threading.Thread(target=worker_loop, name="tryon-worker", daemon=True)
    _worker_thread.start()
    # Ensure a clean interpreter shutdown even in one-shot scripts that build
    # the app (avoids "Fatal Python error" noise from the daemon thread).
    atexit.register(stop_worker)