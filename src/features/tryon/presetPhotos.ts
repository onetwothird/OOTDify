// C:\OOTDify\src\features\tryon\presetPhotos.ts
// Portraits shown on the preset model cards. They are AI-generated people,
// made once by backend/scripts/generate_model_portraits.py (which also keeps
// the full-size copy the backend sends as each model's face reference).
// After running it, add each new file here, e.g.
//   ava: require("../../../assets/images/models/ava.jpg"),
// A model without a portrait shows a drawn card instead.
import type { PresetId } from "./presets";

export const PRESET_PHOTOS: Partial<Record<PresetId, number>> = {};
