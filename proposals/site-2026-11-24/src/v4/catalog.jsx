// The catalog pattern from data-ui (a <data-facets> rail, a <data-views> table, a side panel on row click), rebuilt
// small in React because this round ships one self-contained file with no new dependency. Production would mount
// data-ui's elements instead (see the report).
import { useMemo, useState, useEffect } from "react";

const asList = (v) => (Array.isArray(v) ? v : [v]);

export function applyFacets(rows, facets, filters, skipKey) {
  return rows.filter((r) => facets.every((f) => {
    if (f.key === skipKey) return true;
    const sel = filters[f.key];
    if (!sel || sel.length === 0) return true;
    return asList(f.value(r)).some((v) => sel.includes(String(v)));
  }));
}

function FacetGroup({ facet, rows, sel, onChange, tabId }) {
  const [all, setAll] = useState(false);
  const counts = new Map();
  for (const r of rows) for (const v of asList(facet.value(r))) counts.set(String(v), (counts.get(String(v)) || 0) + 1);
  for (const v of sel) if (!counts.has(v)) counts.set(v, 0);
  let values = [...counts.keys()];
  values = facet.order ? facet.order(values) : values.sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  const LIMIT = facet.limit || 6;
  const shown = all ? values : values.slice(0, LIMIT).concat(values.slice(LIMIT).filter((v) => sel.includes(v)));
  const toggle = (v) => onChange(sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  return (
    <fieldset className="facet">
      <legend>
        <span>{facet.label}</span>
        {sel.length > 0 && <button className="linkish" onClick={() => onChange([])} data-testid={`facet-clear-${tabId}-${facet.key}`}>clear</button>}
      </legend>
      {shown.map((v) => (
        <label key={v} className={"facet-v" + (counts.get(v) === 0 ? " zero" : "")}>
          <input type="checkbox" checked={sel.includes(v)} onChange={() => toggle(v)} data-testid={`facet-${tabId}-${facet.key}-${v}`} />
          <span className={"facet-name " + (facet.className?.(v) || "")} title={facet.title?.(v) || v}>{facet.labelOf ? facet.labelOf(v) : v}</span>
          <span className="facet-n">{counts.get(v)}</span>
        </label>
      ))}
      {values.length > LIMIT && <button className="linkish more" onClick={() => setAll(!all)}>{all ? "show fewer" : `show all ${values.length}`}</button>}
    </fieldset>
  );
}

export function FacetRail({ rows, facets, filters, setFilters, tabId, open }) {
  return (
    <aside className={"rail" + (open ? " open" : "")} data-testid={`rail-${tabId}`}>
      {facets.map((f) => (
        <FacetGroup key={f.key} facet={f} tabId={tabId} rows={applyFacets(rows, facets, filters, f.key)} sel={filters[f.key] || []}
          onChange={(v) => setFilters({ ...filters, [f.key]: v })} />
      ))}
    </aside>
  );
}

export function Table({ rows, columns: allColumns, sort, setSort, selectedKey, onRow, groupBy, pageSize, tabId, panelOpen }) {
  const [page, setPage] = useState(0);
  // data-ui's narrow table: with the side panel open the long-text columns step aside; a column whose value is the
  // same on every filtered row (e.g. Type after a type facet) folds away, its value already shows as the filter pill.
  const folded = allColumns.filter((c) => c.foldConst && rows.length > 1 && rows.every((r) => r[c.key] === rows[0][c.key])).map((c) => c.key);
  const columns = allColumns.filter((c) => !(panelOpen && c.hideWithPanel) && !folded.includes(c.key));
  const col = columns.find((c) => c.key === sort.key) || columns[0];
  const sorted = useMemo(() => {
    const get = col.sort || ((r) => r[col.key]);
    const out = [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return c || String(a.id).localeCompare(String(b.id));
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [rows, col, sort.dir]);
  useEffect(() => setPage(0), [rows.length, sort.key, sort.dir]);
  // Keep the selected row's page in view when it is opened from elsewhere (a link, a graph node).
  useEffect(() => {
    if (!pageSize || !selectedKey) return;
    const i = sorted.findIndex((r) => r.key === selectedKey);
    if (i >= 0) setPage(Math.floor(i / pageSize));
  }, [selectedKey]);
  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  const p = Math.min(page, pages - 1);
  const visible = pageSize ? sorted.slice(p * pageSize, (p + 1) * pageSize) : sorted;
  const click = (c) => setSort(sort.key === c.key ? { key: c.key, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: c.defaultDir || "asc" });
  let lastGroup = null;
  return (
    <>
      <div className="table-box">
        <table className={"cat-table" + (panelOpen ? " narrow" : "")} data-testid={`table-${tabId}`}>
          <thead><tr>{columns.map((c) => (
            <th key={c.key} style={{ width: c.width }} className={c.num ? "num" : ""}>
              <button onClick={() => click(c)} data-testid={`sort-${tabId}-${c.key}`} title={c.title}>
                {c.label}<span className="sort-ind">{sort.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
              </button>
            </th>))}</tr></thead>
          <tbody>
            {visible.map((r) => {
              const g = groupBy?.(r);
              const head = g && g.id !== lastGroup ? (lastGroup = g.id, (
                <tr key={"g:" + g.id} className="group-row"><td colSpan={columns.length}><b>{g.label}</b>{g.blurb && <span className="muted"> · {g.blurb}</span>}</td></tr>
              )) : null;
              return [head, (
                <tr key={r.key} className={r.key === selectedKey ? "sel" : ""} onClick={() => onRow(r)} data-testid={`row-${r.key}`}>
                  {columns.map((c) => <td key={c.key} className={(c.num ? "num " : "") + (c.cls || "")}>{c.render ? c.render(r) : r[c.key]}</td>)}
                </tr>)];
            })}
            {visible.length === 0 && <tr><td colSpan={columns.length} className="empty">No rows match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      {folded.length > 0 && <p className="muted small folded">Same on every row, so not shown as a column: {folded.map((k) => `${allColumns.find((c) => c.key === k).label} = ${rows[0][k]}`).join(", ")}</p>}
      {pages > 1 && <div className="pager">
        <button className="btn" disabled={p === 0} onClick={() => setPage(p - 1)} data-testid={`page-prev-${tabId}`}>‹ Prev</button>
        <span className="muted small">{p * pageSize + 1}–{Math.min(sorted.length, (p + 1) * pageSize)} of {sorted.length}</span>
        <button className="btn" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} data-testid={`page-next-${tabId}`}>Next ›</button>
      </div>}
    </>
  );
}
