import { useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
// Small helpers for V2. WHY try/catch: localStorage can throw (private window, file:// in an iframe); the page must
// render the same without it.
export function markReady() { document.documentElement.dataset.ready = "1"; }
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* per-viewer convenience only */ } },
};

// Re-fit the React Flow viewport whenever the set of visible nodes changes (collapse/expand, filters, a new type).
export function FitOnChange({ layoutKey, padding = 0.1, maxZoom = 1.2 }) {
  const rf = useReactFlow();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(() => rf.fitView({ padding, maxZoom, duration: 280 }), 40);
    return () => clearTimeout(t);
  }, [layoutKey]);
  return null;
}

// true below a breakpoint; the graphs re-layout for a phone instead of shrinking to unreadable.
export function useNarrow(q = "(max-width: 640px)") {
  const mq = typeof matchMedia === "function" ? matchMedia(q) : null;
  const [m, setM] = useState(() => !!mq?.matches);
  useEffect(() => { if (!mq) return; const on = () => setM(mq.matches); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  return m;
}
