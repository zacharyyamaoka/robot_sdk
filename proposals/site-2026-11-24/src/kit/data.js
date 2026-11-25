// useSite(): the one data door for every round-2 workspace. Reads graph.json, health.json, versions.json and
// pick_and_place.json from the data folder at runtime; loads another version's graph (and health, when recorded) on
// switch; falls back to the copies embedded at build time when there is no server (file://), where only Live exists.
// WHY a module-level store: every component that calls useSite() shares one fetch and one cache, so switching the
// version re-renders every workspace from the same documents (criterion fr3: "switching changes what every workspace
// shows"). The selected version itself lives in the URL hash (route.js), so it survives workspace and design switches.
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useRoute, setVersion as routeSetVersion } from "./route.js";
import { diffGraphs, refFor, sourceUrlAt } from "./model.js";

// Build-time copies. WHY import.meta.glob and not plain imports: health.json and versions.json are produced by a
// parallel lane and may not exist when a variant is first built; a glob that matches nothing builds fine.
// Only the top-level files are embedded: version graphs load on demand (13 graphs would triple the page).
const EMBEDDED = import.meta.glob(["@repo/site/data/graph.json", "@repo/site/data/health.json", "@repo/site/data/versions.json", "@repo/site/data/pick_and_place.json"], { eager: true, import: "default" });
const embedded = (name) => { for (const [k, v] of Object.entries(EMBEDDED)) if (k.endsWith("/" + name)) return v; return null; };

// WHY a meta override (same as src/shared/data.js): gh-pages serves the data beside index.html, the repo layout three
// folders up. ?data=<base> overrides both (tests); ?graph=<url> swaps only the Live graph (round 1's swap test).
export function dataBase() {
  const q = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const meta = typeof document !== "undefined" && document.querySelector('meta[name="robot-sdk-data"]')?.content;
  let base = q.get("data") || meta || "../../../site/data/";
  if (!base.endsWith("/")) base += "/";
  return base;
}

export function markReady() { if (typeof document !== "undefined") document.documentElement.dataset.ready = "1"; }

async function fetchJson(url) {
  const r = await fetch(new URL(url, location.href), { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}
const okSchema = (doc, prefix) => doc && String(doc.schema || "").startsWith(prefix);

// ---- the store ------------------------------------------------------------------------------------------------
let S = {
  phase: "idle", error: null, http: false, base: "", source: {},
  live: { graph: null, health: null }, versionsDoc: null, pick: null,
  cache: {},          // id -> { status: "loading"|"ok"|"error", graph, health, error }
  shownId: "live",    // the version whose documents are on screen (stays put while the next one loads)
};
let requestedId = "live"; // the version the URL asks for (bookkeeping only; the URL is the source of truth)
const listeners = new Set();
function set(patch) { S = { ...S, ...patch }; for (const l of listeners) l(); }
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => S;

async function getDoc(name, schema, http) {
  if (http) {
    try {
      const doc = await fetchJson(dataBase() + name);
      if (!okSchema(doc, schema)) throw new Error(`${name}: not ${schema}* (${doc?.schema})`);
      return { doc, source: "runtime" };
    } catch (e) { console.warn(`[kit] ${name}: ${e.message}; using the build-time copy`); }
  }
  const doc = embedded(name);
  return okSchema(doc, schema) ? { doc, source: http ? "embedded at build (runtime fetch failed)" : "embedded at build" } : { doc: null, source: "not available" };
}

let started = null;
export function loadSite() {
  if (started) return started;
  const http = location.protocol.startsWith("http");
  set({ phase: "loading", http, base: dataBase() });
  started = (async () => {
    try {
      const q = new URLSearchParams(location.search);
      const override = q.get("graph");
      let g;
      if (override) {
        try { const doc = await fetchJson(override); if (!okSchema(doc, "robot-sdk-graph/")) throw new Error("not robot-sdk-graph"); g = { doc, source: "override " + override }; }
        catch (e) { console.warn("[kit] ?graph override failed:", e.message); g = await getDoc("graph.json", "robot-sdk-graph/", http); }
      } else g = await getDoc("graph.json", "robot-sdk-graph/", http);
      const [h, v, p] = await Promise.all([
        getDoc("health.json", "robot-sdk-health/", http),
        getDoc("versions.json", "robot-sdk-versions/", http),
        http ? fetchJson(dataBase() + "pick_and_place.json").then((doc) => ({ doc, source: "runtime" }), () => ({ doc: embedded("pick_and_place.json"), source: "embedded at build" }))
          : Promise.resolve({ doc: embedded("pick_and_place.json"), source: "embedded at build" }),
      ]);
      if (!g.doc) throw new Error("graph.json is not available (no server and no build-time copy)");
      set({
        phase: "ready", live: { graph: g.doc, health: h.doc }, versionsDoc: v.doc, pick: p.doc,
        source: { graph: g.source, health: h.source, versions: v.source, pick: p.source, base: dataBase() },
        cache: { live: { status: "ok", graph: g.doc, health: h.doc } },
      });
      if (requestedId !== "live") ensureVersion(requestedId);
    } catch (e) { set({ phase: "error", error: e }); }
  })();
  return started;
}

// The version list the picker shows: versions.json's entries, each marked available or not (with the reason).
// When versions.json is missing, Live alone (it is graph.json; nothing is invented about other versions).
function versionList(s) {
  const doc = s.versionsDoc;
  const list = doc?.versions?.length ? doc.versions : [{
    id: "live", label: "Live", kind: "live", ref: "main", graph: "graph.json", health: "health.json",
    summary: "graph.json as published (versions.json is not available)", generated: s.live.graph?.generated, synthetic: true,
  }];
  return list.map((v) => {
    if (v.kind === "live" || v.id === "live") return { ...v, available: true, reason: null };
    if (!s.http) return { ...v, available: false, reason: "Opened from a file: only Live is embedded. Serve the site to load other versions." };
    if (!v.graph) return { ...v, available: false, reason: "this version names no graph file" };
    const c = s.cache[v.id];
    if (c?.status === "error") return { ...v, available: false, reason: `could not load: ${c.error}` };
    return { ...v, available: true, reason: null };
  });
}

async function ensureVersion(id) {
  requestedId = id;
  if (S.phase !== "ready") return;
  const entry = versionList(S).find((v) => v.id === id);
  if (!entry || id === "live") { if (S.shownId !== "live") set({ shownId: "live" }); return; }
  const c = S.cache[id];
  if (c?.status === "ok") { set({ shownId: id }); return; }
  if (c?.status === "loading" || !entry.available) { if (!entry.available) set({ shownId: "live" }); return; }
  set({ cache: { ...S.cache, [id]: { status: "loading" } } });
  try {
    const base = dataBase();
    const graph = await fetchJson(base + entry.graph);
    if (!okSchema(graph, "robot-sdk-graph/")) throw new Error(`${entry.graph}: not robot-sdk-graph`);
    let health = null, healthError = null;
    if (entry.health) {
      try { health = await fetchJson(base + entry.health); if (!okSchema(health, "robot-sdk-health/")) { health = null; healthError = "not robot-sdk-health"; } }
      catch (e) { healthError = e.message; }
    }
    set({ cache: { ...S.cache, [id]: { status: "ok", graph, health, healthError } } });
    if (requestedId === id) set({ shownId: id });
  } catch (e) {
    console.warn(`[kit] version ${id}:`, e.message);
    set({ cache: { ...S.cache, [id]: { status: "error", error: e.message } } });
    if (requestedId === id) set({ shownId: "live" });
  }
}

// ---- the hook -------------------------------------------------------------------------------------------------
// useSite({ autoReady = true }) -> {
//   ready, error, loading,                    phase flags (loading: the requested version is still on its way)
//   versions, versionsDoc, versionId, version, setVersion(id),
//   requestedId,                              the version in the URL (versionId lags behind it while loading)
//   graph, health, healthNote,                for the version on screen; health is null when it was not recorded
//   pick, live: { graph, health }, diff,      diff = diffGraphs(live.graph, graph) when not on Live, else null
//   ref(pkgId), sourceUrl(pkgId, where),       GitHub links at the version's ref (main for Live, the tag for a release)
//   source                                    where each document came from (runtime / embedded at build / …)
// }
export function useSite({ autoReady = true } = {}) {
  const s = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const route = useRoute();
  useEffect(() => { loadSite(); }, []);
  const requested = route.v || "live";
  useEffect(() => { if (s.phase === "ready") ensureVersion(requested); else requestedId = requested; }, [requested, s.phase]);
  useEffect(() => {
    if (autoReady && s.phase === "ready") { const r = requestAnimationFrame(() => requestAnimationFrame(markReady)); return () => cancelAnimationFrame(r); }
  }, [autoReady, s.phase]);

  return useMemo(() => {
    const ready = s.phase === "ready";
    const versions = versionList(s);
    const shown = ready ? (s.cache[s.shownId]?.status === "ok" ? s.shownId : "live") : "live";
    const entry = versions.find((v) => v.id === shown) || versions[0];
    const c = s.cache[shown] || {};
    const graph = ready ? c.graph || s.live.graph : null;
    const health = ready ? (shown === "live" ? s.live.health : c.health || null) : null;
    let healthNote = null;
    if (ready && !health) {
      if (shown === "live") healthNote = "health.json is not available yet";
      else if (!entry?.health) healthNote = `Health was not recorded for ${entry?.label || shown}.`;
      else healthNote = `Health for ${entry?.label || shown} could not be loaded${c.healthError ? `: ${c.healthError}` : ""}.`;
    }
    const isLive = shown === "live";
    const diff = ready && !isLive ? diffGraphs(s.live.graph, graph) : null;
    const reqEntry = versions.find((v) => v.id === requested);
    return {
      ready, error: s.error, loading: ready && requested !== shown && !!reqEntry?.available && s.cache[requested]?.status !== "error",
      versions, versionsDoc: s.versionsDoc, versionId: shown, version: entry, requestedId: requested,
      unknownVersion: ready && !reqEntry ? requested : null,
      setVersion: routeSetVersion,
      graph, health, healthNote, pick: s.pick, live: s.live, diff, isLive,
      ref: (pkgId) => refFor(entry, graph, pkgId),
      sourceUrl: (pkgId, where) => sourceUrlAt(graph, pkgId, where, refFor(entry, graph, pkgId)),
      source: s.source, http: s.http,
    };
  }, [s, requested]);
}
