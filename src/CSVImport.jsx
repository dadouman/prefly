import { useState, useRef } from "react";
import { useAuth } from "./AuthContext";
import { saveRanking } from "./rankingService";

export default function CSVImport({ onImported, onClose }) {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null); // { listName, items }
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [listName, setListName] = useState("");

  const parseCSV = (text) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) throw new Error("Fichier vide");

    // Detect separator
    const sep = lines[0].includes(";") ? ";" : ",";

    // Parse rows (handle quoted fields)
    const rows = lines.map((line) => {
      const cells = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === sep && !inQuotes) {
          cells.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
      cells.push(current.trim());
      return cells;
    });

    // Detect if first row is a header (contains "rang", "rank", "nom", "name", "#")
    const headerKeywords = ["rang", "rank", "nom", "name", "item", "#", "position", "titre", "title"];
    const firstRow = rows[0].map((c) => c.toLowerCase());
    const hasHeader = firstRow.some((c) => headerKeywords.includes(c));

    const dataRows = hasHeader ? rows.slice(1) : rows;

    // Determine which column has the item name
    // If 1 column: it's the item name (ranked by row order)
    // If 2+ columns: look for a numeric column (rank) and text column (name)
    if (dataRows.length === 0) throw new Error("Aucune donnée trouvée");

    let items;
    if (dataRows[0].length === 1) {
      // Single column — items in order
      items = dataRows.map((r) => r[0]).filter(Boolean);
    } else {
      // Multiple columns — try to pair rank + name
      const colCount = dataRows[0].length;
      let rankCol = -1;
      let nameCol = -1;

      // Check each column: is it numeric?
      for (let c = 0; c < colCount; c++) {
        const allNumeric = dataRows.every((r) => r[c] && /^\d+$/.test(r[c]));
        if (allNumeric && rankCol === -1) {
          rankCol = c;
        } else if (nameCol === -1) {
          nameCol = c;
        }
      }

      if (nameCol === -1) nameCol = 0;

      if (rankCol !== -1) {
        // Sort by rank column
        const sorted = [...dataRows]
          .filter((r) => r[nameCol])
          .sort((a, b) => parseInt(a[rankCol]) - parseInt(b[rankCol]));
        items = sorted.map((r) => r[nameCol]);
      } else {
        // No rank column — use order as-is, pick first non-empty text column
        items = dataRows.map((r) => r[nameCol]).filter(Boolean);
      }
    }

    if (items.length === 0) throw new Error("Aucun élément trouvé dans le fichier");

    return items;
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const items = parseCSV(ev.target.result);
        const name = file.name.replace(/\.csv$/i, "").replace(/[_-]/g, " ");
        setListName(name);
        setPreview({ items });
      } catch (err) {
        setError(err.message);
        setPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);

    try {
      const saved = await saveRanking({
        userId: user?.id,
        listName: listName || "Import CSV",
        listId: null,
        mode: "classic",
        items: preview.items,
        result: preview.items,
        comparisonsCount: 0,
        durationSeconds: 0,
      });
      setSuccess(`${preview.items.length} éléments importés !`);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      if (onImported) onImported(saved);
    } catch (err) {
      setError(err.message || "Erreur lors de l'import");
    }
    setLoading(false);
  };

  return (
    <div className="csv-import-overlay" onClick={onClose}>
      <div className="csv-import-modal" onClick={(e) => e.stopPropagation()}>
        <button className="auth-close" onClick={onClose}>✕</button>

        <div style={{ textAlign: "center", marginBottom: "1.2rem" }}>
          <div className="ornament" style={{ marginBottom: "0.5rem", fontSize: "0.8rem" }}>✦ ✦ ✦</div>
          <h2 className="auth-title">Importer un classement</h2>
          <p style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "0.3rem" }}>
            Format CSV : un élément par ligne, ou colonnes rang + nom
          </p>
        </div>

        <div className="csv-import-dropzone" onClick={() => fileRef.current?.click()}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFile}
            style={{ display: "none" }}
          />
          <span style={{ fontSize: "2rem" }}>📄</span>
          <p>Cliquer pour choisir un fichier CSV</p>
          <p style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>
            .csv ou .txt — séparateur virgule ou point-virgule
          </p>
        </div>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-success">{success}</p>}

        {preview && (
          <div className="csv-import-preview">
            <div className="auth-field">
              <label className="label">Nom du classement</label>
              <input
                type="text"
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Nom du classement"
                maxLength={100}
              />
            </div>

            <p className="csv-import-count">{preview.items.length} éléments détectés</p>

            <div className="csv-import-list">
              {preview.items.slice(0, 20).map((item, i) => (
                <div key={i} className="csv-import-item">
                  <span className="csv-import-rank">#{i + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
              {preview.items.length > 20 && (
                <p style={{ textAlign: "center", fontSize: "0.75rem", color: "var(--text-faint)", padding: "0.5rem" }}>
                  … et {preview.items.length - 20} de plus
                </p>
              )}
            </div>

            <button
              className="btn-gold"
              onClick={handleImport}
              disabled={loading}
              style={{ width: "100%", marginTop: "0.8rem" }}
            >
              {loading ? "Import en cours…" : `Importer ${preview.items.length} éléments`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
