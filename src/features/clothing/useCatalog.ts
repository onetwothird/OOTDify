// C:\OOTDify\src\features\clothing\useCatalog.ts
import { useCallback, useEffect, useState } from "react";
import { fetchCatalog, fetchFavoriteIds } from "./service";
import { CatalogItem } from "./types";

interface UseCatalogResult {
  items: CatalogItem[];
  loading: boolean;
  error: string | null;
  favoriteIds: Set<string>;
  refetch: () => Promise<void>;
  toggleFavorite: (item: CatalogItem) => Promise<void>;
}

export function useCatalog(category?: string): UseCatalogResult {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, favs] = await Promise.all([
        fetchCatalog({ category }),
        fetchFavoriteIds().catch(() => new Set<string>()),
      ]);
      setItems(rows);
      setFavoriteIds(favs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the catalog.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleFavorite = useCallback(
    async (item: CatalogItem) => {
      const isFav = favoriteIds.has(item.id);
      // optimistic toggle
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      try {
        const { addFavorite, removeFavorite } = await import("./service");
        if (isFav) await removeFavorite(item.id);
        else await addFavorite(item.id);
      } catch (e) {
        // roll back on failure
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (isFav) next.add(item.id);
          else next.delete(item.id);
          return next;
        });
        throw e;
      }
    },
    [favoriteIds],
  );

  return { items, loading, error, favoriteIds, refetch: load, toggleFavorite };
}