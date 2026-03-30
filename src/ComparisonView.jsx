import { useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { getRankingsForList } from "./rankingService";
import { formatDate } from "./utils";

export default function ComparisonView({ currentRanking, onClose }) {
  const { user } = useAuth();
  const [previousRankings, setPreviousRankings] = useState([]);
  const [selectedPrevious, setSelectedPrevious] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const all = await getRankingsForList(user?.id, currentRanking.list_name);
        // Exclude current ranking, sort by most recent
        const others = all.filter((r) => r.id !== currentRanking.id);
        setPreviousRankings(others);
        if (others.length > 0) setSelectedPrevious(others[0]);
      } catch {
        setPreviousRankings([]);
      }
      setLoading(false);
    })();
  }, [user?.id, currentRanking.id, currentRanking.list_name]);

  if (loading) {
    return <div className="comparison-loading">Chargement des classements précédents…</div>;
  }

  if (previousRankings.length === 0) {
    return (
      <div className="comparison-empty">
        <p>Pas de classement précédent pour <strong>{currentRanking.list_name}</strong></p>
        <p style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
          Refaites cette liste pour voir l'évolution de vos choix !
        </p>
        <button className="btn-ghost" onClick={onClose} style={{ marginTop: "1rem" }}>Fermer</button>
      </div>
    );
  }

  const currentResult = currentRanking.result || [];
  const previousResult = selectedPrevious?.result || [];

  // Build rank maps
  const currentRankMap = new Map();
  currentResult.forEach((item, i) => {
    const name = typeof item === "string" ? item : item.item || item;
    currentRankMap.set(name, i + 1);
  });

  const previousRankMap = new Map();
  previousResult.forEach((item, i) => {
    const name = typeof item === "string" ? item : item.item || item;
    previousRankMap.set(name, i + 1);
  });

  // Merge all items
  const allItems = [...new Set([...currentRankMap.keys(), ...previousRankMap.keys()])];

  // Build comparison data sorted by current rank
  const comparisonData = allItems
    .map((item) => {
      const oldRank = previousRankMap.get(item) ?? null;
      const newRank = currentRankMap.get(item) ?? null;
      const delta = oldRank !== null && newRank !== null ? oldRank - newRank : null;
      return { item, oldRank, newRank, delta };
    })
    .sort((a, b) => (a.newRank ?? 999) - (b.newRank ?? 999));

  const biggestMoves = [...comparisonData]
    .filter((d) => d.delta !== null && d.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  return (
    <div className="comparison-view fade">
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <div className="ornament" style={{ marginBottom: "0.5rem" }}>✦ ✦ ✦</div>
        <p className="subtitle" style={{ marginBottom: "0.3rem" }}>Évolution</p>
        <h2 style={{ fontFamily: "Cinzel, serif", fontWeight: 900, fontSize: "1.3rem", color: "var(--text)", letterSpacing: "0.05em" }}>
          Comparaison des classements
        </h2>
      </div>

      {/* Previous ranking selector */}
      {previousRankings.length > 1 && (
        <div className="comparison-selector">
          <label className="label">Comparer avec :</label>
          <select
            value={selectedPrevious?.id || ""}
            onChange={(e) => {
              const r = previousRankings.find((r) => r.id === e.target.value);
              setSelectedPrevious(r);
            }}
            className="comparison-select"
          >
            {previousRankings.map((r) => (
              <option key={r.id} value={r.id}>
                {formatDate(r.created_at)} — {r.comparisons_count} duels
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Biggest moves highlight */}
      {biggestMoves.length > 0 && (
        <div className="comparison-highlights">
          <span className="comparison-highlights-title">Plus gros mouvements</span>
          <div className="comparison-highlights-list">
            {biggestMoves.map((d) => (
              <span key={d.item} className={`comparison-highlight ${d.delta > 0 ? "up" : "down"}`}>
                {d.delta > 0 ? "↑" : "↓"}{Math.abs(d.delta)} {d.item}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Comparison table */}
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr>
              <th>Élément</th>
              <th>Ancien</th>
              <th>Nouveau</th>
              <th>Δ</th>
            </tr>
          </thead>
          <tbody>
            {comparisonData.map((d) => (
              <tr key={d.item} className={d.delta !== null && d.delta !== 0 ? (d.delta > 0 ? "row-up" : "row-down") : ""}>
                <td className="comparison-item-name">{d.item}</td>
                <td className="comparison-rank">{d.oldRank ?? "—"}</td>
                <td className="comparison-rank">{d.newRank ?? "—"}</td>
                <td className="comparison-delta">
                  {d.delta === null ? "—" : d.delta === 0 ? (
                    <span className="delta-same">=</span>
                  ) : d.delta > 0 ? (
                    <span className="delta-up">↑{d.delta}</span>
                  ) : (
                    <span className="delta-down">↓{Math.abs(d.delta)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem" }}>
        <button className="btn-ghost" onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}
