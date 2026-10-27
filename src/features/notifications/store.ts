// C:\OOTDify\src\features\notifications\store.ts
// The unread count behind the bell's badge. NotificationsHost keeps it in
// step with the database (on start, on every new row, and after reads).
import { create } from "zustand";

interface NotificationsState {
  unread: number;
  /** The chat on screen right now: its messages need no banner or badge. */
  activeChat: string | null;
  setUnread: (n: number) => void;
  bump: () => void;
  setActiveChat: (id: string | null) => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unread: 0,
  activeChat: null,
  setUnread: (unread) => set({ unread: Math.max(0, unread) }),
  bump: () => set((s) => ({ unread: s.unread + 1 })),
  setActiveChat: (activeChat) => set({ activeChat }),
}));
