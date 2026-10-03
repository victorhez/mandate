import { useSyncExternalStore } from "react";
import type { Adapter, Snapshot } from "./types";
import { createDemoAdapter } from "./demo";
import { createLiveAdapter } from "./chain";

export const demo = createDemoAdapter();
let liveInstance: Adapter | undefined;
export const live = () => (liveInstance ??= createLiveAdapter());

export function useSnapshot(a: Adapter): Snapshot {
  return useSyncExternalStore(a.subscribe, a.getSnapshot);
}

// Minimal toast bus.
export interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
}
let toasts: Toast[] = [];
const tl = new Set<() => void>();
let tid = 0;
export function toast(kind: Toast["kind"], text: string) {
  const t = { id: ++tid, kind, text };
  toasts = [...toasts, t];
  tl.forEach((l) => l());
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== t.id);
    tl.forEach((l) => l());
  }, 4200);
}
export const useToasts = () =>
  useSyncExternalStore(
    (cb) => (tl.add(cb), () => tl.delete(cb)),
    () => toasts,
  );

export async function run(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    toast("ok", label);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast("err", msg.length > 140 ? msg.slice(0, 140) + "…" : msg.split("\n")[0]);
  }
}
