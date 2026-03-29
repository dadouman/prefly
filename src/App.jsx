import { useState, useEffect, useCallback, useRef } from "react";
import { Routes, Route, useNavigate, useLocation, Link } from "react-router-dom";
import "./App.css";
import AdminPanel from "./AdminPanel";
import ListSelector from "./ListSelector";
import BracketArena from "./BracketArena";
import "./BracketArena.css";
import { savePausedSession, loadPausedSession, clearPausedSession } from "./storage";
import { fetchItemImages, dismissImage } from "./imageSearch";
import ShareCard from "./ShareCard";
import { useAuth } from "./AuthContext";
import AuthModal from "./AuthModal";
import HistoryPanel from "./HistoryPanel";
import ActivityFeed from "./ActivityFeed";
import ComparisonView from "./ComparisonView";
import PublicProfile from "./PublicProfile";
import RankingDetail from "./RankingDetail";
import { saveRanking, migrateLocalRankings } from "./rankingService";
import { supabase } from "./supabaseClient";
import CommunityBracketPage, { CommunityBracketView } from "./CommunityBracket";
import "./CommunityBracket.css";
import YouTubePlayer from "./YouTubePlayer";

// =====================================================================
// SORT ENGINE — Interactive Merge Sort
// =====================================================================
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildRound(runs) {
  if (runs.length === 1) return { done: true, sorted: runs[0] };
  const pairs = [];
  for (let i = 0; i + 1 < runs.length; i += 2)
    pairs.push({ left: runs[i], right: runs[i + 1] });
  const leftover = runs.length % 2 === 1 ? runs[runs.length - 1] : null;
  return { done: false, pairs, leftover, pairIdx: 0, completedPairs: [], currentMerge: { ...pairs[0], li: 0, ri: 0, merged: [] } };
}

function startSort(items) { return buildRound(items.map(item => [item])); }

function getComparison(state) {
  if (state.done) return null;
  const m = state.currentMerge;
  return (m.li < m.left.length && m.ri < m.right.length)
    ? { a: m.left[m.li], b: m.right[m.ri] } : null;
}

function advance(state, pickLeft) {
  const m = state.currentMerge;
  let li = m.li, ri = m.ri;
  const merged = [...m.merged];
  if (pickLeft) { merged.push(m.left[li]); li++; }
  else          { merged.push(m.right[ri]); ri++; }

  let finalMerged = null;
  if (li >= m.left.length)       finalMerged = [...merged, ...m.right.slice(ri)];
  else if (ri >= m.right.length) finalMerged = [...merged, ...m.left.slice(li)];

  if (finalMerged !== null) {
    const completedPairs = [...state.completedPairs, finalMerged];
    const nextIdx = state.pairIdx + 1;
    if (nextIdx >= state.pairs.length) {
      let allRuns = completedPairs;
      if (state.leftover) allRuns = [...allRuns, state.leftover];
      return buildRound(allRuns);
    }
    const nextPair = state.pairs[nextIdx];
    return { ...state, pairIdx: nextIdx, completedPairs, currentMerge: { ...nextPair, li: 0, ri: 0, merged: [] } };
  }
  return { ...state, currentMerge: { ...m, li, ri, merged } };
}

function estimateTotal(n) {
  let total = 0, size = 1;
  while (size < n) {
    for (let i = 0; i < n; i += 2 * size) {
      const l = Math.min(size, n - i);
      const r = Math.min(size, Math.max(0, n - i - size));
      if (r > 0) total += l + r - 1;
    }
    size *= 2;
  }
  return total;
}

function parseInput(text) {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  return lines.map(l => l.replace(/^"|"$/g, '')).filter(Boolean);
}

function exportCSV(items, format) {
  let csv;
  if (format === "discography") {
    csv = [`Rang,Titre,Album,Année`, ...items.map((item, i) => {
      const first = item.indexOf(" - ");
      if (first !== -1) {
        const song = item.substring(0, first);
        const rest = item.substring(first + 3);
        const ld = rest.lastIndexOf(" - ");
        const album = ld !== -1 ? rest.substring(0, ld) : rest;
        const year = ld !== -1 ? rest.substring(ld + 3) : "";
        return `${i + 1},"${song.replace(/"/g, '""')}","${album.replace(/"/g, '""')}","${year}"`;
      }
      return `${i + 1},"${item.replace(/"/g, '""')}",,`;
    })].join('\n');
  } else {
    csv = [`Rang,Élément`, ...items.map((item, i) => `${i + 1},"${item.replace(/"/g, '""')}"`)].join('\n');
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'classement.csv'; a.click();
  URL.revokeObjectURL(url);
}

function ItemLabel({ item, format, imageUrl, onDismissImage }) {
  const img = imageUrl ? (
    <span className="item-thumb-wrap">
      <img src={imageUrl} alt="" className="item-thumb" loading="lazy" />
      {onDismissImage && (
        <button
          className="img-dismiss-btn"
          onClick={(e) => { e.stopPropagation(); onDismissImage(item); }}
          title="Image incorrecte ? Essayer la suivante"
          aria-label="Changer d'image"
        >✕</button>
      )}
    </span>
  ) : null;

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
        <span className="item-with-thumb">
          {img}
          <span className="item-text-wrap">
            <span className="disco-song">{song}</span>
            <span className="disco-meta">{albumYear}</span>
          </span>
        </span>
      );
    }
  }
  if (img) {
    return (
      <span className="item-with-thumb">
        {img}
        <span className="item-text-wrap">{item}</span>
      </span>
    );
  }
  return <>{item}</>;
}

// Build live ranking snapshot:
// - 'confirmed' = fully merged items from completed runs (sorted relative to their group)
// - 'partial'   = items merged so far in the active pair (sorted relative to each other)
// - 'pending'   = items not yet compared
function getLiveSnapshot(state) {
  if (!state || state.done) return [];
  const entries = [];
  let rank = 1;

  for (const run of state.completedPairs) {
    for (const item of run) entries.push({ item, status: 'confirmed', rank: rank++ });
  }

  const m = state.currentMerge;
  for (const item of m.merged) entries.push({ item, status: 'partial', rank: rank++ });

  const remaining = [...m.left.slice(m.li), ...m.right.slice(m.ri)];
  for (const item of remaining) entries.push({ item, status: 'pending', rank: null });

  for (let i = state.pairIdx + 1; i < state.pairs.length; i++) {
    const p = state.pairs[i];
    for (const item of [...p.left, ...p.right]) entries.push({ item, status: 'pending', rank: null });
  }

  if (state.leftover) {
    for (const item of state.leftover) entries.push({ item, status: 'confirmed', rank: rank++ });
  }

  return entries;
}

// =====================================================================
// LIVE PANEL COMPONENT
// =====================================================================
function LivePanel({ snapshot, format, imageMap, onDismissImage }) {
  const prevKeys = useRef(new Set());
  const justAdded = new Set();
  for (const e of snapshot) {
    if ((e.status === 'confirmed' || e.status === 'partial') && !prevKeys.current.has(e.item))
      justAdded.add(e.item);
  }
  useEffect(() => {
    prevKeys.current = new Set(snapshot.filter(e => e.status !== 'pending').map(e => e.item));
  }, [snapshot]);

  const confirmed = snapshot.filter(e => e.status === 'confirmed').length;
  const partial   = snapshot.filter(e => e.status === 'partial').length;
  const pending   = snapshot.filter(e => e.status === 'pending').length;

  return (
    <div className="live-panel">
      <div className="live-panel-header">
        <div className="live-panel-title">
          <span className="live-dot" style={{ background: "var(--gold)", animation: "pulse-dot 1.4s ease-in-out infinite" }} />
          Classement en direct
        </div>
        <span style={{ fontSize: "0.65rem", color: "rgba(201,162,39,0.4)", fontFamily: "Raleway, sans-serif" }}>
          {snapshot.length} éléments
        </span>
      </div>

      <div className="live-panel-body">
        {snapshot.map((entry, i) => (
          <div
            key={entry.item}
            className={`live-row${justAdded.has(entry.item) ? " just-added" : ""}`}
            style={{ animationDelay: `${i * 0.015}s` }}
          >
            <span className={`live-pip ${entry.status}`} />
            <span className={`live-rank ${entry.status}`}>
              {entry.rank !== null ? `${entry.rank}` : "·"}
            </span>
            <span className={`live-item-text ${entry.status}`} title={entry.item}>
              <ItemLabel item={entry.item} format={format} imageUrl={imageMap?.get(entry.item)} onDismissImage={onDismissImage} />
            </span>
          </div>
        ))}
      </div>

      <div className="live-footer">
        <span className="live-stat" style={{ color: "rgba(201,162,39,0.65)" }}>
          <span style={{ width:6,height:6,borderRadius:"50%",background:"var(--gold)",display:"inline-block",flexShrink:0 }} />
          Classé · {confirmed}
        </span>
        <span className="live-stat" style={{ color: "rgba(201,162,39,0.35)" }}>
          <span style={{ width:6,height:6,borderRadius:"50%",background:"rgba(201,162,39,0.4)",display:"inline-block",flexShrink:0 }} />
          En cours · {partial}
        </span>
        <span className="live-stat" style={{ color: "rgba(232,228,217,0.2)" }}>
          <span style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.1)",display:"inline-block",flexShrink:0 }} />
          En attente · {pending}
        </span>
      </div>
    </div>
  );
}

// =====================================================================
// APP
// =====================================================================
export default function App() {
  const [phase, setPhase] = useState("input");
  const [inputText, setInputText] = useState("");
  const [sortState, setSortState] = useState(null);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [sorted, setSorted] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showLive, setShowLive] = useState(true);
  const [sortHistory, setSortHistory] = useState([]);
  const [listFormat, setListFormat] = useState(null);
  const [pausedSession, setPausedSession] = useState(null);
  const [mode, setMode] = useState("classic"); // "classic" or "bracket"
  const [youtubeLinks, setYoutubeLinks] = useState(false);
  const [imageMap, setImageMap] = useState(new Map());
  const [loadingImages, setLoadingImages] = useState(false);
  const [listName, setListName] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [lastSavedRanking, setLastSavedRanking] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [sortStartTime, setSortStartTime] = useState(null);
  const [pendingItemAttributes, setPendingItemAttributes] = useState(null);
  const [selectedListId, setSelectedListId] = useState(null);
  const fileRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, isAuthenticated, signOut, loading: authLoading } = useAuth();
  const isAnonymous = user?.is_anonymous || user?.email?.endsWith("@prefly.app");

  // Dismiss an image and cycle to the next Wikipedia result
  const handleDismissImage = useCallback((term) => {
    const nextUrl = dismissImage(term);
    setImageMap(prev => {
      const copy = new Map(prev);
      copy.set(term, nextUrl);
      return copy;
    });
  }, []);

  // Load any saved paused session on mount
  useEffect(() => { setPausedSession(loadPausedSession()); }, []);

  // Migrate local rankings to Supabase when user logs in
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      migrateLocalRankings(user.id).catch(() => {});
    }
  }, [isAuthenticated, user?.id]);

  const parsedItems = parseInput(inputText);
  const comparison = sortState && !sortState.done ? getComparison(sortState) : null;
  const progress = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  const roundSize = sortState && !sortState.done
    ? (sortState.currentMerge.left.length + sortState.currentMerge.right.length) : 0;
  const snapshot = getLiveSnapshot(sortState);

  const handleStart = async () => {
    if (parsedItems.length < 2) return;
    setSortStartTime(Date.now());
    // Fetch images in background
    setLoadingImages(true);
    fetchItemImages(parsedItems).then((map) => {
      setImageMap(map);
      setLoadingImages(false);
    });
    if (mode === "community") {
      navigate("/community/create");
      return;
    }
    if (mode === "bracket") {
      setPhase("bracket");
      return;
    }
    const shuffled = shuffle(parsedItems);
    setSortState(startSort(shuffled));
    setTotal(estimateTotal(shuffled.length));
    setCount(0);
    setPhase("sorting");
  };

  const handleChoice = useCallback((pickLeft) => {
    if (chosen !== null || !sortState) return;
    setChosen(pickLeft ? "a" : "b");
    setTimeout(() => {
      setChosen(null);
      setSortHistory(prev => [...prev, { sortState, count }]);
      const next = advance(sortState, pickLeft);
      setCount(c => c + 1);
      if (next.done) { setSorted(next.sorted); setPhase("result"); }
      else setSortState(next);
    }, 300);
  }, [chosen, sortState, count]);

  const handleSortUndo = useCallback(() => {
    if (sortHistory.length === 0) return;
    const prev = sortHistory[sortHistory.length - 1];
    setSortHistory(h => h.slice(0, -1));
    setSortState(prev.sortState);
    setCount(prev.count);
    setChosen(null);
    if (phase === "result") { setSorted([]); setPhase("sorting"); }
  }, [sortHistory, phase]);

  useEffect(() => {
    if (phase !== "sorting" && phase !== "result") return;
    const fn = (e) => {
      if (phase === "sorting") {
        if (e.key === "ArrowLeft")  handleChoice(true);
        if (e.key === "ArrowRight") handleChoice(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleSortUndo(); }
      if (e.key === "Backspace") { e.preventDefault(); handleSortUndo(); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [phase, handleChoice, handleSortUndo]);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setInputText(e.target.result);
    reader.readAsText(file);
  };

  const reset = () => { setPhase("input"); setInputText(""); setSortState(null); setSorted([]); setListFormat(null); setListName(null); setSelectedListId(null); setMode("classic"); setYoutubeLinks(false); setSortHistory([]); setPausedSession(loadPausedSession()); setImageMap(new Map()); setLastSavedRanking(null); setShowComparison(false); setViewingRanking(null); };

  const handlePause = () => {
    savePausedSession({ sortState, count, total, listFormat, inputText, youtubeLinks });
    setPausedSession(loadPausedSession());
    setPhase("input"); setSortState(null); setSorted([]);
  };

  const handleResume = () => {
    if (!pausedSession) return;
    setSortState(pausedSession.sortState);
    setCount(pausedSession.count);
    setTotal(pausedSession.total);
    setListFormat(pausedSession.listFormat);
    setInputText(pausedSession.inputText);
    setYoutubeLinks(pausedSession.youtubeLinks || false);
    clearPausedSession();
    setPausedSession(null);
    setPhase("sorting");
  };

  const handleDiscardPaused = () => {
    clearPausedSession();
    setPausedSession(null);
  };

  const handleSelectPrebuilt = (list) => {
    setInputText(list.items.join("\n"));
    setListFormat(list.format || null);
    setListName(list.name || null);
    setSelectedListId(list.id || null);
    setPendingItemAttributes(list.itemAttributes && Object.keys(list.itemAttributes).length > 0 ? list.itemAttributes : null);
  };

  // Auto-save ranking when classic sort completes
  useEffect(() => {
    if (phase === "result" && sorted.length > 0 && !lastSavedRanking) {
      const duration = sortStartTime ? Math.round((Date.now() - sortStartTime) / 1000) : null;
      saveRanking({
        userId: user?.id,
        listName: listName || "Sans titre",
        listId: selectedListId || null,
        mode: "classic",
        items: parsedItems,
        result: sorted,
        comparisonsCount: count,
        durationSeconds: duration,
      }).then(async (saved) => {
        setLastSavedRanking(saved);
        if (saved?.id && pendingItemAttributes && supabase) {
          const rows = Object.entries(pendingItemAttributes)
            .filter(([, attrs]) => attrs && Object.keys(attrs).length > 0)
            .map(([itemName, attrs]) => ({ ranking_id: saved.id, item_name: itemName, attributes: attrs }));
          if (rows.length > 0) {
            await supabase.from("item_attributes").upsert(rows, { onConflict: "ranking_id,item_name" });
          }
          setPendingItemAttributes(null);
        }
      }).catch(() => {});
    }
  }, [phase, sorted.length]);

  // Handle bracket finish (called from BracketArena)
  const handleBracketFinish = useCallback(({ champion, resolvedMatches, items: bracketItems }) => {
    const duration = sortStartTime ? Math.round((Date.now() - sortStartTime) / 1000) : null;
    saveRanking({
      userId: user?.id,
      listName: listName || "Sans titre",
      listId: selectedListId || null,
      mode: "bracket",
      items: bracketItems || parsedItems,
      result: [champion],
      comparisonsCount: resolvedMatches,
      durationSeconds: duration,
    }).then(async (saved) => {
      setLastSavedRanking(saved);
      if (saved?.id && pendingItemAttributes && supabase) {
        const rows = Object.entries(pendingItemAttributes)
          .filter(([, attrs]) => attrs && Object.keys(attrs).length > 0)
          .map(([itemName, attrs]) => ({ ranking_id: saved.id, item_name: itemName, attributes: attrs }));
        if (rows.length > 0) {
          await supabase.from("item_attributes").upsert(rows, { onConflict: "ranking_id,item_name" });
        }
        setPendingItemAttributes(null);
      }
    }).catch(() => {});
  }, [user?.id, listName, parsedItems, sortStartTime]);

  // History: redo a ranking
  const handleRedoRanking = (ranking) => {
    const items = ranking.items || [];
    setInputText(items.join("\n"));
    setListName(ranking.list_name);
    setListFormat(null);
    setPhase("input");
  };

  return (
    <>
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

      {/* ─── USER HEADER BAR ─── */}
      <div className="user-header-bar">
        <div className="user-header-left">
          {(location.pathname.startsWith("/community") || (phase !== "input" && phase !== "admin" && phase !== "history" && phase !== "activity")) && (
            <button className="user-header-home" onClick={() => { reset(); navigate("/"); }} title="Accueil">⌂</button>
          )}
        </div>
        <div className="user-header-right">
          <button
            className="user-header-history-btn"
            onClick={() => setPhase("activity")}
            title="Actualités"
          >
            🌐 Actualités
          </button>
          <button
            className="user-header-history-btn"
            onClick={() => setPhase("history")}
            title="Historique"
          >
            📋 Historique
          </button>
          {isAuthenticated ? (
            <div className="user-header-profile">
              {profile?.pseudo && (
                <Link to={`/profile/${encodeURIComponent(profile.pseudo)}`} className="user-header-pseudo" title="Mon profil public">
                  {profile.pseudo}
                </Link>
              )}
              {!profile?.pseudo && <span className="user-header-pseudo">Utilisateur</span>}
              {isAnonymous ? (
                <button className="user-header-upgrade-btn" onClick={() => setShowAuthModal(true)} title="Sauvegarder mon compte">
                  🔒 Créer un vrai compte
                </button>
              ) : (
                <button className="user-header-logout" onClick={signOut} title="Déconnexion">
                  Déconnexion
                </button>
              )}
            </div>
          ) : (
            <button className="user-header-login-btn" onClick={() => setShowAuthModal(true)}>
              Connexion
            </button>
          )}
        </div>
      </div>

      <Routes>
        <Route path="/profile/:pseudo" element={<PublicProfile />} />
        <Route path="/ranking/:id" element={<RankingDetail />} />
        <Route path="/community" element={
          <CommunityBracketPage />
        } />
        <Route path="/community/create" element={
          <div className="root">
            <CommunityBracketPage
              items={parsedItems}
              listName={listName}
              listId={selectedListId}
              format={listFormat}
            />
          </div>
        } />
        <Route path="/community/:id" element={
          <div className="root">
            <CommunityBracketView />
          </div>
        } />
        <Route path="*" element={
      <div className="root">

        {/* ─────────────────────────────── ADMIN */}
        {phase === "admin" && (
          <AdminPanel onBack={() => setPhase("input")} />
        )}

        {/* ─────────────────────────────── INPUT */}
        {phase === "input" && (
          <div className="fade" style={{ width: "100%", maxWidth: 520 }}>
            <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
              <div className="ornament" style={{ marginBottom: "0.8rem" }}>✦ ✦ ✦</div>
              <p className="subtitle" style={{ marginBottom: "0.7rem" }}>Tournoi de Classement</p>
              <h1 className="logo" style={{ fontSize: "clamp(2.2rem, 7vw, 3.8rem)" }}>L'Arène</h1>
              <p style={{ marginTop: "1rem", color: "var(--text-dim)", fontSize: "0.85rem", lineHeight: 1.6, letterSpacing: "0.04em" }}>
                Classez votre liste entière grâce à des duels 1 vs 1
              </p>
            </div>

            <div className="card" style={{ padding: "2rem", display: "flex", flexDirection: "column", gap: "1.4rem" }}>
              <div>
                <span className="label">Coller votre liste</span>
                <textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  placeholder={"Éléments séparés par des virgules :\npomme, banane, cerise, mangue\n\nOu une entrée par ligne:\npomme\nbanane\ncerise"}
                />
                {parsedItems.length > 0 && (
                  <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "rgba(201,162,39,0.55)", letterSpacing: "0.05em" }}>
                    {parsedItems.length} élément{parsedItems.length > 1 ? "s" : ""} détecté{parsedItems.length > 1 ? "s" : ""}
                    {parsedItems.length >= 2 && (
                      <span style={{ color: "var(--text-faint)" }}> · ~{estimateTotal(parsedItems.length)} comparaisons</span>
                    )}
                  </p>
                )}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div className="hr" style={{ flex: 1 }} />
                <span style={{ fontSize: "0.65rem", color: "var(--text-faint)", letterSpacing: "0.3em" }}>OU</span>
                <div className="hr" style={{ flex: 1 }} />
              </div>

              <div
                className={`dropzone${dragOver ? " drag" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              >
                ↑ &nbsp;Glisser un CSV ici ou cliquer pour importer
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              </div>

              {/* YouTube toggle */}
              <label className="yt-toggle">
                <input
                  type="checkbox"
                  checked={youtubeLinks}
                  onChange={e => setYoutubeLinks(e.target.checked)}
                />
                <span className="yt-toggle-icon">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21.8 8.001a2.749 2.749 0 0 0-1.935-1.946C18.265 5.5 12 5.5 12 5.5s-6.265 0-7.865.555A2.749 2.749 0 0 0 2.2 8.001 28.825 28.825 0 0 0 1.75 12a28.825 28.825 0 0 0 .45 3.999 2.749 2.749 0 0 0 1.935 1.946c1.6.555 7.865.555 7.865.555s6.265 0 7.865-.555a2.749 2.749 0 0 0 1.935-1.946A28.825 28.825 0 0 0 22.25 12a28.825 28.825 0 0 0-.45-3.999ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z"/></svg>
                </span>
                <span className="yt-toggle-label">Ajouter des liens YouTube</span>
              </label>

              {/* Mode selector */}
              <div className="mode-selector">
                <button
                  className={`mode-btn${mode === "classic" ? " mode-active" : ""}`}
                  onClick={() => setMode("classic")}
                >
                  <span className="mode-icon">📊</span>
                  <span className="mode-label">Classement</span>
                  <span className="mode-desc">Tri complet par merge-sort</span>
                </button>
                <button
                  className={`mode-btn${mode === "bracket" ? " mode-active bracket" : ""}`}
                  onClick={() => setMode("bracket")}
                >
                  <span className="mode-icon">⚔</span>
                  <span className="mode-label">Phase Finale</span>
                  <span className="mode-desc">Élimination directe</span>
                </button>
                <button
                  className={`mode-btn${mode === "community" ? " mode-active community" : ""}`}
                  onClick={() => setMode("community")}
                >
                  <span className="mode-icon">🏆</span>
                  <span className="mode-label">Communautaire</span>
                  <span className="mode-desc">Vote collectif en ligne</span>
                </button>
              </div>

              <button className="btn-gold" onClick={handleStart} disabled={parsedItems.length < 2}>
                {mode === "bracket" ? "Entrer dans l'Arène ⚔" : "Entrer dans l'Arène →"}
              </button>

              {pausedSession && (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <div className="hr" style={{ flex: 1 }} />
                    <span style={{ fontSize: "0.65rem", color: "var(--text-faint)", letterSpacing: "0.3em" }}>SESSION EN PAUSE</span>
                    <div className="hr" style={{ flex: 1 }} />
                  </div>

                  <div className="paused-card">
                    <div className="paused-card-info">
                      <span className="paused-icon">⏸</span>
                      <div>
                        <p className="paused-title">Classement en pause</p>
                        <p className="paused-meta">
                          {parseInput(pausedSession.inputText).length} éléments · {pausedSession.count} / ~{pausedSession.total} comparaisons
                        </p>
                        <p className="paused-date">
                          {new Date(pausedSession.timestamp).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.6rem" }}>
                      <button className="btn-gold" onClick={handleResume} style={{ fontSize: "0.82rem", padding: "0.55rem 1.2rem" }}>
                        ▶ Reprendre
                      </button>
                      <button className="btn-ghost" onClick={handleDiscardPaused} style={{ fontSize: "0.75rem", padding: "0.55rem 0.8rem" }}>
                        ✕
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                <div className="hr" style={{ flex: 1 }} />
                <span style={{ fontSize: "0.65rem", color: "var(--text-faint)", letterSpacing: "0.3em" }}>OU</span>
                <div className="hr" style={{ flex: 1 }} />
              </div>

              <ListSelector onSelect={handleSelectPrebuilt} />
            </div>

            <button
              className="admin-link"
              onClick={() => setPhase("admin")}
            >
              ⚙ Administration
            </button>
          </div>
        )}

        {/* ─────────────────────────────── SORTING */}
        {phase === "sorting" && comparison && (
          <div className="sorting-wrap fade">

            {/* Arena */}
            <div className="arena-col">
              <div style={{ textAlign: "center", marginBottom: "1.8rem" }}>
                <p className="subtitle" style={{ marginBottom: "0.4rem" }}>L'Arène</p>
                <h2 style={{ fontFamily: "Cinzel, serif", fontWeight: 900, fontSize: "1.25rem", color: "var(--text)", letterSpacing: "0.05em" }}>
                  Lequel préférez-vous ?
                </h2>
                {roundSize > 2 && (
                  <p className="round-indicator" style={{ marginTop: "0.35rem" }}>
                    Groupe de {roundSize} · duel en cours
                  </p>
                )}
              </div>

              {/* Progress */}
              <div style={{ marginBottom: "1.5rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.68rem", color: "var(--text-faint)", letterSpacing: "0.15em", textTransform: "uppercase" }}>Progression</span>
                  <span style={{ fontSize: "0.72rem", color: "rgba(201,162,39,0.55)" }}>{count} / ~{total}</span>
                </div>
                <div className="pbar-bg">
                  <div className="pbar-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>

              {/* Duel */}
              <div style={{ display: "flex", alignItems: "stretch", gap: "1.1rem", marginBottom: "1.3rem" }}>
                <div
                  className={`choice-card${chosen === "a" ? " flash" : chosen === "b" ? " loser" : ""}`}
                  onClick={() => handleChoice(true)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={`choice-text${listFormat === "discography" ? " disco" : ""}`}>
                    <ItemLabel item={comparison.a} format={listFormat} imageUrl={imageMap.get(comparison.a)} onDismissImage={handleDismissImage} />
                  </div>
                  {youtubeLinks && <YouTubePlayer item={comparison.a} />}
                  <div className="choice-hint">← Gauche</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span className="vs">VS</span>
                </div>
                <div
                  className={`choice-card${chosen === "b" ? " flash" : chosen === "a" ? " loser" : ""}`}
                  onClick={() => handleChoice(false)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={`choice-text${listFormat === "discography" ? " disco" : ""}`}>
                    <ItemLabel item={comparison.b} format={listFormat} imageUrl={imageMap.get(comparison.b)} onDismissImage={handleDismissImage} />
                  </div>
                  {youtubeLinks && <YouTubePlayer item={comparison.b} />}
                  <div className="choice-hint">Droite →</div>
                </div>
              </div>

              {/* Bottom bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
                <p style={{ fontSize: "0.7rem", color: "var(--text-faint)", letterSpacing: "0.06em" }}>
                  <span style={{ color: "rgba(201,162,39,0.45)" }}>←</span> gauche &nbsp;·&nbsp; <span style={{ color: "rgba(201,162,39,0.45)" }}>→</span> droite
                </p>
                <div style={{ display: "flex", gap: "0.65rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button className={`btn-live${showLive ? " active" : ""}`} onClick={() => setShowLive(v => !v)}>
                    <span className="live-dot" />
                    {showLive ? "Masquer" : "Classement live"}
                  </button>
                  {sortHistory.length > 0 && (
                    <button
                      className="bracket-undo-btn"
                      onClick={handleSortUndo}
                      title="Revenir au choix précédent (Ctrl+Z)"
                    >↩ Retour</button>
                  )}
                  <button
                    onClick={handlePause}
                    style={{ background: "none", border: "1px solid rgba(201,162,39,0.25)", color: "rgba(201,162,39,0.7)", cursor: "pointer", fontSize: "0.7rem", letterSpacing: "0.1em", padding: "0.35rem 0.8rem", borderRadius: "6px" }}
                  >
                    ⏸ Pause
                  </button>
                  <button
                    onClick={reset}
                    style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "0.7rem", letterSpacing: "0.1em", textDecoration: "underline", textUnderlineOffset: "3px" }}
                  >
                    Abandonner
                  </button>
                </div>
              </div>
            </div>

            {/* Side panel — desktop */}
            {showLive && (
              <div className="side-col" style={{ paddingTop: "5.2rem" }}>
                <LivePanel snapshot={snapshot} format={listFormat} imageMap={imageMap} onDismissImage={handleDismissImage} />
              </div>
            )}

            {/* Inline panel — mobile (only shown if side panel is hidden) */}
            {showLive && (
              <style>{`.side-col { display: flex !important; } @media (max-width: 940px) { .side-col { padding-top: 0 !important; } }`}</style>
            )}
          </div>
        )}

        {/* ─────────────────────────────── BRACKET */}
        {phase === "bracket" && (
          <BracketArena
            items={parsedItems}
            format={listFormat}
            imageMap={imageMap}
            onDismissImage={handleDismissImage}
            onFinish={handleBracketFinish}
            onReset={reset}
          />
        )}

        {/* ─────────────────────────────── RESULT */}
        {phase === "result" && (
          <div className="fade" style={{ width: "100%", maxWidth: 520 }}>
            <div style={{ textAlign: "center", marginBottom: "2rem" }}>
              <div className="ornament" style={{ marginBottom: "0.7rem" }}>✦ ✦ ✦</div>
              <p className="subtitle" style={{ marginBottom: "0.5rem" }}>Classement Final</p>
              <h2 className="logo" style={{ fontSize: "clamp(1.8rem, 5vw, 2.8rem)" }}>Le Verdict</h2>
              <div style={{ marginTop: "0.9rem", display: "flex", justifyContent: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                <span className="badge">{sorted.length} éléments</span>
                <span className="badge">{count} comparaisons</span>
              </div>
            </div>

            <div className="card" style={{ padding: "1.2rem 1.5rem", marginBottom: "1.5rem", maxHeight: "55vh", overflowY: "auto" }}>
              {sorted.map((item, i) => (
                <div key={i} className="result-row" style={{ animationDelay: `${Math.min(i * 0.04, 0.6)}s` }}>
                  <span className={`rank${i < 3 ? " top3" : ""}`}>
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                  </span>
                  <span className={listFormat === "discography" ? "result-item disco" : ""} style={{ fontSize: "0.95rem", fontWeight: i < 3 ? 600 : 400, color: i < 3 ? "var(--text)" : "var(--text-dim)", flex: 1 }}>
                    <ItemLabel item={item} format={listFormat} imageUrl={imageMap.get(item)} onDismissImage={handleDismissImage} />
                  </span>
                  {youtubeLinks && <YouTubePlayer item={item} />}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-gold" onClick={() => exportCSV(sorted, listFormat)}>↓ &nbsp;Exporter CSV</button>
              {lastSavedRanking && (
                <button className="btn-ghost" onClick={() => setShowComparison(true)}>📊 Comparer</button>
              )}
              {sortHistory.length > 0 && (
                <button className="bracket-undo-btn" onClick={handleSortUndo}>↩ Revenir en arrière</button>
              )}
              <button className="btn-ghost" onClick={reset}>Nouveau Tournoi</button>
            </div>

            {showComparison && lastSavedRanking && (
              <div style={{ marginTop: "1.5rem" }}>
                <ComparisonView currentRanking={lastSavedRanking} onClose={() => setShowComparison(false)} />
              </div>
            )}

            {!isAuthenticated && (
              <div className="save-prompt">
                <p>💾 Créez un compte pour sauvegarder vos classements et les comparer !</p>
                <button className="btn-gold" onClick={() => setShowAuthModal(true)} style={{ fontSize: "0.8rem", padding: "0.5rem 1.2rem" }}>
                  Créer un compte
                </button>
              </div>
            )}

            <ShareCard sorted={sorted} listName={listName} />
          </div>
        )}

        {/* ─────────────────────────────── ACTIVITY FEED */}
        {phase === "activity" && (
          <ActivityFeed
            onBack={() => setPhase("input")}
            onChallenge={(ranking) => {
              const items = ranking.items || [];
              setInputText(items.join("\n"));
              setListName(ranking.list_name);
              setSelectedListId(ranking.list_id || null);
              setMode(ranking.mode === "bracket" ? "bracket" : "classic");
              setListFormat(null);
              setPhase("input");
            }}
          />
        )}

        {/* ─────────────────────────────── HISTORY */}
        {phase === "history" && (
          <HistoryPanel
            onBack={() => setPhase("input")}
            onRedoRanking={handleRedoRanking}
          />
        )}

      </div>
        } />
      </Routes>
    </>
  );
}