import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext";

function getName(item) {
  return typeof item === "string" ? item : item.item || String(item);
}

export default function PublicProfile() {
  const { pseudo } = useParams();
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!supabase || !pseudo) { setLoading(false); setNotFound(true); return; }
    (async () => {
      // Fetch profile
      const { data: profiles } = await supabase
        .from("profiles")
        .select("*")
        .ilike("pseudo", pseudo)
        .limit(1);

      if (!profiles || profiles.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const prof = profiles[0];
      setProfileData(prof);

      // Fetch their public rankings
      const { data: ranks } = await supabase
        .from("rankings")
        .select("*")
        .eq("user_id", prof.id)
        .eq("is_public", true)
        .order("created_at", { ascending: false })
        .limit(50);

      setRankings(ranks || []);
      setLoading(false);
    })();
  }, [pseudo]);

  const isOwnProfile = user?.id === profileData?.id;

  const formatDate = (iso) => {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  };

  // Stats
  const totalRankings = rankings.length;
  const totalItems = rankings.reduce((sum, r) => sum + (r.items?.length || 0), 0);
  const totalDuels = rankings.reduce((sum, r) => sum + (r.comparisons_count || 0), 0);
  const uniqueLists = new Set(rankings.map((r) => r.list_name)).size;

  if (loading) {
    return (
      <div className="fade" style={{ width: "100%", maxWidth: 640, textAlign: "center", padding: "3rem 1rem" }}>
        <p style={{ color: "var(--text-faint)" }}>Chargement du profil…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="fade" style={{ width: "100%", maxWidth: 640, textAlign: "center", padding: "3rem 1rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
        <h2 className="logo" style={{ fontSize: "1.8rem" }}>Profil introuvable</h2>
        <p style={{ color: "var(--text-faint)", marginTop: "1rem" }}>
          L'utilisateur « {pseudo} » n'existe pas.
        </p>
        <Link to="/" className="btn-ghost" style={{ display: "inline-block", marginTop: "1.5rem" }}>← Accueil</Link>
      </div>
    );
  }

  return (
    <div className="fade" style={{ width: "100%", maxWidth: 640 }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
        <div className="profile-avatar">
          {profileData.avatar_url ? (
            <img src={profileData.avatar_url} alt="" className="profile-avatar-img" />
          ) : (
            <span className="profile-avatar-placeholder">
              {profileData.pseudo?.[0]?.toUpperCase() || "?"}
            </span>
          )}
        </div>
        <h2 className="logo" style={{ fontSize: "clamp(1.5rem, 4vw, 2.2rem)", marginTop: "0.8rem" }}>
          {profileData.pseudo}
        </h2>
        {isOwnProfile && <span className="badge" style={{ marginTop: "0.5rem" }}>Votre profil</span>}
        <p style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginTop: "0.5rem" }}>
          Membre depuis {formatDate(profileData.created_at)}
        </p>
      </div>

      {/* Stats */}
      <div className="profile-stats">
        <div className="profile-stat">
          <span className="profile-stat-value">{totalRankings}</span>
          <span className="profile-stat-label">Classements</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-value">{uniqueLists}</span>
          <span className="profile-stat-label">Listes</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-value">{totalItems}</span>
          <span className="profile-stat-label">Éléments classés</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-value">{totalDuels}</span>
          <span className="profile-stat-label">Duels joués</span>
        </div>
      </div>

      {/* Rankings list */}
      <div style={{ marginTop: "1.5rem" }}>
        <h3 style={{ fontFamily: "Cinzel, serif", fontWeight: 700, fontSize: "0.85rem", color: "var(--gold)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.8rem" }}>
          Classements publics
        </h3>

        {rankings.length === 0 ? (
          <p style={{ color: "var(--text-faint)", fontSize: "0.82rem", textAlign: "center", padding: "1.5rem" }}>
            Aucun classement public.
          </p>
        ) : (
          <div className="profile-rankings">
            {rankings.map((r) => {
              const top3 = (r.result || []).slice(0, 3).map(getName);
              return (
                <Link to={`/ranking/${r.id}`} key={r.id} className="profile-ranking-card">
                  <div className="profile-ranking-header">
                    <span className="profile-ranking-mode">{r.mode === "bracket" ? "⚔" : "📊"}</span>
                    <div>
                      <h4 className="profile-ranking-name">{r.list_name}</h4>
                      <p className="profile-ranking-date">{formatDate(r.created_at)}</p>
                    </div>
                    <div className="profile-ranking-badges">
                      <span className="badge">{r.items?.length || "?"} él.</span>
                    </div>
                  </div>
                  {top3.length > 0 && (
                    <div className="profile-ranking-podium">
                      {top3.map((item, i) => (
                        <span key={i} className="profile-ranking-podium-item">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {item.length > 30 ? item.slice(0, 30) + "…" : item}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: "1.5rem" }}>
        <Link to="/" className="btn-ghost">← Accueil</Link>
      </div>
    </div>
  );
}
