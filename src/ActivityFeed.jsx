import { useState, useEffect, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { getRecentPublicRankings } from "./rankingService";

export default function ActivityFeed({ onBack, onChallenge }) {
  const navigate = useNavigate();
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ mode: "all", search: "", list: null });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getRecentPublicRankings({ limit: 100 });
        setRankings(data);
      } catch {
        setRankings([]);
      }
      setLoading(false);
    })();
  }, []);

  // Extract unique list names sorted by frequency
  const listTags = useMemo(() => {
    const counts = {};
    for (const r of rankings) {
      counts[r.list_name] = (counts[r.list_name] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [rankings]);

  const filtered = rankings.filter((r) => {
    if (filter.mode !== "all" && r.mode !== filter.mode) return false;
    if (filter.list && r.list_name !== filter.list) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      const pseudo = r.profiles?.pseudo?.toLowerCase() || "";
      const listName = r.list_name?.toLowerCase() || "";
      if (!pseudo.includes(q) && !listName.includes(q)) return false;
    }
    return true;
  });

  const formatDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins} min`;
    if (hours < 24) return `il y a ${hours}h`;
    if (days < 7) return `il y a ${days}j`;
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  const getTopItems = (result) => {
    if (!result || !Array.isArray(result)) return [];
    return result.slice(0, 3);
  };

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 720 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Actualités</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>Derniers Classements</h2>
        <p style={{ marginTop: "0.6rem", color: "var(--text-dim)", fontSize: "0.82rem" }}>
          Tous les classements publics de la communauté
        </p>
      </div>

      {/* Filters */}
      <div className="history-filters">
        <input
          type="text"
          placeholder="Rechercher par pseudo ou liste…"
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

      {/* List tags — quick filter by list name */}
      {!loading && listTags.length > 1 && (
        <div className="activity-list-tags">
          <button
            className={`activity-list-tag${filter.list === null ? " active" : ""}`}
            onClick={() => setFilter((f) => ({ ...f, list: null }))}
          >
            Toutes les listes
          </button>
          {listTags.map((t) => (
            <button
              key={t.name}
              className={`activity-list-tag${filter.list === t.name ? " active" : ""}`}
              onClick={() => setFilter((f) => ({ ...f, list: f.list === t.name ? null : t.name }))}
            >
              {t.name} <span className="activity-list-tag-count">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* CTA Banner */}
      {filter.list && onChallenge && (
        <div className="activity-cta">
          <div className="activity-cta-text">
            <span className="activity-cta-emoji">🔥</span>
            <div>
              <p className="activity-cta-title">
                {filtered.length} personne{filtered.length > 1 ? "s ont" : " a"} classé <strong>{filter.list}</strong>
              </p>
              <p className="activity-cta-sub">Et toi, quel serait ton classement ? Prouve-le !</p>
            </div>
          </div>
          <button
            className="activity-cta-btn"
            onClick={() => {
              const ref = filtered[0];
              if (ref) onChallenge(ref);
            }}
          >
            {filtered.some((r) => r.mode === "bracket")
              ? "⚔ Relever le défi"
              : "📊 Faire mon classement"}
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="history-loading">Chargement…</div>
      ) : filtered.length === 0 ? (
        <div className="history-empty">
          <p>Aucun classement trouvé</p>
          <p style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
            {rankings.length === 0
              ? "Aucun classement public n'a encore été réalisé."
              : "Essayez d'ajuster vos filtres."}
          </p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: "auto", marginBottom: "1.5rem" }}>
          <table className="activity-table">
            <thead>
              <tr>
                <th>Utilisateur</th>
                <th>Liste</th>
                <th>Mode</th>
                <th>Top 3</th>
                <th>Éléments</th>
                <th>Duels</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const top = getTopItems(r.result);
                const pseudo = r.profiles?.pseudo || "Anonyme";
                return (
                  <tr key={r.id}>
                    <td data-label="Utilisateur">
                      {r.profiles?.pseudo ? (
                        <Link
                          to={`/profile/${encodeURIComponent(r.profiles.pseudo)}`}
                          className="activity-pseudo-link"
                        >
                          {r.profiles.avatar_url && (
                            <img
                              src={r.profiles.avatar_url}
                              alt=""
                              className="activity-avatar"
                            />
                          )}
                          {pseudo}
                        </Link>
                      ) : (
                        <span className="activity-pseudo-anon">Anonyme</span>
                      )}
                    </td>
                    <td data-label="Liste">
                      <button
                        className="activity-list-link"
                        onClick={() => setFilter((f) => ({ ...f, list: f.list === r.list_name ? null : r.list_name }))}
                        title={`Filtrer par "${r.list_name}"`}
                      >
                        {r.list_name}
                      </button>
                    </td>
                    <td data-label="Mode">
                      <span className="badge" style={{ fontSize: "0.7rem" }}>
                        {r.mode === "bracket" ? "⚔ Bracket" : "📊 Classique"}
                      </span>
                    </td>
                    <td data-label="Top 3">
                      <div className="activity-podium">
                        {top.map((item, i) => (
                          <span key={i} className="activity-podium-item">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}{" "}
                            {typeof item === "string" ? item : item.item || String(item)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td data-label="Éléments" style={{ textAlign: "center" }}>{r.items?.length || "?"}</td>
                    <td data-label="Duels" style={{ textAlign: "center" }}>{r.comparisons_count}</td>
                    <td data-label="Date" className="activity-date">{formatDate(r.created_at)}</td>
                    <td data-label="">
                      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", justifyContent: "flex-end" }}>
                        <button
                          className="btn-ghost"
                          onClick={() => navigate(`/ranking/${r.id}`)}
                          style={{ fontSize: "0.7rem", padding: "0.3rem 0.6rem", whiteSpace: "nowrap" }}
                        >
                          Voir
                        </button>
                        {onChallenge && (
                          <button
                            className="activity-row-cta"
                            onClick={() => onChallenge(r)}
                            title={r.mode === "bracket" ? "Refaire ce match" : "Faire ce classement"}
                          >
                            {r.mode === "bracket" ? "⚔ Défi" : "📊 À moi !"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
        <button className="btn-ghost" onClick={onBack}>← Retour</button>
      </div>
    </div>
  );
}
