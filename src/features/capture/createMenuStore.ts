import { create } from "zustand";

interface CreateMenuState {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

// Whether the Create (+) menu is fanned out. The (+) lives inside the tab bar
// and the choices are drawn over the page by CreateMenu, so they share this.
export const useCreateMenuStore = create<CreateMenuState>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));
