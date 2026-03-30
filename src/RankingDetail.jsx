import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";
import { getRankingById } from "./rankingService";
import TierList from "./TierList";
import DataViz from "./DataViz";
import AttributeEditor from "./AttributeEditor";
import ComparisonView from "./ComparisonView";
import SocialCompare from "./SocialCompare";
import FilterBar from "./FilterBar";
import { getName } from "./utils";

export default function RankingDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [ranking, setRanking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewTab, setViewTab] = useState("ranking");
  const [filteredItems, setFilteredItems] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getRankingById(id, user?.id);
        setRanking(data);
      } catch { setRanking(null); }
      setLoading(false);
    })();
  }, [id, user?.id]);

  if (loading) {
    return (
      <div className="fade" style={{ width: "100%", maxWidth: 640, textAlign: "center", padding: "3rem 1rem" }}>
        <p style={{ color: "var(--text-faint)" }}>Chargement…</p>
      </div>
    );
  }

  if (!ranking) {
    return (
      <div className="fade" style={{ width: "100%", maxWidth: 640, textAlign: "center", padding: "3rem 1rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
        <h2 className="logo" style={{ fontSize: "1.8rem" }}>Classement introuvable</h2>
        <Link to="/" className="btn-ghost" style={{ display: "inline-block", marginTop: "1.5rem" }}>← Accueil</Link>
      </div>
    );
  }

  const displayItems = filteredItems || (ranking.result || []).map(getName);

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 700 }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
        <p className="subtitle" style={{ marginBottom: "0.5rem" }}>{ranking.list_name}</p>
        <h2 className="logo" style={{ fontSize: "clamp(1.5rem, 4vw, 2.2rem)" }}>Détail du classement</h2>
        <div style={{ marginTop: "0.9rem", display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span className="badge">{ranking.mode === "bracket" ? "⚔ Bracket" : "📊 Classement"}</span>
          <span className="badge">{ranking.items?.length || "?"} éléments</span>
          <span className="badge">{ranking.comparisons_count} duels</span>
          <span className="badge">{new Date(ranking.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="view-tabs">
        {[
          ["ranking", "📋 Classement"],
          ["tier", "🏆 Tier List"],
          ["viz", "📊 Data Viz"],
          ["attrs", "🏷 Attributs"],
          ["social", "👥 Comparer"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`view-tab${viewTab === key ? " active" : ""}`}
            onClick={() => setViewTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {viewTab === "ranking" && (
        <>
          <FilterBar ranking={ranking} onFilteredResult={setFilteredItems} />
          {filteredItems && filteredItems.length !== (ranking.result || []).length && (
            <p style={{ fontSize: "0.72rem", color: "var(--gold)", textAlign: "center", margin: "0.3rem 0 0.6rem", letterSpacing: "0.05em" }}>
              {filteredItems.length} / {(ranking.result || []).length} éléments affichés
            </p>
          )}
          <div className="card" style={{ padding: "1.2rem 1.5rem", marginBottom: "1.5rem", maxHeight: "55vh", overflowY: "auto" }}>
            {displayItems.map((item, i) => {
              const name = typeof item === "string" ? item : getName(item);
              return (
                <div key={i} className="result-row" style={{ animationDelay: `${Math.min(i * 0.04, 0.6)}s` }}>
                  <span className={`rank${i < 3 ? " top3" : ""}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <span style={{ fontSize: "0.95rem", fontWeight: i < 3 ? 600 : 400, color: i < 3 ? "var(--text)" : "var(--text-dim)", flex: 1 }}>
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
          <ComparisonView currentRanking={ranking} onClose={() => {}} />
        </>
      )}

      {viewTab === "tier" && <TierList ranking={ranking} />}
      {viewTab === "viz" && <DataViz ranking={ranking} />}
      {viewTab === "attrs" && <AttributeEditor ranking={ranking} />}
      {viewTab === "social" && <SocialCompare ranking={ranking} onClose={() => setViewTab("ranking")} />}

      <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap", marginTop: "1.5rem" }}>
        <Link to="/history" className="btn-ghost">← Historique</Link>
        <Link to="/" className="btn-ghost">Accueil</Link>
      </div>
    </div>
  );
}
