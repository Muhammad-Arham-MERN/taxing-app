// بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ
//! A tiny module-level toast store behind the shadcn/Radix toast UI.
//!
//! Cloud outcomes (Push, Sync, Reconnect) are reported here rather than painted
//! next to the buttons, so the header keeps its shape and the practitioner still
//! sees exactly one message per attempt (FR-033).

import { useEffect, useState } from "react";

export type ToastVariant = "default" | "destructive" | "success";

export interface ToastOptions {
  title?: string;
  description?: string;
  variant?: ToastVariant;
  /** Milliseconds the toast stays up before dismissing itself. */
  duration?: number;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
  open: boolean;
}

const DEFAULT_DURATION = 5000;
const EXIT_DURATION = 300;
const MAX_VISIBLE = 4;

let items: Toast[] = [];
const listeners = new Set<(items: Toast[]) => void>();

function emit() {
  const snapshot = [...items];
  for (const listener of listeners) {
    listener(snapshot);
  }
}

/** Remove a toast from the store, once its exit animation has played out. */
export function dismissToast(id: string) {
  items = items.map((item) => (item.id === id ? { ...item, open: false } : item));
  emit();
  setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, EXIT_DURATION);
}

/** Show a toast. Returns its id, which can be handed to `dismissToast`. */
export function toast(options: ToastOptions): string {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const item: Toast = {
    id,
    title: options.title ?? "",
    description: options.description,
    variant: options.variant ?? "default",
    duration: options.duration ?? DEFAULT_DURATION,
    open: true,
  };
  items = [...items, item].slice(-MAX_VISIBLE);
  emit();
  return id;
}

/** The live list of toasts, for `<Toaster />` to render. */
export function useToasts(): Toast[] {
  const [snapshot, setSnapshot] = useState<Toast[]>(items);

  useEffect(() => {
    const listener = (next: Toast[]) => setSnapshot(next);
    listeners.add(listener);
    listener(items);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
}

// وَإِنَّ اللَّهَ لَهُوَ خَيْرُ الرَّازِقِينَ
