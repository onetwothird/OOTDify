# MoveNet SinglePose Lightning (int8)

- File: `movenet_lightning_int8.tflite`
- Model: Google MoveNet SinglePose Lightning, TFLite int8
- Intended source: https://www.kaggle.com/models/google/movenet/tfLite/singlepose-lightning-tflite-int8
  (formerly https://tfhub.dev/google/lite-model/movenet/singlepose/lightning/tflite/int8/4).
  Not machine-verified: the URLs returned 404 to curl (Kaggle, even its root, rejects non-browser clients).
- License: Apache-2.0
- sha256: `cd7cc22fa946e5d146a7b98d496853e1923e22828d3972d579973f27f91bb105`
- Verified with the TFLite interpreter: input `[1,192,192,3]` uint8, output `[1,1,17,3]` float32 (y, x, score).
