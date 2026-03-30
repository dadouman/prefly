import { useState, useEffect, useCallback } from "react";
import {
  getPrebuiltLists,
  addPrebuiltList,
  updatePrebuiltList,
  deletePrebuiltList,
  exportListsJSON,
  resetToRemoteLists,
  isAdmin,
  toggleListVisibility,
} from "./storage";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

// Fetch attributes from Wikipedia/Wikidata for a single item
async function fetchWikiAttributes(itemName) {
  try {
    const res = await fetch(`/api/wiki-attributes?q=${encodeURIComponent(itemName)}&v=6`, {
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

function AdminLogin({ onLogin, onBack }) {
  const { user, isAuthenticated } = useAuth();
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setChecking(false);
      setDenied(true);
      return;
    }
    isAdmin().then((ok) => {
      if (ok) onLogin();
      else setDenied(true);
      setChecking(false);
    });
  }, [isAuthenticated, onLogin]);

  if (checking) {
    return (
      <div className="fade" style={{ width: "100%", maxWidth: 420, textAlign: "center", padding: "3rem 0" }}>
        <p style={{ color: "var(--text-dim)" }}>Vérification des droits…</p>
      </div>
    );
  }

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 420 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>⚙ ⚙ ⚙</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Administration</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}>Accès refusé</h2>
      </div>
      <div className="card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.2rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.85rem", color: "var(--text-dim)", lineHeight: 1.6 }}>
          {!isAuthenticated
            ? "Vous devez être connecté avec un compte administrateur."
            : "Votre compte n'a pas les droits administrateur."}
        </p>
        <button className="btn-ghost" onClick={onBack} style={{ width: "100%" }}>
          ← Retour
        </button>
      </div>
    </div>
  );
}

// Format an item label for preview (mirrors App.jsx ItemLabel logic)
function PreviewItemLabel({ item, format }) {
  if (format === "discography") {
    const first = item.indexOf(" - ");
    if (first !== -1) {
      const song = item.substring(0, first);
      const rest = item.substring(first + 3);
      const ld = rest.lastIndexOf(" - ");
      const albumYear = ld !== -1
        ? rest.substring(0, ld) + " · " + rest.substring(ld + 3)
        : rest;
      return (
        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.35em" }}>
          <span className="disco-song" style={{ fontWeight: 700 }}>{song}</span>
          <span className="disco-meta" style={{ fontSize: "0.6em", color: "#a0936b" }}>{albumYear}</span>
        </span>
      );
    }
  }
  return <>{item}</>;
}

function ListEditor({ list, onSave, onCancel }) {
  const [name, setName] = useState(list?.name || "");
  const [description, setDescription] = useState(list?.description || "");
  const [itemsText, setItemsText] = useState(list?.items?.join("\n") || "");
  const [format, setFormat] = useState(list?.format || "");
  const [showPreview, setShowPreview] = useState(false);
  const [itemAttributes, setItemAttributes] = useState(list?.itemAttributes || {}); // { itemName: { key: value } }
  const [showAttrs, setShowAttrs] = useState(false);
  const [searchingAll, setSearchingAll] = useState(null); // { done, total } | null
  const [searchingItem, setSearchingItem] = useState({}); // { itemName: true }
  const [expandedItem, setExpandedItem] = useState(null);
  const [newAttrKey, setNewAttrKey] = useState("");
  const [newColName, setNewColName] = useState("");

  const items = itemsText.split("\n").map((l) => l.trim()).filter(Boolean);
  const itemCount = items.length;

  // Auto-format: clean up items for consistency
  const handleAutoFormat = () => {
    const lines = itemsText.split("\n").map((l) => l.trim()).filter(Boolean);
    const formatted = lines.map((line) => {
      let clean;
      if (format === "discography") {
        // In discography mode, tabs become " - " separators
        clean = line.replace(/\t+/g, " - ").replace(/ {2,}/g, " ").trim();
        // Normalize other separators: replace " – ", " — ", " | " with " - "
        clean = clean
          .replace(/\s*[–—]\s*/g, " - ")
          .replace(/\s*\|\s*/g, " - ");
        // Capitalize first letter of each segment
        clean = clean.split(" - ").map((seg) =>
          seg.trim().replace(/^\w/, (c) => c.toUpperCase())
        ).join(" - ");
        return clean;
      }
      // Default: capitalize first letter
      return clean.replace(/^\w/, (c) => c.toUpperCase());
    });
    setItemsText(formatted.join("\n"));
  };

  const handleSave = () => {
    if (!name.trim() || items.length < 2) return;
    const data = { name: name.trim(), description: description.trim(), items };
    if (format) data.format = format;
    // Only include itemAttributes if there are any
    if (Object.keys(itemAttributes).length > 0) {
      data.itemAttributes = itemAttributes;
    }
    onSave(data);
  };

  // Search Wikipedia attributes for one item
  const handleSearchItem = useCallback(async (itemName) => {
    setSearchingItem((s) => ({ ...s, [itemName]: true }));
    const result = await fetchWikiAttributes(itemName);
    if (result && result.attributes) {
      setItemAttributes((prev) => {
        const fresh = { ...result.attributes };
        if (result.source) fresh["source Wikipedia"] = result.source;
        return { ...prev, [itemName]: fresh };
      });
    }
    setSearchingItem((s) => ({ ...s, [itemName]: false }));
  }, []);

  // Search Wikipedia attributes for ALL items
  const handleSearchAll = useCallback(async () => {
    const currentItems = itemsText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (currentItems.length === 0) return;
    setSearchingAll({ done: 0, total: currentItems.length });
    for (let i = 0; i < currentItems.length; i++) {
      await handleSearchItem(currentItems[i]);
      setSearchingAll({ done: i + 1, total: currentItems.length });
    }
    setSearchingAll(null);
    setShowAttrs(true);
  }, [itemsText, handleSearchItem]);

  // Manual attribute edit
  const handleAttrChange = (itemName, key, value) => {
    setItemAttributes((prev) => ({
      ...prev,
      [itemName]: { ...(prev[itemName] || {}), [key]: value },
    }));
  };

  const handleRemoveAttr = (itemName, key) => {
    setItemAttributes((prev) => {
      const updated = { ...(prev[itemName] || {}) };
      delete updated[key];
      const next = { ...prev, [itemName]: updated };
      if (Object.keys(updated).length === 0) delete next[itemName];
      return next;
    });
  };

  const handleAddAttr = (itemName) => {
    if (!newAttrKey.trim()) return;
    handleAttrChange(itemName, newAttrKey.trim(), "");
    setNewAttrKey("");
  };

  // Add a new column (attribute key) to all items
  const handleAddColumn = () => {
    if (!newColName.trim() || allAttrKeys.includes(newColName.trim())) return;
    const key = newColName.trim();
    setItemAttributes((prev) => {
      const next = { ...prev };
      items.forEach((item) => {
        next[item] = { ...(next[item] || {}), [key]: "" };
      });
      return next;
    });
    setNewColName("");
  };

  // Remove an entire column (attribute key) from all items
  const handleRemoveColumn = (key) => {
    setItemAttributes((prev) => {
      const next = {};
      for (const [item, attrs] of Object.entries(prev)) {
        const updated = { ...attrs };
        delete updated[key];
        if (Object.keys(updated).length > 0) next[item] = updated;
      }
      return next;
    });
  };

  const attrCount = Object.values(itemAttributes).reduce((sum, a) => sum + Object.keys(a).length, 0);
  const itemsWithAttrs = Object.keys(itemAttributes).filter((k) => Object.keys(itemAttributes[k] || {}).length > 0).length;
  const allAttrKeys = [...new Set(
    Object.values(itemAttributes).flatMap((a) => Object.keys(a || {}))
  )].filter((k) => k !== "description" && k !== "source Wikipedia");

  return (
    <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.2rem" }}>
      <div>
        <span className="label">Nom de la liste</span>
        <input
          className="admin-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Films 2025"
          autoFocus
        />
      </div>

      <div>
        <span className="label">Description (optionnelle)</span>
        <input
          className="admin-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex : Les meilleurs films de l'année"
        />
      </div>

      <div>
        <span className="label">Éléments (un par ligne)</span>
        <textarea
          value={itemsText}
          onChange={(e) => setItemsText(e.target.value)}
          placeholder={"Élément 1\nÉlément 2\nÉlément 3"}
          style={{ minHeight: 160 }}
        />
        {itemCount > 0 && (
          <p style={{ marginTop: "0.4rem", fontSize: "0.72rem", color: "rgba(201,162,39,0.55)", letterSpacing: "0.05em" }}>
            {itemCount} élément{itemCount > 1 ? "s" : ""}
            {itemCount < 2 && <span style={{ color: "#c0392b" }}> · minimum 2 requis</span>}
          </p>
        )}
      </div>

      {/* ─── FORMAT & MISE EN FORME ─── */}
      <div className="admin-format-section">
        <div style={{ display: "flex", alignItems: "center", gap: "0.8rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <span className="label">Format d'affichage</span>
            <select
              className="admin-input"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              style={{ cursor: "pointer" }}
            >
              <option value="">Standard</option>
              <option value="discography">Discographie (Titre - Album - Année)</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", paddingTop: "1.2rem" }}>
            <button
              className="btn-ghost"
              onClick={handleAutoFormat}
              disabled={itemCount === 0}
              style={{ fontSize: "0.72rem", padding: "0.4rem 0.7rem" }}
              title="Nettoyer et uniformiser l'écriture des éléments"
            >
              ✨ Mise en forme
            </button>
            <button
              className={`btn-ghost${showPreview ? " active" : ""}`}
              onClick={() => setShowPreview(!showPreview)}
              disabled={itemCount === 0}
              style={{ fontSize: "0.72rem", padding: "0.4rem 0.7rem" }}
            >
              {showPreview ? "✕ Fermer" : "👁 Prévisualiser"}
            </button>
          </div>
        </div>

        {format === "discography" && (
          <p style={{ fontSize: "0.68rem", color: "var(--text-faint)", lineHeight: 1.6, marginTop: "0.4rem" }}>
            Format attendu : <code style={{ background: "rgba(184,134,11,0.08)", padding: "0.15em 0.4em", borderRadius: 3, fontSize: "0.92em" }}>Titre - Album - Année</code>
            <br />Le bouton <strong>Mise en forme</strong> uniformise les séparateurs (–, —, |) en « - ».
          </p>
        )}
      </div>

      {/* ─── PREVIEW SECTION ─── */}
      {showPreview && itemCount > 0 && (
        <div className="admin-preview-section">
          <div className="admin-preview-header">
            <span className="label" style={{ margin: 0 }}>👁 Aperçu des cartes</span>
            <span className="admin-preview-badge">
              {Math.min(4, itemCount)} / {itemCount} premiers éléments
            </span>
          </div>
          <div className="admin-preview-grid">
            {items.slice(0, 4).map((item, i) => (
              <div key={i} className="admin-preview-card">
                <div className={`admin-preview-text${format === "discography" ? " disco" : ""}`}>
                  <PreviewItemLabel item={item} format={format} />
                </div>
                <div className="admin-preview-hint">Élément {i + 1}</div>
              </div>
            ))}
          </div>
          {itemCount > 4 && (
            <p style={{ textAlign: "center", fontSize: "0.68rem", color: "var(--text-faint)", marginTop: "0.5rem" }}>
              … et {itemCount - 4} autre{itemCount - 4 > 1 ? "s" : ""} élément{itemCount - 4 > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}

      {/* ─── ATTRIBUTE TABLE SECTION ─── */}
      {itemCount >= 2 && (
        <div className="admin-attr-section">
          <div className="admin-attr-header">
            <span className="label" style={{ margin: 0 }}>🔍 Attributs Wikipedia</span>
            <div className="admin-attr-actions">
              <button
                className="btn-gold"
                onClick={handleSearchAll}
                disabled={!!searchingAll}
                style={{ fontSize: "0.75rem", padding: "0.4rem 0.85rem" }}
              >
                {searchingAll
                  ? `🔄 ${searchingAll.done}/${searchingAll.total}…`
                  : "🔍 Rechercher pour tous"}
              </button>
              {attrCount > 0 && (
                <button
                  className="btn-ghost"
                  onClick={() => setShowAttrs(!showAttrs)}
                  style={{ fontSize: "0.72rem", padding: "0.35rem 0.7rem" }}
                >
                  {showAttrs ? "▾ Masquer tableau" : "▸ Voir tableau"}
                </button>
              )}
            </div>
          </div>

          {/* ─── COVERAGE STATS ─── */}
          {attrCount > 0 && (
            <div className="admin-attr-stats-row">
              <span className="admin-attr-stat-chip">{itemsWithAttrs}/{itemCount} enrichis</span>
              <span className="admin-attr-stat-chip">{attrCount} valeurs</span>
              <span className="admin-attr-stat-chip">{allAttrKeys.length} colonnes</span>
              <div className="admin-attr-coverage-bar">
                <div className="admin-attr-coverage-fill" style={{ width: `${Math.round((itemsWithAttrs / itemCount) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* ─── TABLE VIEW ─── */}
          {showAttrs && items.length > 0 && (
            <div className="admin-attr-table-wrap">
              <table className="admin-attr-table">
                <thead>
                  <tr>
                    <th className="admin-attr-th-item">Élément</th>
                    {allAttrKeys.map((key) => (
                      <th key={key} className="admin-attr-th">
                        <div className="admin-attr-th-inner">
                          <span className="admin-attr-th-label">{key}</span>
                          <button
                            className="admin-attr-th-remove"
                            onClick={() => handleRemoveColumn(key)}
                            title={`Supprimer la colonne "${key}"`}
                          >✕</button>
                        </div>
                      </th>
                    ))}
                    <th className="admin-attr-th-add">
                      <div className="admin-attr-add-col">
                        <input
                          type="text"
                          className="admin-attr-add-col-input"
                          value={newColName}
                          onChange={(e) => setNewColName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
                          placeholder="+ colonne…"
                        />
                        <button
                          className="admin-attr-add-col-btn"
                          onClick={handleAddColumn}
                          disabled={!newColName.trim() || allAttrKeys.includes(newColName.trim())}
                        >+</button>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const attrs = itemAttributes[item] || {};
                    const isSearching = searchingItem[item];
                    return (
                      <tr key={item} className={isSearching ? "admin-attr-row-searching" : ""}>
                        <td className="admin-attr-td-item">
                          <div className="admin-attr-td-item-inner">
                            <span className="admin-attr-item-name">{item}</span>
                            <button
                              className="admin-attr-search-btn"
                              onClick={() => handleSearchItem(item)}
                              disabled={isSearching}
                              title="Rechercher sur Wikipedia"
                            >
                              {isSearching ? <span className="admin-attr-spinner" /> : "🔍"}
                            </button>
                          </div>
                        </td>
                        {allAttrKeys.map((key) => (
                          <td key={key} className="admin-attr-td">
                            <input
                              type="text"
                              className={`admin-attr-cell${attrs[key] ? " filled" : ""}`}
                              value={attrs[key] || ""}
                              onChange={(e) => handleAttrChange(item, key, e.target.value)}
                              placeholder="—"
                            />
                          </td>
                        ))}
                        <td className="admin-attr-td-empty" />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.8rem" }}>
        <button
          className="btn-gold"
          onClick={handleSave}
          disabled={!name.trim() || itemCount < 2}
          style={{ flex: 1 }}
        >
          {list ? "Enregistrer" : "Créer"} ✓
        </button>
        <button className="btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export default function AdminPanel({ onBack }) {
  const [authed, setAuthed] = useState(false);
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | list id
  const [confirmDelete, setConfirmDelete] = useState(null);

  useEffect(() => {
    getPrebuiltLists().then(setLists);
  }, []);

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} onBack={onBack} />;
  }

  const editingList = editing && editing !== "new" ? lists.find((l) => l.id === editing) : null;

  // Sync item attributes to ALL existing rankings linked to this list
  const syncAttributesToRankings = async (listId, itemAttributes) => {
    if (!supabase || !listId) return;
    try {
      // Find all rankings linked to this list
      const { data: rankings, error } = await supabase
        .from("rankings")
        .select("id")
        .eq("list_id", listId);
      if (error || !rankings || rankings.length === 0) return;

      // Build upsert rows: for each ranking, insert/update all item attributes
      const rows = [];
      for (const ranking of rankings) {
        for (const [itemName, attrs] of Object.entries(itemAttributes)) {
          if (attrs && Object.keys(attrs).length > 0) {
            rows.push({ ranking_id: ranking.id, item_name: itemName, attributes: attrs });
          }
        }
      }
      if (rows.length > 0) {
        await supabase.from("item_attributes").upsert(rows, { onConflict: "ranking_id,item_name" });
      }
    } catch { /* silent — admin will see attributes locally regardless */ }
  };

  // Sync list name change to all linked rankings
  const syncListNameToRankings = async (listId, newName) => {
    if (!supabase || !listId || !newName) return;
    try {
      await supabase
        .from("rankings")
        .update({ list_name: newName })
        .eq("list_id", listId);
    } catch { /* silent */ }
  };

  const handleSaveNew = async (data) => {
    const updatedLists = await addPrebuiltList(data);
    setLists(updatedLists);
    // New list — sync attributes if any (the new list just got an ID)
    if (data.itemAttributes && Object.keys(data.itemAttributes).length > 0) {
      const newList = updatedLists[updatedLists.length - 1];
      await syncAttributesToRankings(newList.id, data.itemAttributes);
    }
    setEditing(null);
  };

  const handleSaveEdit = async (data) => {
    setLists(await updatePrebuiltList(editing, data));
    // Sync all modifications to existing rankings for this list
    await syncListNameToRankings(editing, data.name);
    if (data.itemAttributes && Object.keys(data.itemAttributes).length > 0) {
      await syncAttributesToRankings(editing, data.itemAttributes);
    }
    setEditing(null);
  };

  const handleDelete = async (id) => {
    setLists(await deletePrebuiltList(id));
    setConfirmDelete(null);
  };

  const handleReset = async () => {
    await resetToRemoteLists();
    setLists(await getPrebuiltLists());
  };

  const handleToggleVisibility = async (id, currentlyPublic) => {
    setLists(await toggleListVisibility(id, !currentlyPublic));
  };

  return (
    <div className="fade" style={{ width: "100%", maxWidth: editing ? 900 : 560 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>⚙ ⚙ ⚙</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Administration</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.6rem, 5vw, 2.4rem)" }}>Listes pré-construites</h2>
        <p style={{ marginTop: "0.8rem", fontSize: "0.82rem", color: "var(--text-dim)" }}>
          Gérez les listes disponibles pour les utilisateurs.
        </p>
      </div>

      {editing ? (
        <ListEditor
          list={editingList}
          onSave={editingList ? handleSaveEdit : handleSaveNew}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginBottom: "1.5rem" }}>
            {lists.length === 0 && (
              <div className="card" style={{ padding: "2rem", textAlign: "center" }}>
                <p style={{ color: "var(--text-faint)", fontSize: "0.85rem" }}>Aucune liste créée</p>
              </div>
            )}

            {lists.map((list) => (
              <div key={list.id} className="card admin-list-card">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem", color: "var(--text)", marginBottom: "0.2rem" }}>
                    {list.name}
                  </div>
                  {list.description && (
                    <div style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: "0.3rem" }}>
                      {list.description}
                    </div>
                  )}
                  <div style={{ fontSize: "0.7rem", color: "var(--text-faint)", letterSpacing: "0.05em" }}>
                    {list.items.length} élément{list.items.length > 1 ? "s" : ""}
                    {list.itemAttributes && Object.keys(list.itemAttributes).length > 0 && (
                      <span style={{ color: "var(--gold)", marginLeft: "0.4rem" }}>
                        · 🔍 {Object.keys(list.itemAttributes).length} avec attributs
                      </span>
                    )}
                    <span style={{ margin: "0 0.4rem", opacity: 0.4 }}>·</span>
                    {list.isPublic
                      ? <span style={{ color: "#27ae60" }}>🌐 Public</span>
                      : <span style={{ color: "#95a5a6" }}>🔒 Privé</span>
                    }
                    <span style={{ margin: "0 0.4rem", opacity: 0.4 }}>·</span>
                    {list.items.slice(0, 3).join(", ")}
                    {list.items.length > 3 && "…"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button
                    className={`admin-action-btn${list.isPublic ? " active" : ""}`}
                    onClick={() => handleToggleVisibility(list.id, list.isPublic)}
                    title={list.isPublic ? "Rendre privé" : "Rendre public"}
                    aria-label={list.isPublic ? "Rendre privé" : "Rendre public"}
                    style={list.isPublic ? { color: "#27ae60", borderColor: "#27ae60" } : {}}
                  >
                    {list.isPublic ? "🌐" : "🔒"}
                  </button>
                  <button className="admin-action-btn edit" onClick={() => setEditing(list.id)} title="Modifier" aria-label="Modifier la liste">
                    ✎
                  </button>
                  {confirmDelete === list.id ? (
                    <button className="admin-action-btn delete confirm" onClick={() => handleDelete(list.id)} title="Confirmer la suppression" aria-label="Confirmer la suppression">
                      ✓
                    </button>
                  ) : (
                    <button className="admin-action-btn delete" onClick={() => setConfirmDelete(list.id)} title="Supprimer" aria-label="Supprimer la liste">
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn-gold" onClick={() => setEditing("new")}>
              + Nouvelle liste
            </button>
            <button className="btn-ghost" onClick={exportListsJSON}>
              ↓ Exporter JSON
            </button>
            <button className="btn-ghost" onClick={handleReset}>
              ↺ Réinitialiser
            </button>
            <button className="btn-ghost" onClick={onBack}>
              ← Retour
            </button>
          </div>

          <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "var(--text-faint)", textAlign: "center", lineHeight: 1.7, letterSpacing: "0.03em" }}>
            Les modifications sont enregistrées dans Supabase et visibles par tous les utilisateurs.
          </p>
        </>
      )}
    </div>
  );
}
