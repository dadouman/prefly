import { useState } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

function getName(item) {
  return typeof item === "string" ? item : item.item || String(item);
}

function spearmanCorrelation(rank1, rank2) {
  const items = [...new Set([...rank1.keys(), ...rank2.keys()])].filter(
    (k) => rank1.has(k) && rank2.has(k)
  );
  const n = items.length;
  if (n < 2) return null;

  let sumD2 = 0;
  for (const item of items) {
    const d = rank1.get(item) - rank2.get(item);
    sumD2 += d * d;
  }

  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

export default function SocialCompare({ ranking, onClose }) {
  const { user } = useAuth();
  const [searchPseudo, setSearchPseudo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [otherRanking, setOtherRanking] = useState(null);
  const [otherPseudo, setOtherPseudo] = useState("");
  const [comparison, setComparison] = useState(null);

  const handleSearch = async () => {
    if (!supabase || !searchPseudo.trim()) return;
    setLoading(true);
    setError(null);
    setOtherRanking(null);
    setComparison(null);

    try {
      // Find user by pseudo
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, pseudo")
        .ilike("pseudo", searchPseudo.trim())
        .limit(1);

      if (!profiles || profiles.length === 0) {
        setError("Aucun utilisateur trouvé avec ce pseudo.");
        setLoading(false);
        return;
      }

      const otherUser = profiles[0];
      if (otherUser.id === user?.id) {
        setError("C'est votre propre profil ! Cherchez un autre pseudo.");
        setLoading(false);
        return;
      }

      // Find their ranking for the same list
      const { data: rankings } = await supabase
        .from("rankings")
        .select("*")
        .eq("user_id", otherUser.id)
        .eq("list_name", ranking.list_name)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!rankings || rankings.length === 0) {
        setError(`${otherUser.pseudo} n'a pas encore classé « ${ranking.list_name} ».`);
        setLoading(false);
        return;
      }

      const other = rankings[0];
      setOtherRanking(other);
      setOtherPseudo(otherUser.pseudo);

      // Build comparison
      const myRankMap = new Map();
      (ranking.result || []).forEach((item, i) => myRankMap.set(getName(item), i + 1));

      const theirRankMap = new Map();
      (other.result || []).forEach((item, i) => theirRankMap.set(getName(item), i + 1));

      const allItems = [...new Set([...myRankMap.keys(), ...theirRankMap.keys()])];
      const rows = allItems
        .map((item) => ({
          item,
          myRank: myRankMap.get(item) ?? null,
          theirRank: theirRankMap.get(item) ?? null,
          diff: myRankMap.has(item) && theirRankMap.has(item)
            ? Math.abs(myRankMap.get(item) - theirRankMap.get(item))
            : null,
        }))
        .sort((a, b) => (a.myRank ?? 999) - (b.myRank ?? 999));

      const correlation = spearmanCorrelation(myRankMap, theirRankMap);
      const agreement = correlation !== null ? Math.round(((correlation + 1) / 2) * 100) : null;

      const agrees = rows.filter((r) => r.diff === 0).length;
      const biggestDisagreements = [...rows]
        .filter((r) => r.diff !== null && r.diff > 0)
        .sort((a, b) => b.diff - a.diff)
        .slice(0, 3);

      setComparison({ rows, agreement, agrees, biggestDisagreements, total: rows.filter(r => r.diff !== null).length });
    } catch {
      setError("Erreur lors de la recherche.");
    }
    setLoading(false);
  };

  return (
    <div className="social-compare">
      <div style={{ textAlign: "center", marginBottom: "1rem" }}>
        <h3 style={{ fontFamily: "Cinzel, serif", fontWeight: 700, fontSize: "1rem", color: "var(--gold)", letterSpacing: "0.08em" }}>
          Comparer avec un autre utilisateur
        </h3>
        <p style={{ fontSize: "0.75rem", color: "var(--text-faint)" }}>
          Sur la liste « {ranking.list_name} »
        </p>
      </div>

      <div className="social-search">
        <input
          type="text"
          placeholder="Pseudo de l'autre utilisateur…"
          value={searchPseudo}
          onChange={(e) => setSearchPseudo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          className="social-search-input"
        />
        <button className="btn-gold" onClick={handleSearch} disabled={loading || !searchPseudo.trim()} style={{ fontSize: "0.8rem", padding: "0.5rem 1rem" }}>
          {loading ? "…" : "Comparer"}
        </button>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {comparison && (
        <div className="social-results fade">
          {/* Agreement score */}
          <div className="social-score">
            <div className="social-score-circle">
              <span className="social-score-value">{comparison.agreement}%</span>
            </div>
            <div className="social-score-text">
              <p className="social-score-label">D'accord</p>
              <p className="social-score-detail">
                {comparison.agrees} / {comparison.total} positions identiques avec <strong>{otherPseudo}</strong>
              </p>
            </div>
          </div>

          {/* Biggest disagreements */}
          {comparison.biggestDisagreements.length > 0 && (
            <div className="social-disagreements">
              <p className="social-section-title">Plus gros désaccords</p>
              {comparison.biggestDisagreements.map((d, i) => (
                <div key={i} className="social-disagreement-item">
                  <span className="social-disagreement-name">{d.item}</span>
                  <span className="social-disagreement-diff">
                    Vous : #{d.myRank} · {otherPseudo} : #{d.theirRank}
                    <span className="social-disagreement-delta">Δ {d.diff}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Full comparison table */}
          <div className="comparison-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Élément</th>
                  <th>Vous</th>
                  <th>{otherPseudo}</th>
                  <th>Écart</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row, i) => (
                  <tr key={i} className={row.diff === 0 ? "row-same" : row.diff > 3 ? "row-down" : ""}>
                    <td className="comparison-item-name">{row.item}</td>
                    <td className="comparison-rank">{row.myRank ?? "—"}</td>
                    <td className="comparison-rank">{row.theirRank ?? "—"}</td>
                    <td className="comparison-delta">
                      {row.diff !== null ? (
                        row.diff === 0 ? <span className="delta-same">═</span> : <span className="delta-down">{row.diff}</span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginTop: "1rem" }}>
            <button className="btn-ghost" onClick={onClose}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
