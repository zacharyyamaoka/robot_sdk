// The one data door every variant uses. WHY: the linter lane is replacing the seed graph.json right now (same schema,
// robot-sdk-graph/1); a prototype must pick the real file up with no code change. So: fetch it at runtime, with a
// ?graph=<url> override (the swap test uses it), and fall back to the copy embedded at build time when there is no
// server (file://, e.g. inside the babble gallery's iframe).
import { useEffect, useState } from "react";
import seedGraph from "@repo/site/data/graph.json";
import seedPick from "@repo/site/data/pick_and_place.json";

// WHY a meta override: the deployed site (gh-pages) serves its data beside index.html, not three folders up; the deploy
// step sets <meta name="robot-sdk-data" content="data/">. Default: the repo layout the proposals are served from.
const DATA_BASE = (typeof document !== "undefined" && document.querySelector('meta[name="robot-sdk-data"]')?.content) || "../../../site/data/";
const GRAPH_URL = DATA_BASE + "graph.json";
const PICK_URL = DATA_BASE + "pick_and_place.json";

async function fetchJson(url) {
  const r = await fetch(new URL(url, location.href), { cache: "no-store" });
  if (!r.ok) throw new Error(r.status + " " + url);
  return r.json();
}

export async function loadData() {
  const params = new URLSearchParams(location.search);
  const override = params.get("graph");
  const http = location.protocol.startsWith("http");
  let graph = seedGraph, graphSource = "embedded at build", graphUrl = null;
  if (http || override) {
    const url = override || GRAPH_URL;
    try {
      const g = await fetchJson(url);
      if (!String(g.schema || "").startsWith("robot-sdk-graph/")) throw new Error("not robot-sdk-graph: " + g.schema);
      graph = g; graphSource = override ? "override" : "runtime"; graphUrl = url;
    } catch (e) { console.warn("graph.json: using the build-time copy:", e.message); }
  }
  let pick = seedPick;
  if (http) { try { pick = await fetchJson(PICK_URL); } catch (e) { /* build-time copy */ } }
  return { graph, graphSource, graphUrl, pick };
}

export function useData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => { loadData().then(setData, setError); }, []);
  return { data, error };
}

// Tiny hash router for the multi-page variants: "#/types/JointTrajectory" -> ["types", "JointTrajectory"].
export function useHashRoute(defaultRoute = "") {
  const read = () => (location.hash.replace(/^#\/?/, "") || defaultRoute).split("/").map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (...parts) => { location.hash = "#/" + parts.filter((p) => p != null && p !== "").map(encodeURIComponent).join("/"); };
  return [route, go];
}
