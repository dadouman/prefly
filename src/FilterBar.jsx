import { useState, useEffect, useMemo } from "react";
import { supabase } from "./supabaseClient";

export default function FilterBar({ ranking, onFilteredResult }) {
  const [attributes, setAttributes] = useState({}); // { itemName: { key: value } }
  const [filterKey, setFilterKey] = useState("");
  const [filterValue, setFilterValue] = useState("");
  const [sortKey, setSortKey] = useState("");
  const [sortDir, setSortDir] = useState("asc");

  const items = useMemo(
    () => (ranking.result || []).map((item) => (typeof item === "string" ? item : item.item || String(item))),
    [ranking]
  );

  // Load attributes for this ranking
  useEffect(() => {
    if (!supabase || !ranking.id) return;
    (async () => {
      const { data } = await supabase
        .from("item_attributes")
        .select("item_name, attributes")
        .eq("ranking_id", ranking.id);
      if (data) {
        const map = {};
        data.forEach((row) => { map[row.item_name] = row.attributes || {}; });
        setAttributes(map);
      }
    })();
  }, [ranking.id]);

  // Collect all available attribute keys
  const allKeys = useMemo(() => {
    const keys = new Set();
    Object.values(attributes).forEach((attrs) =>
      Object.keys(attrs).forEach((k) => keys.add(k))
    );
    return [...keys].sort();
  }, [attributes]);

  // Collect values for selected filter key
  const availableValues = useMemo(() => {
    if (!filterKey) return [];
    const vals = new Set();
    Object.values(attributes).forEach((attrs) => {
      if (attrs[filterKey]) vals.add(attrs[filterKey]);
    });
    return [...vals].sort();
  }, [attributes, filterKey]);

  // Apply filter + sort
  useEffect(() => {
    let filtered = [...items];

    if (filterKey && filterValue) {
      filtered = filtered.filter((item) => {
        const attrs = attributes[item];
        if (!attrs) return false;
        const val = String(attrs[filterKey] || "").toLowerCase();
        return val.includes(filterValue.toLowerCase());
      });
    }

    if (sortKey) {
      filtered.sort((a, b) => {
        const aVal = attributes[a]?.[sortKey] || "";
        const bVal = attributes[b]?.[sortKey] || "";
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDir === "asc" ? aNum - bNum : bNum - aNum;
        }
        const cmp = String(aVal).localeCompare(String(bVal));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    onFilteredResult(filtered);
  }, [filterKey, filterValue, sortKey, sortDir, items, attributes]);

  if (allKeys.length === 0) {
    return null;
  }

  return (
    <div className="filterbar">
      <div className="filterbar-row">
        <div className="filterbar-group">
          <label className="filterbar-label">Filtrer par</label>
          <select value={filterKey} onChange={(e) => { setFilterKey(e.target.value); setFilterValue(""); }} className="filterbar-select">
            <option value="">— Aucun filtre —</option>
            {allKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {filterKey && (
            <select value={filterValue} onChange={(e) => setFilterValue(e.target.value)} className="filterbar-select">
              <option value="">Toutes les valeurs</option>
              {availableValues.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          )}
        </div>

        <div className="filterbar-group">
          <label className="filterbar-label">Trier par</label>
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="filterbar-select">
            <option value="">— Rang original —</option>
            {allKeys.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          {sortKey && (
            <button className="filterbar-dir-btn" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")}>
              {sortDir === "asc" ? "↑ Croissant" : "↓ Décroissant"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
