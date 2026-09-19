import { create } from "zustand";

interface CaptureModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

// Tiny global UI store so anything in the app (the tab bar's (+) button,
// the Wardrobe screen's own + button, an empty-state CTA, etc.) can open
// the same "capture your clothes" flow without prop-drilling.
export const useCaptureModalStore = create<CaptureModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));