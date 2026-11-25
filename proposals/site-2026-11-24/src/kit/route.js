// The kit's hash router. Grammar: #/<workspace>/<args…>?v=<versionId>&<other params>
//   #/types/JointTrajectory            the Types workspace on JointTrajectory, Live
//   #/packages?mode=pipeline&v=release the pipeline at the latest release
// WHY the version lives inside the hash (not location.search): the live site's Site-design switcher keeps
// location.hash when it swaps designs, so the version and the selection survive a design switch, every state is one
// deep link, and Back/Forward walk the history (criterion fr4). Live is the default and is omitted from the hash.
import { useMemo, useSyncExternalStore } from "react";

// The workspace ids the round-2 gates look for (data-ws="<id>"); labels are a suggestion.
export const WORKSPACES = [
  { id: "types", label: "Types" },
  { id: "packages", label: "Packages" },
  { id: "directory", label: "Directory" },
  { id: "health", label: "Health" },
  { id: "agents", label: "Agents" },
  { id: "run", label: "Pick and place" },
  { id: "skill", label: "For coding agents" },
];

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

export function parseHash(hash = typeof location !== "undefined" ? location.hash : "") {
  const h = String(hash || "").replace(/^#\/?/, "");
  const qi = h.indexOf("?");
  const path = qi < 0 ? h : h.slice(0, qi), query = qi < 0 ? "" : h.slice(qi + 1);
  const parts = path ? path.split("/").filter(Boolean).map(safeDecode) : [];
  const params = Object.fromEntries(new URLSearchParams(query));
  return { ws: parts[0] || null, args: parts.slice(1), params, v: params.v || "live" };
}

export function buildHash(ws, args = [], params = {}) {
  const path = [ws, ...args].filter((x) => x != null && x !== "").map((x) => encodeURIComponent(String(x))).join("/");
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "" && v !== false && !(k === "v" && v === "live")) q.set(k, String(v));
  const qs = q.toString();
  return "#/" + path + (qs ? "?" + qs : "");
}

function write(hash, replace = false) {
  if (hash === location.hash || (hash === "#/" && !location.hash)) return;
  if (replace) {
    history.replaceState(history.state, "", hash);
    window.dispatchEvent(new HashChangeEvent("hashchange")); // replaceState fires nothing; tell every useRoute
  } else location.hash = hash;
}

// Navigation helpers usable outside React (event handlers, the demo).
// navigate({ ws, args, params, replace, keep }) — keep: "version" (default: carry ?v= over), "all" (every param), "none".
export function navigate({ ws, args = [], params = {}, replace = false, keep = "version" } = {}) {
  const cur = parseHash();
  const base = keep === "all" ? { ...cur.params } : keep === "version" && cur.params.v ? { v: cur.params.v } : {};
  write(buildHash(ws ?? cur.ws ?? "", args, { ...base, ...params }), replace);
}
export function hrefTo(ws, ...args) {
  const cur = parseHash();
  return buildHash(ws, args, cur.params.v ? { v: cur.params.v } : {});
}
export function setParams(patch, { replace = false } = {}) {
  const cur = parseHash();
  write(buildHash(cur.ws ?? "", cur.args, { ...cur.params, ...patch }), replace);
}
export function setVersion(id) { setParams({ v: id === "live" ? null : id }); }

const subscribe = (cb) => { window.addEventListener("hashchange", cb); window.addEventListener("popstate", cb); return () => { window.removeEventListener("hashchange", cb); window.removeEventListener("popstate", cb); }; };
const snapshot = () => location.hash;

// useRoute(defaultWs) -> { ws, args, arg, params, v, go(ws, ...args), href(ws, ...args), setParams(patch), setVersion(id), navigate }
// go() keeps the version and drops the old workspace's other params; setParams() keeps everything.
export function useRoute(defaultWs = "types") {
  const hash = useSyncExternalStore(subscribe, snapshot, () => "");
  return useMemo(() => {
    const r = parseHash(hash);
    const ws = r.ws || defaultWs;
    return {
      ...r, ws, arg: r.args[0] ?? null, hash,
      go: (w, ...args) => navigate({ ws: w, args }),
      href: (w, ...args) => buildHash(w, args, r.params.v ? { v: r.params.v } : {}),
      setParams: (patch, opts) => setParams(patch, opts),
      setVersion,
      navigate,
    };
  }, [hash, defaultWs]);
}
