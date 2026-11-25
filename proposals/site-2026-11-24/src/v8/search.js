// V8 "Type Search": the query model behind the Hoogle-style result list. Pure functions over a robot-sdk-graph/1
// document; every row is a real symbol from graph.uses (via the kit's signatures()), nothing is invented.
//
// Query grammar (Hoogle's, adapted to Python packages):
//   JointTrajectory            the type: what takes it, what returns it, who only imports it
//   JointTrajectory ->         functions that take it          (kit typeSearch)
//   -> JointTrajectory         functions that return one       (where to get one)
//   JointLimits -> JointTrajectory   functions that turn A into B, else two-step chains
//   robot_controllers          a package: its public API
//   tick / JointTraj           name search over types, packages and function names
//   +robot_metrics / -sim2real only / not this package (Hoogle's +package / -package scope)
import { typeSearch, matchTypes, signatures, consumersOf, producersOf, importersOf, signatureText, byId, layerIndex } from "@kit/model.js";

const ARROW = /->|→|=>/;

export function parseQuery(q, pkgIds) {
  const include = [], exclude = [], rest = [];
  for (const tok of String(q || "").trim().split(/\s+/).filter(Boolean)) {
    const m = /^([+-])([A-Za-z_]\w*)$/.exec(tok);
    if (m && pkgIds.has(m[2])) (m[1] === "+" ? include : exclude).push(m[2]);
    else rest.push(tok);
  }
  return { core: rest.join(" "), include, exclude };
}

// Rebuild a query with one package scope toggled: mode "+" (only), "-" (not), or null (drop it).
export function scopeQuery(q, pkgIds, pkg, mode) {
  const p = parseQuery(q, pkgIds);
  const inc = p.include.filter((x) => x !== pkg), exc = p.exclude.filter((x) => x !== pkg);
  if (mode === "+") inc.push(pkg);
  if (mode === "-") exc.push(pkg);
  return [p.core, ...inc.map((x) => "+" + x), ...exc.map((x) => "-" + x)].filter(Boolean).join(" ");
}

const exactType = (graph, text) => {
  const s = String(text || "").trim().toLowerCase();
  if (!s || !graph) return null;
  return graph.types.find((t) => t.id.toLowerCase() === s) || graph.types.find((t) => t.name.toLowerCase() === s) || null;
};
const exactPackage = (graph, text) => {
  const s = String(text || "").trim().toLowerCase();
  if (!s || !graph) return null;
  return graph.packages.find((p) => p.id.toLowerCase() === s || (p.pypi || "").toLowerCase() === s) || null;
};

const fn = (s) => ({ key: "fn:" + s.id, kind: "fn", sig: s, pkg: s.package });
const ty = (t) => ({ key: "type:" + t.id, kind: "type", type: t, pkg: t.package });
const pk = (p) => ({ key: "pkg:" + p.id, kind: "pkg", pkgDoc: p, pkg: p.id });
const ch = (c) => ({ key: `chain:${c.first.id}>${c.via}>${c.second.id}`, kind: "chain", chain: c, pkg: c.first.package });

function pkgOrder(graph) {
  const pkgs = byId(graph.packages);
  return (a, b) => layerIndex(pkgs[a.package]?.layer) - layerIndex(pkgs[b.package]?.layer) || a.package.localeCompare(b.package) || a.name.localeCompare(b.name);
}

// search(graph, q, { pkgIds, refGraph }) -> { kind, core, include, exclude, type?, from?, to?, pkgDoc?, sections, facets, total }
// refGraph (Live, when another version is on screen) lets a query keep its shape when its type is missing here, so the
// rows Live has can be shown as "not in this version" instead of the query silently turning into a name search.
export function search(graph, q, { pkgIds, refGraph = null } = {}) {
  const ids = pkgIds || new Set(graph.packages.map((p) => p.id));
  const { core, include, exclude } = parseQuery(q, ids);
  const res = { kind: "empty", core, include, exclude, sections: [], facets: [], total: 0 };
  if (!core && !include.length) return res;

  if (!core) {
    // "+robot_metrics" alone: those packages' public API.
    res.kind = "package";
    const sigs = signatures(graph).filter((s) => include.includes(s.package)).sort(pkgOrder(graph));
    res.sections.push({ id: "api", title: "Public API", items: sigs.map(fn) });
  } else if (ARROW.test(core)) {
    const r = typeSearch(graph, core);
    const [l, rr] = core.split(/\s*(?:->|→|=>)\s*/);
    res.kind = "flow";
    res.leftText = (l || "").trim(); res.rightText = (rr || "").trim();
    res.from = r.from?.length ? r.from : res.leftText ? [] : null;
    res.to = r.to?.length ? r.to : res.rightText ? [] : null;
    if (refGraph) { // name the side even when this version lacks the type
      if (res.from && !res.from.length) { const t = exactType(refGraph, res.leftText); if (t) { res.from = [t]; res.fromMissing = true; } }
      if (res.to && !res.to.length) { const t = exactType(refGraph, res.rightText); if (t) { res.to = [t]; res.toMissing = true; } }
    }
    const fns = r.functions.map(fn);
    if (res.from && !res.to) res.sections.push({ id: "takes", role: "takes", items: fns });
    else if (res.to && !res.from) res.sections.push({ id: "returns", role: "returns", items: fns });
    else {
      res.sections.push({ id: "both", role: "both", items: fns });
      if (r.chains.length) res.sections.push({ id: "chains", role: "chains", items: r.chains.map(ch) });
    }
    // Hoogle never answers "no results" flatly: when A -> B has nothing, say what each side does have.
    if (res.from && res.to && !fns.length && !r.chains.length) {
      const takeA = (res.from || []).flatMap((t) => consumersOf(graph, t.id));
      const giveB = (res.to || []).flatMap((t) => producersOf(graph, t.id));
      res.fallback = { takeA: new Set(takeA.map((s) => s.id)).size, giveB: new Set(giveB.map((s) => s.id)).size };
    }
  } else {
    const t = exactType(graph, core) || (refGraph && exactType(refGraph, core));
    const p = !t && (exactPackage(graph, core) || (refGraph && exactPackage(refGraph, core)));
    if (t) {
      res.kind = "type"; res.type = t; res.typeMissing = !graph.types.some((x) => x.id === t.id);
      res.sections.push({ id: "takes", role: "takes", items: consumersOf(graph, t.id).map(fn) });
      res.sections.push({ id: "returns", role: "returns", items: producersOf(graph, t.id).map(fn) });
      res.sections.push({ id: "imports", role: "imports", items: importersOf(graph, t.id).map(fn) });
    } else if (p) {
      res.kind = "package"; res.pkgDoc = p; res.pkgMissing = !graph.packages.some((x) => x.id === p.id);
      const sigs = signatures(graph).filter((s) => s.package === p.id).sort(pkgOrder(graph));
      res.sections.push({ id: "api", role: "api", items: sigs.map(fn) });
    } else {
      res.kind = "name";
      const s = core.toLowerCase();
      const types = matchTypes(graph, core);
      const pkgs = graph.packages.filter((x) => x.id.toLowerCase().includes(s) || (x.pypi || "").toLowerCase().includes(s));
      const fns = signatures(graph).filter((x) => x.name.toLowerCase().includes(s) || x.symbol.toLowerCase().endsWith(s))
        .sort((a, b) => rank(a, s) - rank(b, s) || pkgOrder(graph)(a, b));
      if (types.length) res.sections.push({ id: "types", role: "types", items: types.map(ty) });
      if (pkgs.length) res.sections.push({ id: "packages", role: "packages", items: pkgs.map(pk) });
      res.sections.push({ id: "functions", role: "functions", items: fns.map(fn) });
    }
  }

  // Facets count before the +/- scope is applied (Hoogle lists every package in the unscoped results).
  const counts = new Map();
  for (const sec of res.sections) for (const it of sec.items) if (it.pkg) counts.set(it.pkg, (counts.get(it.pkg) || 0) + (it.kind === "fn" || it.kind === "chain" ? 1 : 0));
  const pkgs = byId(graph.packages);
  res.facets = [...counts].map(([id, n]) => ({ id, n })).filter((f) => f.n > 0 || include.includes(f.id))
    .sort((a, b) => b.n - a.n || layerIndex(pkgs[a.id]?.layer) - layerIndex(pkgs[b.id]?.layer) || a.id.localeCompare(b.id));
  for (const id of include) if (!res.facets.some((f) => f.id === id)) res.facets.push({ id, n: 0 });

  const keep = (it) => !it.pkg || ((!include.length || include.includes(it.pkg)) && !exclude.includes(it.pkg));
  for (const sec of res.sections) { sec.all = sec.items.length; sec.items = sec.items.filter(keep); }
  res.total = res.sections.reduce((n, s) => n + s.items.length, 0);
  return res;
}

// Name match quality for function-name search: exact last segment, then prefix, then substring.
function rank(sig, s) {
  const last = sig.name.split(".").pop().toLowerCase();
  if (last === s || sig.name.toLowerCase() === s) return 0;
  if (last.startsWith(s)) return 1;
  return 2;
}

// Off Live: mark each row against the same query on Live. Rows Live has that this version lacks come back as
// `ghosts` ("not in this version — new on Live"); rows only here are `only`; a function whose signature differs
// carries `liveSig`. WHY per row and not only a banner: the brief's "results carry 'not in this version' / 'new
// since' annotations from diff" — the answer to "what can I do with it" changes per version, so each row says so.
export function annotate(res, liveRes, graph, liveGraph) {
  if (!liveRes) return res;
  const out = { ...res, sections: res.sections.map((s) => ({ ...s, items: s.items.map((it) => ({ ...it })) })) };
  for (const ls of liveRes.sections) if (!out.sections.some((s) => s.id === ls.id)) out.sections.push({ id: ls.id, role: ls.role, items: [], all: 0 });
  let ghosts = 0, only = 0;
  for (const sec of out.sections) {
    const ls = liveRes.sections.find((s) => s.id === sec.id);
    const liveKeys = new Map((ls?.items || []).map((it) => [it.key, it]));
    const here = new Set(sec.items.map((it) => it.key));
    for (const it of sec.items) {
      const l = liveKeys.get(it.key);
      if (!l) { it.only = true; only++; }
      else if (it.kind === "fn") {
        const a = signatureText(graph, it.sig), b = signatureText(liveGraph, l.sig);
        if (a !== b) it.liveSig = b;
        if (l.sig.where !== it.sig.where) it.liveWhere = l.sig.where;
      }
    }
    sec.ghosts = (ls?.items || []).filter((it) => !here.has(it.key));
    ghosts += sec.ghosts.length;
  }
  out.ghostTotal = ghosts; out.onlyTotal = only;
  return out;
}
