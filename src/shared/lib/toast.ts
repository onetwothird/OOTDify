// C:\OOTDify\src\shared\lib\toast.ts
// Global, non-blocking feedback ("toast"). One toast is visible at a time,
// styled by <ToastHost/>, and callable from anywhere — React components or plain
// modules (e.g. the avatar upload service) — via the `toast` helper.
import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info" | "loading";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastRecord {
  id: number;
  variant: ToastVariant;
  title: string;
  message?: string;
  /** Milliseconds before auto-dismiss. 0 keeps it until replaced or dismissed. */
  duration: number;
  action?: ToastAction;
}

export interface ToastInput {
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
  action?: ToastAction;
}

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 2600,
  info: 2600,
  error: 4200,
  loading: 0,
};

interface ToastState {
  current: ToastRecord | null;
  push: (input: ToastInput) => number;
  dismiss: (id?: number) => void;
}

let seq = 0;

export const useToastStore = create<ToastState>((set, get) => ({
  current: null,
  push: (input) => {
    const id = (seq += 1);
    const fallback = input.action ? 5200 : DEFAULT_DURATION[input.variant];
    set({
      current: {
        id,
        variant: input.variant,
        title: input.title,
        message: input.message,
        action: input.action,
        duration: input.duration ?? fallback,
      },
    });
    return id;
  },
  dismiss: (id) => {
    const current = get().current;
    if (!current) return;
    if (id !== undefined && current.id !== id) return;
    set({ current: null });
  },
}));

/**
 * Imperative toast API. Use it for feedback that should not interrupt the flow:
 *
 *   const id = toast.loading("Updating profile photo");
 *   try { … ; toast.success("Profile photo updated"); }
 *   catch (e) { toast.error("Couldn't update your photo", message); }
 */
export const toast = {
  show: (input: ToastInput) => useToastStore.getState().push(input),
  success: (title: string, message?: string, action?: ToastAction) =>
    useToastStore.getState().push({ variant: "success", title, message, action }),
  error: (title: string, message?: string, action?: ToastAction) =>
    useToastStore.getState().push({ variant: "error", title, message, action }),
  info: (title: string, message?: string, action?: ToastAction) =>
    useToastStore.getState().push({ variant: "info", title, message, action }),
  loading: (title: string, message?: string) =>
    useToastStore.getState().push({ variant: "loading", title, message }),
  dismiss: (id?: number) => useToastStore.getState().dismiss(id),
};
