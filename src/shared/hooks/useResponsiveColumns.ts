// C:\OOTDify\src\shared\hooks\useResponsiveColumns.ts
// Dynamic grid column count based on the measured container width, so the
// catalog works on 320px screens and tablets without fixed-pixel layouts.
//
// IMPORTANT: attach `onLayout` to the element that *defines the row width*
// (the grid itself, which already sits inside the screen's horizontal
// padding). The measured width is used as-is — do NOT pass page padding here
// or it gets subtracted twice and leaves a dead gap on the right.
import { useEffect, useState } from "react";
import { LayoutChangeEvent } from "react-native";

export interface ResponsiveColumns {
  columns: number;
  itemWidth: number;
  onLayout: (e: LayoutChangeEvent) => void;
}

/**
 * @param minCardWidth desired minimum card width.
 * @param gap spacing between cards.
 */
export function useResponsiveColumns(
  minCardWidth = 120,
  gap = 12,
): ResponsiveColumns {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // On web/expo, the initial layout event sets this; nothing else needed.
  }, []);

  const available = Math.max(0, width);
  const columns = Math.max(1, Math.floor((available + gap) / (minCardWidth + gap)));
  const itemWidth = columns > 0 ? (available - gap * (columns - 1)) / columns : available;

  return {
    columns,
    itemWidth,
    onLayout: (e) => setWidth(e.nativeEvent.layout.width),
  };
}
