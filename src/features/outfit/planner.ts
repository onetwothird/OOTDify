// C:\OOTDify\src\features\outfit\planner.ts
// Style-calendar data access: the user plans which saved outfit to wear on a
// given day. Rows live in public.outfit_plans, owner-scoped by RLS — the app
// upserts by (user_id, plan_date) so re-picking a day replaces the plan.
// No mock data: an empty calendar means nothing has been planned yet.

import { supabase } from "../../shared/lib/supabase";
import { currentUserId } from "../clothing/service";

export interface OutfitPlan {
  id: string;
  user_id: string;
  /** Local calendar day as YYYY-MM-DD. */
  plan_date: string;
  outfit_id: string | null;
  note: string | null;
  created_at: string;
}

/** Local Date → "YYYY-MM-DD" (never shifts across the UTC boundary). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → local Date at midnight. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function monthBounds(year: number, month: number): { start: string; end: string } {
  return {
    start: toISODate(new Date(year, month, 1)),
    end: toISODate(new Date(year, month + 1, 0)),
  };
}

/** Plans whose date falls within [startISO, endISO] (inclusive). */
export async function fetchOutfitPlans(startISO: string, endISO: string): Promise<OutfitPlan[]> {
  const uid = await currentUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from("outfit_plans")
    .select("*")
    .gte("plan_date", startISO)
    .lte("plan_date", endISO)
    .order("plan_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OutfitPlan[];
}

/** Create or replace the plan for a day. Pass outfitId=null to keep a note only. */
export async function setOutfitPlan(
  planDate: string,
  outfitId: string | null,
  note?: string | null,
): Promise<OutfitPlan> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  const { data, error } = await supabase
    .from("outfit_plans")
    .upsert(
      { user_id: uid, plan_date: planDate, outfit_id: outfitId, note: note ?? null },
      { onConflict: "user_id,plan_date" },
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as OutfitPlan;
}

export async function clearOutfitPlan(planDate: string): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const { error } = await supabase
    .from("outfit_plans")
    .delete()
    .eq("user_id", uid)
    .eq("plan_date", planDate);
  if (error) throw error;
}

/**
 * Resolve a renderable image ref (thumbnail preferred) for catalog clothing ids.
 * Used to draw the mini outfit icon on planned days. Missing ids are omitted.
 */
export async function fetchClothingImageRefs(ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (!unique.length) return {};
  const { data, error } = await supabase
    .from("clothing")
    .select("id, thumbnail_url, image_url")
    .in("id", unique);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as {
    id: string;
    thumbnail_url: string | null;
    image_url: string | null;
  }[]) {
    const ref = row.thumbnail_url || row.image_url;
    if (ref) map[row.id] = ref;
  }
  return map;
}
