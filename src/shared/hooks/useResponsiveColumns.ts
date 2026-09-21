// C:\OOTDify\src\shared\hooks\useResponsiveColumns.ts
// Dynamic grid column count based on available width, so the catalog works on
// 320px screens and tablets without fixed-pixel layouts.
import { useEffect, useState } from "react";
import { LayoutChangeEvent } from "react-native";

export interface ResponsiveColumns {
  columns: number;
  itemWidth: number;
  onLayout: (e: LayoutChangeEvent) => void;
}

/**
 * @param container padding (horizontal, both sides) to subtract.
 * @param minCardWidth desired minimum card width.
 * @param gap spacing between cards.
 */
export function useResponsiveColumns(
  horizontalPadding = 16,
  minCardWidth = 120,
  gap = 12,
): ResponsiveColumns {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // On web/expo, initial layout event will set this; nothing else needed.
  }, []);

  const available = Math.max(0, width - horizontalPadding * 2);
  const columns = Math.max(1, Math.floor((available + gap) / (minCardWidth + gap)));
  const itemWidth = columns > 0 ? (available - gap * (columns - 1)) / columns : available;

  return {
    columns,
    itemWidth,
    onLayout: (e) => setWidth(e.nativeEvent.layout.width),
  };
}