import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { getUserRankings, deleteRanking } from "./rankingService";
import CSVImport from "./CSVImport";

export default function HistoryPanel({ onBack, onViewRanking, onRedoRanking }) {
  const { user } = useAuth();
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ mode: "all", search: "" });
  const [showCSVImport, setShowCSVImport] = useState(false);

  const loadRankings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUserRankings(user?.id);
      setRankings(data);
    } catch {
      setRankings([]);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadRankings(); }, [loadRankings]);

  const handleDelete = async (id) => {
    try {
      await deleteRanking(id, user?.id);
      setRankings((prev) => prev.filter((r) => r.id !== id));
    } catch { /* ignore */ }
  };

  const filtered = rankings.filter((r) => {
    if (filter.mode !== "all" && r.mode !== filter.mode) return false;
    if (filter.search && !r.list_name.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const formatDate = (iso) => {
    const d = new Date(iso);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const getTopItems = (result) => {
    if (!result || !Array.isArray(result)) return [];
    return result.slice(0, 3);
  };

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 640 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Vos classements</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>Historique</h2>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <input
          type="text"
          placeholder="Rechercher une liste…"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          className="history-search"
        />
        <div className="history-mode-filter">
          {[["all", "Tous"], ["classic", "📊 Classement"], ["bracket", "⚔ Bracket"]].map(([val, label]) => (
            <button
              key={val}
              className={`history-filter-btn${filter.mode === val ? " active" : ""}`}
              onClick={() => setFilter((f) => ({ ...f, mode: val }))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="history-loading">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="history-empty">
          <p>Aucun classement trouvé</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
            {rankings.length === 0
              ? "Complétez votre premier classement pour le retrouver ici !"
              : "Essayez d'ajuster vos filtres."}
          </p>
        </div>
      ) : (
        <div className="history-list">
          {filtered.map((r) => {
            const top = getTopItems(r.result);
            return (
              <div key={r.id} className="history-card">
                <div className="history-card-header">
                  <div className="history-card-info">
                    <span className="history-card-mode">
                      {r.mode === "bracket" ? "⚔" : "📊"}
                    </span>
                    <div>
                      <h3 className="history-card-name">{r.list_name}</h3>
                      <p className="history-card-date">{formatDate(r.created_at)}</p>
                    </div>
                  </div>
                  <div className="history-card-stats">
                    <span className="badge">{r.items?.length || "?"} éléments</span>
                    <span className="badge">{r.comparisons_count} duels</span>
                  </div>
                </div>

                {/* Podium */}
                {top.length > 0 && (
                  <div className="history-podium">
                    {top.map((item, i) => (
                      <div key={i} className="history-podium-item">
                        <span className="history-podium-medal">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                        </span>
                        <span className="history-podium-name">
                          {typeof item === "string" ? item : item.item || item}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="history-card-actions">
                  <button
                    className="btn-ghost"
                    onClick={() => onViewRanking(r)}
                    style={{ fontSize: "0.75rem", padding: "0.4rem 0.8rem" }}
                  >
                    Voir le détail
                  </button>
                  <button
                    className="btn-gold"
                    onClick={() => onRedoRanking(r)}
                    style={{ fontSize: "0.75rem", padding: "0.4rem 0.8rem" }}
                  >
                    ↻ Refaire
                  </button>
                  <button
                    className="history-delete-btn"
                    onClick={() => handleDelete(r.id)}
                    title="Supprimer ce classement"
                  >
                    🗑
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", gap: "0.8rem", marginTop: "1.5rem" }}>
        <button className="btn-ghost" onClick={onBack}>← Retour</button>
        <button className="btn-gold" onClick={() => setShowCSVImport(true)} style={{ fontSize: "0.8rem" }}>📄 Importer CSV</button>
      </div>

      {showCSVImport && (
        <CSVImport
          onClose={() => setShowCSVImport(false)}
          onImported={() => { setShowCSVImport(false); loadRankings(); }}
        />
      )}
    </div>
  );
}
