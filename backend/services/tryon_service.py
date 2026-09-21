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
from pathlib import Path
from typing import Dict, List, Optional

import requests

from config import Config
from services import storage_service
from services.supabase_client import SupabaseNotConfiguredError, get_supabase

logger = logging.getLogger(__name__)

BUCKET_PREFIXES = tuple(f"{b}/" for b in ("users", "wardrobe", "tryons", "avatars", "clothing"))


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
        body_photo_id: str,
        clothing_ids: List[str],
    ) -> dict:
        row = (
            self._client.table("try_on_jobs")
            .insert(
                {
                    "user_id": user_id,
                    "body_photo_id": body_photo_id,
                    "clothing_ids": clothing_ids,
                    "status": "queued",
                }
            )
            .execute()
        )
        return row.data[0]

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
        return claimed[0] if claimed else None

    def delete(self, job_id: str) -> None:
        self._client.table("try_on_jobs").delete().eq("id", job_id).execute()


# --------------------------------------------------------------------------
# Pipeline
# --------------------------------------------------------------------------
def _resolve_image_bytes(image_ref: str) -> bytes:
    """Fetch an image from private storage (bucket path) or a public URL."""
    if any(image_ref.startswith(prefix) for prefix in BUCKET_PREFIXES):
        bucket_name, object_path = image_ref.split("/", 1)
        return get_supabase().storage.from_(bucket_name).download(object_path)
    resp = requests.get(image_ref, timeout=30)
    resp.raise_for_status()
    return resp.content


class TryOnPipeline:
    def __init__(self, provider: Optional[VTONProvider] = None) -> None:
        self.provider = provider or VTONProvider(Config.TRYON_MODEL_PATH)
        self.store = TryOnJobStore()

    def run(self, job: dict) -> None:
        """Process one claimed job end-to-end. Never raises for caller reasons:
        all outcomes are recorded on the job row (completed/failed).
        """
        job_id = job["id"]
        user_id = job["user_id"]
        workdir = Path(tempfile.mkdtemp(prefix=f"tryon_{job_id[:8]}_"))
        try:
            self._run_inner(job, user_id, workdir)
        except VtonNotConfiguredError as exc:
            logger.info("Try-on job %s: %s", job_id, exc)
            self.store.update(job_id, status="failed", error=str(exc))
        except Exception as exc:  # anything else also becomes an honest failure
            logger.exception("Try-on job %s failed", job_id)
            self.store.update(
                job_id, status="failed", error=f"Processing failed: {exc}"
            )
        finally:
            shutil.rmtree(workdir, ignore_errors=True)
            logger.info("Try-on job %s finished; temp files cleaned up", job_id)

    # ------------------------------------------------------------ internals
    @staticmethod
    def _resolve_clothing_refs(user_id: str, clothing_ids: List[str]) -> List[str]:
        """Return the image reference (storage path or URL) for each clothing id.

        Ids may reference:
          * public.clothing            (shared catalog, image_url column)
          * public.clothing_items      (user's own wardrobe, image_url column)
        Ownership of clothing_items is verified here (user_id filter), so a
        user can never feed another user's wardrobe item into their try-on.
        """
        refs: List[str] = []
        if not clothing_ids:
            return refs

        catalog_rows = (
            get_supabase()
            .table("clothing")
            .select("id, image_url")
            .in_("id", clothing_ids)
            .execute()
            .data
        )
        catalog_map = {str(r["id"]): r["image_url"] for r in catalog_rows if r.get("image_url")}
        for cid in clothing_ids:
            if cid in catalog_map:
                refs.append(catalog_map[cid])

        item_rows = (
            get_supabase()
            .table("clothing_items")
            .select("id, image_url")
            .in_("id", clothing_ids)
            .eq("user_id", user_id)
            .execute()
            .data
        )
        item_map = {str(r["id"]): r["image_url"] for r in item_rows if r.get("image_url")}
        for cid in clothing_ids:
            if cid in item_map:
                refs.append(item_map[cid])

        return list(dict.fromkeys(refs))

    def _run_inner(self, job: dict, user_id: str, workdir: Path) -> None:
        from services.body_analysis import analyze_body_image

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

        # 2) Re-verify the person is actually present (defense in depth).
        person_img = workdir / "person.jpg"
        person_img.write_bytes(_resolve_image_bytes(body["storage_path"]))
        analysis = analyze_body_image(str(person_img))
        if not analysis.get("personDetected"):
            raise TryOnError("No person detected in the body photo — try another photo.")

        # 3) Gather clothing images (resolve each id to its image reference).
        clothing_ids: List[str] = job.get("clothing_ids") or []
        refs = self._resolve_clothing_refs(user_id, clothing_ids)
        clothing_paths: List[str] = []
        for ref in refs:
            dest = workdir / f"clothing_{uuid.uuid4().hex}.jpg"
            dest.write_bytes(_resolve_image_bytes(ref))
            clothing_paths.append(str(dest))
        if not clothing_paths:
            raise TryOnError("No clothing images found for this try-on.")

        # 4) The integration boundary — real model or honest failure.
        result_path = self.provider.generate(
            {
                "person_image_path": str(person_img),
                "person_mask_path": None,
                "clothing_image_paths": clothing_paths,
                "body_measurements": analysis,
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
            job_id := job["id"],
            status="completed",
            result_url=storage_path,
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
    while not _stop.is_set():
        try:
            pipeline = TryOnPipeline()
            while not _stop.is_set():
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