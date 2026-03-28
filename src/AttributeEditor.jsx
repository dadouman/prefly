import { useState, useEffect, useCallback } from "react";
import { supabase } from "./supabaseClient";

function getName(item) {
  return typeof item === "string" ? item : item.item || String(item);
}

// Fetch attributes from Wikipedia/Wikidata for a single item
async function fetchWikiAttributes(itemName) {
  try {
    const res = await fetch(`/api/wiki-attributes?q=${encodeURIComponent(itemName)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.attributes && Object.keys(data.attributes).length > 0
      ? { attributes: data.attributes, source: data.source, title: data.title }
      : null;
  } catch {
    return null;
  }
}

export default function AttributeEditor({ ranking }) {
  const [attributes, setAttributes] = useState({}); // { itemName: { key: value } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [expandedItem, setExpandedItem] = useState(null);
  const [searching, setSearching] = useState({}); // { itemName: true/false }
  const [searchAllProgress, setSearchAllProgress] = useState(null); // { done, total } or null

  const items = (ranking.result || []).map(getName);

  // Load existing attributes
  useEffect(() => {
    if (!supabase || !ranking.id) { setLoading(false); return; }
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
      setLoading(false);
    })();
  }, [ranking.id]);

  // Save a single item's attributes
  const saveItemAttr = useCallback(async (itemName, attrs) => {
    if (!supabase || !ranking.id) return;
    setSaving(true);
    await supabase
      .from("item_attributes")
      .upsert(
        { ranking_id: ranking.id, item_name: itemName, attributes: attrs },
        { onConflict: "ranking_id,item_name" }
      );
    setSaving(false);
  }, [ranking.id]);

  const handleChange = (itemName, key, value) => {
    const updated = { ...attributes };
    if (!updated[itemName]) updated[itemName] = {};
    updated[itemName][key] = value;
    setAttributes(updated);
    // Debounced save
    clearTimeout(handleChange._timeout);
    handleChange._timeout = setTimeout(() => saveItemAttr(itemName, updated[itemName]), 600);
  };

  const handleAddKey = (itemName) => {
    if (!newKey.trim()) return;
    handleChange(itemName, newKey.trim(), "");
    setNewKey("");
  };

  const handleRemoveKey = (itemName, key) => {
    const updated = { ...attributes };
    if (updated[itemName]) {
      delete updated[itemName][key];
      setAttributes({ ...updated });
      saveItemAttr(itemName, updated[itemName]);
    }
  };

  // Auto-search Wikipedia attributes for a single item
  const handleAutoSearch = useCallback(async (itemName) => {
    setSearching((s) => ({ ...s, [itemName]: true }));
    const result = await fetchWikiAttributes(itemName);
    if (result && result.attributes) {
      setAttributes((prev) => {
        // Replace entirely with new Wikipedia data
        const fresh = { ...result.attributes };
        if (result.source) fresh["source Wikipedia"] = result.source;
        // Save to DB
        saveItemAttr(itemName, fresh);
        return { ...prev, [itemName]: fresh };
      });
      // Auto-expand the item to show results
      setExpandedItem(itemName);
    }
    setSearching((s) => ({ ...s, [itemName]: false }));
    return result;
  }, [saveItemAttr]);

  // Auto-search attributes for ALL items
  const handleAutoSearchAll = useCallback(async () => {
    const total = items.length;
    setSearchAllProgress({ done: 0, total });
    for (let i = 0; i < items.length; i++) {
      await handleAutoSearch(items[i]);
      setSearchAllProgress({ done: i + 1, total });
    }
    setSearchAllProgress(null);
  }, [items, handleAutoSearch]);

  if (loading) return <div className="attr-loading">Chargement des attributs…</div>;

  return (
    <div className="attr-editor">
      <div className="attr-editor-header">
        <h3 className="attr-editor-title">Attributs des éléments</h3>
        <p className="attr-editor-hint">
          Ajoutez des attributs (genre, année, note…) à chaque élément.
          {saving && <span className="attr-saving"> Sauvegarde…</span>}
        </p>
        <div className="attr-auto-search-all">
          <button
            className="attr-auto-search-all-btn"
            onClick={handleAutoSearchAll}
            disabled={!!searchAllProgress}
          >
            🔍 Rechercher les attributs pour tous
          </button>
          {searchAllProgress && (
            <span className="attr-search-progress">
              {searchAllProgress.done}/{searchAllProgress.total} traités…
            </span>
          )}
        </div>
      </div>

      <div className="attr-item-list">
        {items.map((item, i) => {
          const isExpanded = expandedItem === item;
          const itemAttrs = attributes[item] || {};
          const keys = Object.keys(itemAttrs);

          return (
            <div key={i} className={`attr-item${isExpanded ? " expanded" : ""}`}>
              <div className="attr-item-header" onClick={() => setExpandedItem(isExpanded ? null : item)}>
                <span className="attr-item-rank">#{i + 1}</span>
                <span className="attr-item-name">{item}</span>
                {keys.length > 0 && (
                  <span className="attr-item-badge">{keys.length} attr.</span>
                )}
                {!isExpanded && keys.length > 0 && (
                  <span className="attr-item-preview">
                    {keys.filter(k => k !== "description" && k !== "source Wikipedia").slice(0, 3).map(k =>
                      `${k}: ${(itemAttrs[k] || "").slice(0, 30)}`
                    ).join(" · ")}
                  </span>
                )}
                {searching[item] && <span className="attr-item-searching">🔄</span>}
                <span className="attr-item-toggle">{isExpanded ? "▾" : "▸"}</span>
              </div>

              {isExpanded && (
                <div className="attr-item-body">
                  <div className="attr-auto-search">
                    <button
                      className="attr-auto-search-btn"
                      onClick={(e) => { e.stopPropagation(); handleAutoSearch(item); }}
                      disabled={searching[item]}
                    >
                      {searching[item] ? "🔄 Recherche…" : "🔍 Rechercher sur Wikipedia"}
                    </button>
                  </div>
                  {keys.map((key) => (
                    <div key={key} className="attr-field">
                      <span className="attr-field-key">{key}</span>
                      <input
                        type="text"
                        value={itemAttrs[key]}
                        onChange={(e) => handleChange(item, key, e.target.value)}
                        className="attr-field-value"
                        placeholder="Valeur…"
                      />
                      <button
                        className="attr-field-remove"
                        onClick={() => handleRemoveKey(item, key)}
                        title="Supprimer"
                      >✕</button>
                    </div>
                  ))}
                  <div className="attr-add-field">
                    <input
                      type="text"
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddKey(item)}
                      placeholder="Nouvel attribut…"
                      className="attr-add-input"
                    />
                    <button className="attr-add-btn" onClick={() => handleAddKey(item)} disabled={!newKey.trim()}>
                      + Ajouter
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
