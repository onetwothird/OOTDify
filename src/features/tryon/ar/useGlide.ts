// An Animated.Value that glides to each new target (or jumps, when motion is
// reduced). Used for the garment box and chalk marks between pose updates.
// A null target holds the current value (e.g. while fading out).
// JS-driven: layout props (left/top/width/height) can't use the native driver.
import { useEffect, useRef, useState } from "react";
import { Animated, Easing } from "react-native";

export const GLIDE_MS = 400;

export function useGlide(target: number | null, reduceMotion: boolean, duration = GLIDE_MS): Animated.Value {
  const [value] = useState(() => new Animated.Value(target ?? 0));
  // The first real target jumps into place instead of flying in from 0.
  const seeded = useRef(target !== null);
  useEffect(() => {
    if (target === null) return;
    if (reduceMotion || !seeded.current) {
      seeded.current = true;
      value.setValue(target);
      return;
    }
    const animation = Animated.timing(value, {
      toValue: target,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target, reduceMotion, duration, value]);
  return value;
}
