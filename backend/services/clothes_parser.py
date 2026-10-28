"""Clothes parsing: label every pixel as a piece of clothing, skin, hair or background.

Wraps the SegFormer-B2 "clothes" model (ATR labels) exported to ONNX. It is what
lets a photo of someone WEARING a garment keep only the clothes: arms, legs,
face and hair carry their own labels and are dropped.

The weights are optional and are not shipped with the repo (about 110 MB, and
their licence is NVIDIA's SegFormer licence, which is for non-commercial research;
check it before shipping a commercial build). Put the ONNX file at
`CLOTHES_PARSER_MODEL_PATH`. Without it, `get_clothes_parser()` returns None and
garment isolation keeps using its classical cut-out, so nothing breaks.

PRIVACY: runs on the temporary upload only; nothing is persisted here.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ATR label ids used by mattmdjaga/segformer_b2_clothes.
BACKGROUND = 0
HAT = 1
HAIR = 2
SUNGLASSES = 3
UPPER_CLOTHES = 4
SKIRT = 5
PANTS = 6
DRESS = 7
BELT = 8
SHOE_LEFT = 9
SHOE_RIGHT = 10
FACE = 11
LEG_LEFT = 12
LEG_RIGHT = 13
ARM_LEFT = 14
ARM_RIGHT = 15
BAG = 16
SCARF = 17

# What counts as something you could add to a wardrobe.
CLOTHING_LABELS = (HAT, UPPER_CLOTHES, SKIRT, PANTS, DRESS, BELT, SHOE_LEFT, SHOE_RIGHT, BAG, SCARF)
# What proves a person is in the frame (so the photo is "worn", not a flat-lay).
BODY_LABELS = (HAIR, FACE, LEG_LEFT, LEG_RIGHT, ARM_LEFT, ARM_RIGHT)

# A parser maps an RGB image (H, W, 3 uint8) to a label map (H, W uint8).
Parser = Callable[[np.ndarray], np.ndarray]

_INPUT_SIZE = 512
_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
_STD = np.array([0.229, 0.224, 0.225], np.float32)


class OnnxClothesParser:
    """Runs the exported SegFormer model and returns a full-resolution label map."""

    def __init__(self, session) -> None:
        self._session = session
        self._input_name = session.get_inputs()[0].name

    def __call__(self, rgb: np.ndarray) -> np.ndarray:
        h, w = rgb.shape[:2]
        small = cv2.resize(rgb, (_INPUT_SIZE, _INPUT_SIZE), interpolation=cv2.INTER_AREA)
        x = (small.astype(np.float32) / 255.0 - _MEAN) / _STD
        x = np.transpose(x, (2, 0, 1))[None]
        logits = self._session.run(None, {self._input_name: x})[0][0]  # (classes, h', w')
        # Upsample the scores, not the labels, so edges follow the model's confidence.
        scores = np.transpose(logits, (1, 2, 0))
        scores = cv2.resize(scores, (w, h), interpolation=cv2.INTER_LINEAR)
        return np.argmax(scores, axis=2).astype(np.uint8)


_lock = threading.Lock()
_loaded = False
_parser: Optional[Parser] = None


def get_clothes_parser() -> Optional[Parser]:
    """The process-wide parser, or None when the weights or onnxruntime are missing."""
    global _loaded, _parser
    if _loaded:
        return _parser
    with _lock:
        if _loaded:
            return _parser
        _parser = _load()
        _loaded = True
    return _parser

def _load() -> Optional[Parser]:
    from config import Config

    path = Path(Config.CLOTHES_PARSER_MODEL_PATH) if Config.CLOTHES_PARSER_MODEL_PATH else None
    if path is None or not path.is_file():
        logger.info("Clothes parser not configured (no model at %s); using the classical cut-out", path)
        return None
    try:
        import onnxruntime as ort  # type: ignore[import-not-found]
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    except Exception:
        logger.exception("Clothes parser could not be loaded; using the classical cut-out")
        return None
    logger.info("Clothes parser loaded from %s", path)
    return OnnxClothesParser(session)
