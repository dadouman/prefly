import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { supabase } from "./supabaseClient";
import { useNavigate, useParams } from "react-router-dom";
import { fetchItemImages, dismissImage } from "./imageSearch";
import YouTubePlayer from "./YouTubePlayer";

// =====================================================================
// COMMUNITY BRACKET — Tournoi Communautaire
// Tous les matchs d'un round jouent en même temps.
// Les votes sont récoltés pendant X heures, puis on avance.
// =====================================================================

// ─── BRACKET SEEDING (same logic as BracketArena) ───
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildSeedOrder(n) {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  const prev = buildSeedOrder(n / 2);
  const result = [];
  for (const pos of prev) {
    result.push(pos);
    result.push(n - 1 - pos);
  }
  return result;
}

function seedBracket(items) {
  const shuffled = shuffle(items);
  let n = 1;
  while (n < shuffled.length) n *= 2;
  const seedOrder = buildSeedOrder(n);
  const slots = new Array(n).fill(null);
  for (let i = 0; i < shuffled.length; i++) {
    slots[seedOrder[i]] = shuffled[i];
  }
  return slots;
}

function generateRound0(items) {
  const slots = seedBracket(items);
  const matches = [];
  for (let i = 0; i < slots.length; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    const isBye = a === null || b === null;
    matches.push({ item_a: a, item_b: b, is_bye: isBye, winner: isBye ? (a ?? b) : null });
  }
  return matches;
}

function getTotalRounds(itemCount) {
  let n = 1;
  while (n < itemCount) n *= 2;
  return Math.log2(n);
}

// ─── COUNTDOWN HOOK ───
function useCountdown(targetDate) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetDate) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!targetDate) return null;
  const diff = new Date(targetDate).getTime() - now;
  if (diff <= 0) return { expired: true, h: 0, m: 0, s: 0, total: 0 };
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { expired: false, h, m, s, total: diff };
}

function formatCountdown(cd) {
  if (!cd) return "";
  if (cd.expired) return "Terminé !";
  const parts = [];
  if (cd.h > 0) parts.push(`${cd.h}h`);
  parts.push(`${String(cd.m).padStart(2, "0")}m`);
  parts.push(`${String(cd.s).padStart(2, "0")}s`);
  return parts.join(" ");
}

// ─── ROUND NAMES ───
function getRoundName(roundIdx, totalRounds) {
  const remaining = totalRounds - roundIdx;
  if (remaining === 1) return "Finale";
  if (remaining === 2) return "Demi-finales";
  if (remaining === 3) return "Quarts de finale";
  if (remaining === 4) return "Huitièmes de finale";
  if (remaining === 5) return "Seizièmes de finale";
  return `Tour ${roundIdx + 1}`;
}

// =====================================================================
// CREATE BRACKET FORM
// =====================================================================
function CreateBracketForm({ items, listName, listId, format, onCreated, onCancel }) {
  const { user } = useAuth();
  const [title, setTitle] = useState(listName ? `Tournoi — ${listName}` : "");
  const [hours, setHours] = useState(24);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!supabase || !user) return;
    if (!title.trim()) { setError("Titre requis"); return; }
    if (items.length < 2) { setError("Il faut au moins 2 éléments"); return; }

    setCreating(true);
    setError(null);

    try {
      const totalRounds = getTotalRounds(items.length);
      const round0 = generateRound0(items);
      const votingEndsAt = new Date(Date.now() + hours * 3600000).toISOString();

      // 1. Create bracket
      const { data: bracket, error: bErr } = await supabase
        .from("community_brackets")
        .insert({
          creator_id: user.id,
          title: title.trim(),
          list_name: listName || null,
          list_id: listId || null,
          items,
          format: format || null,
          round_duration_hours: hours,
          current_round: 0,
          total_rounds: totalRounds,
          status: "active",
        })
        .select()
        .single();

      if (bErr) throw bErr;

      // 2. Insert round 0 matches
      const matchRows = round0.map((m, idx) => ({
        bracket_id: bracket.id,
        round: 0,
        match_index: idx,
        item_a: m.item_a,
        item_b: m.item_b,
        is_bye: m.is_bye,
        winner: m.winner,
        voting_ends_at: m.is_bye ? null : votingEndsAt,
      }));

      const { error: mErr } = await supabase
        .from("community_bracket_matches")
        .insert(matchRows);

      if (mErr) throw mErr;

      onCreated(bracket.id);
    } catch (err) {
      setError(err.message || "Erreur lors de la création");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="cb-create-form fade">
      <div className="cb-ornament">✦ ✦ ✦</div>
      <h2 className="cb-form-title">Créer un Tournoi Communautaire</h2>
      <p className="cb-form-subtitle">
        Tous les matchs d'un tour se jouent en même temps.
        La communauté vote pendant la durée choisie.
      </p>

      <div className="cb-field">
        <label className="cb-label">Titre du tournoi</label>
        <input
          className="cb-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="ex: Meilleur album de Radiohead"
          maxLength={120}
        />
      </div>

      <div className="cb-field">
        <label className="cb-label">Durée de vote par tour</label>
        <div className="cb-duration-options">
          {[1, 6, 12, 24, 48, 72].map(h => (
            <button
              key={h}
              className={`cb-duration-btn${hours === h ? " active" : ""}`}
              onClick={() => setHours(h)}
            >
              {h}h
            </button>
          ))}
        </div>
      </div>

      <div className="cb-item-preview">
        <span className="cb-item-count">{items.length} combattants</span>
        <span className="cb-round-count">{getTotalRounds(items.length)} tours</span>
      </div>

      {error && <p className="cb-error">{error}</p>}

      <div className="cb-form-actions">
        <button className="btn-gold" onClick={handleCreate} disabled={creating}>
          {creating ? "Création…" : "⚔ Lancer le Tournoi"}
        </button>
        <button className="btn-ghost" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// =====================================================================
// DISCOGRAPHY FORMAT HELPER
// =====================================================================
function parseDiscographyItem(item) {
  const first = item.indexOf(" - ");
  if (first === -1) return { song: item, meta: null };
  const song = item.substring(0, first);
  const rest = item.substring(first + 3);
  const ld = rest.lastIndexOf(" - ");
  const album = ld !== -1 ? rest.substring(0, ld) : rest;
  const year = ld !== -1 ? rest.substring(ld + 3) : "";
  return { song, meta: year ? `${album} · ${year}` : album };
}

// =====================================================================
// MATCH VOTE CARD
// =====================================================================
function MatchVoteCard({ match, userVote, onVote, disabled, imageMap, onDismissImage, format, showYouTube }) {
  const totalVotes = match.votes_a + match.votes_b;
  const pctA = totalVotes > 0 ? Math.round((match.votes_a / totalVotes) * 100) : 50;
  const pctB = 100 - pctA;

  if (match.is_bye) {
    return (
      <div className="cb-match-card cb-bye">
        <div className="cb-match-bye-label">
          <span className="cb-match-item-name">{match.item_a || match.item_b}</span>
          <span className="cb-auto-advance">Qualifié automatiquement</span>
        </div>
      </div>
    );
  }

  const isFinished = !!match.winner;

  const renderItemLabel = (item) => {
    if (format === "discography") {
      const { song, meta } = parseDiscographyItem(item);
      return (
        <span className="cb-vote-name">
          <span className="cb-disco-song">{song}</span>
          {meta && <span className="cb-disco-meta">{meta}</span>}
        </span>
      );
    }
    return <span className="cb-vote-name">{item}</span>;
  };

  const renderThumb = (item) => {
    const url = imageMap?.get(item);
    if (!url) return null;
    return (
      <span className="cb-vote-thumb-wrap">
        <img src={url} alt="" className="cb-vote-thumb" />
        {onDismissImage && (
          <button className="cb-img-dismiss" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDismissImage(item); }} title="Autre image">✕</button>
        )}
      </span>
    );
  };

  return (
    <div className={`cb-match-card${isFinished ? " cb-match-finished" : ""}`}>
      <div className="cb-match-vs-label">VS</div>

      {/* Item A */}
      <button
        className={`cb-vote-btn cb-vote-a${userVote === "a" ? " cb-voted" : ""}${isFinished && match.winner === match.item_a ? " cb-winner" : ""}${isFinished && match.winner !== match.item_a ? " cb-loser" : ""}`}
        onClick={() => !disabled && onVote(match.id, "a")}
        disabled={disabled || isFinished}
      >
        {renderThumb(match.item_a)}
        {renderItemLabel(match.item_a)}
        {showYouTube && <YouTubePlayer item={match.item_a} />}
        <div className="cb-vote-bar-wrap">
          <div className="cb-vote-bar cb-bar-a" style={{ width: `${pctA}%` }} />
        </div>
        <span className="cb-vote-count">{match.votes_a} vote{match.votes_a !== 1 ? "s" : ""} ({pctA}%)</span>
      </button>

      {/* Item B */}
      <button
        className={`cb-vote-btn cb-vote-b${userVote === "b" ? " cb-voted" : ""}${isFinished && match.winner === match.item_b ? " cb-winner" : ""}${isFinished && match.winner !== match.item_b ? " cb-loser" : ""}`}
        onClick={() => !disabled && onVote(match.id, "b")}
        disabled={disabled || isFinished}
      >
        {renderThumb(match.item_b)}
        {renderItemLabel(match.item_b)}
        {showYouTube && <YouTubePlayer item={match.item_b} />}
        <div className="cb-vote-bar-wrap">
          <div className="cb-vote-bar cb-bar-b" style={{ width: `${pctB}%` }} />
        </div>
        <span className="cb-vote-count">{match.votes_b} vote{match.votes_b !== 1 ? "s" : ""} ({pctB}%)</span>
      </button>

      <div className="cb-match-total">{totalVotes} vote{totalVotes !== 1 ? "s" : ""} au total</div>
    </div>
  );
}

// =====================================================================
// BRACKET OVERVIEW (mini visual of all rounds)
// =====================================================================
function BracketOverview({ allMatches, totalRounds, currentRound, imageMap, onScrollToMatch }) {
  const byRound = useMemo(() => {
    const map = {};
    for (const m of allMatches) {
      if (!map[m.round]) map[m.round] = [];
      map[m.round].push(m);
    }
    // Sort each round by match_index
    for (const r in map) map[r].sort((a, b) => a.match_index - b.match_index);
    return map;
  }, [allMatches]);

  const handleMatchClick = (m) => {
    if (onScrollToMatch && m.round === currentRound && !m.is_bye) {
      onScrollToMatch(m.id);
    } else {
      const el = document.getElementById(`match-card-${m.id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const renderThumb = (item) => {
    const url = imageMap?.get(item);
    if (!url) return null;
    return <img src={url} alt="" className="cb-mini-thumb" />;
  };

  return (
    <div className="cb-bracket-overview">
      <div className="cb-bracket-rounds-scroll">
        {Array.from({ length: totalRounds }, (_, r) => {
          const roundMatches = byRound[r] || [];
          const isActive = r === currentRound;
          const isDone = r < currentRound;
          const isFuture = r > currentRound;
          return (
            <div key={r} className={`cb-bracket-round${isActive ? " cb-round-active" : isDone ? " cb-round-done" : " cb-round-future"}`}>
              <div className="cb-bracket-round-label">
                {getRoundName(r, totalRounds)}
              </div>
              <div className="cb-bracket-round-matches">
                {roundMatches.map(m => (
                  <div
                    key={m.id}
                    className={`cb-mini-match${m.winner ? " resolved" : ""}${m.is_bye ? " bye" : ""}${isActive && !m.is_bye ? " active-match" : ""}`}
                    onClick={() => handleMatchClick(m)}
                    role={isActive && !m.is_bye ? "button" : undefined}
                    tabIndex={isActive && !m.is_bye ? 0 : undefined}
                  >
                    <div className="cb-mini-slot">
                      {renderThumb(m.item_a)}
                      <span className={`cb-mini-item${m.winner === m.item_a ? " winner" : ""}`}>
                        {m.item_a || "BYE"}
                      </span>
                    </div>
                    <span className="cb-mini-vs">vs</span>
                    <div className="cb-mini-slot">
                      {renderThumb(m.item_b)}
                      <span className={`cb-mini-item${m.winner === m.item_b ? " winner" : ""}`}>
                        {m.item_b || "BYE"}
                      </span>
                    </div>
                  </div>
                ))}
                {isFuture && roundMatches.length === 0 && (
                  Array.from({ length: Math.ceil((byRound[0]?.length || 1) / Math.pow(2, r)) }, (_, i) => (
                    <div key={`tbd-${i}`} className="cb-mini-match future-tbd">
                      <div className="cb-mini-slot"><span className="cb-mini-item">?</span></div>
                      <span className="cb-mini-vs">vs</span>
                      <div className="cb-mini-slot"><span className="cb-mini-item">?</span></div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
        {/* Champion slot */}
        <div className="cb-bracket-round cb-round-champion">
          <div className="cb-bracket-round-label">Champion</div>
          <div className="cb-bracket-round-matches">
            <div className="cb-mini-match champion">
              {allMatches.find(m => m.round === totalRounds - 1)?.winner ? (
                <span className="cb-champion-name">
                  👑 {allMatches.find(m => m.round === totalRounds - 1).winner}
                </span>
              ) : (
                <span className="cb-mini-tbd">?</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MAIN VIEW — COMMUNITY BRACKET PAGE
// =====================================================================
export function CommunityBracketView() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bracket, setBracket] = useState(null);
  const [matches, setMatches] = useState([]);
  const [userVotes, setUserVotes] = useState({});  // match_id -> 'a'|'b'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [imageMap, setImageMap] = useState(new Map());
  const [showYouTube, setShowYouTube] = useState(false);

  // Find voting deadline for current round
  const currentDeadline = useMemo(() => {
    const current = matches.find(m => m.round === bracket?.current_round && !m.is_bye && m.voting_ends_at);
    return current?.voting_ends_at || null;
  }, [matches, bracket?.current_round]);

  const countdown = useCountdown(currentDeadline);

  // ─── FETCH IMAGES WHEN BRACKET LOADS ───
  useEffect(() => {
    if (!bracket?.items || bracket.items.length === 0) return;
    fetchItemImages(bracket.items).then(map => setImageMap(map));
  }, [bracket?.id]);

  // ─── DISMISS IMAGE (cycle to next Wikipedia result) ───
  const handleDismissImage = useCallback((term) => {
    const nextUrl = dismissImage(term);
    setImageMap(prev => {
      const copy = new Map(prev);
      copy.set(term, nextUrl);
      return copy;
    });
  }, []);

  // ─── LOAD BRACKET + MATCHES ───
  const loadBracket = useCallback(async () => {
    if (!supabase || !id) return;
    try {
      const { data: b, error: bErr } = await supabase
        .from("community_brackets")
        .select("*")
        .eq("id", id)
        .single();
      if (bErr) throw bErr;
      setBracket(b);

      const { data: m, error: mErr } = await supabase
        .from("community_bracket_matches")
        .select("*")
        .eq("bracket_id", id)
        .order("round")
        .order("match_index");
      if (mErr) throw mErr;
      setMatches(m || []);

      // Load user votes for current round
      if (user) {
        const currentMatchIds = (m || [])
          .filter(x => x.round === b.current_round)
          .map(x => x.id);
        if (currentMatchIds.length > 0) {
          const { data: votes } = await supabase
            .from("community_bracket_votes")
            .select("match_id, voted_for")
            .eq("user_id", user.id)
            .in("match_id", currentMatchIds);
          const voteMap = {};
          for (const v of (votes || [])) voteMap[v.match_id] = v.voted_for;
          setUserVotes(voteMap);
        } else {
          setUserVotes({});
        }
      } else {
        setUserVotes({});
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => { loadBracket(); }, [loadBracket]);

  // ─── REALTIME SUBSCRIPTION ───
  useEffect(() => {
    if (!supabase || !id) return;

    const channel = supabase
      .channel(`cb-${id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "community_bracket_matches",
        filter: `bracket_id=eq.${id}`,
      }, (payload) => {
        if (payload.eventType === "UPDATE") {
          setMatches(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
        } else if (payload.eventType === "INSERT") {
          setMatches(prev => [...prev, payload.new]);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "community_brackets",
        filter: `id=eq.${id}`,
      }, (payload) => {
        setBracket(prev => prev ? { ...prev, ...payload.new } : payload.new);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // ─── VOTE ───
  const handleVote = useCallback(async (matchId, side) => {
    if (!supabase || !user) return;
    const oldVote = userVotes[matchId];

    // Optimistic update: update counts locally immediately
    setUserVotes(prev => ({ ...prev, [matchId]: side }));
    setMatches(prev => prev.map(m => {
      if (m.id !== matchId) return m;
      let { votes_a, votes_b } = m;
      if (oldVote) {
        // Changing vote: decrement old side
        if (oldVote === "a") votes_a--;
        else votes_b--;
      }
      // Increment new side
      if (side === "a") votes_a++;
      else votes_b++;
      return { ...m, votes_a, votes_b };
    }));

    try {
      const { error: vErr } = await supabase.rpc("cast_community_vote", {
        p_match_id: matchId,
        p_user_id: user.id,
        p_voted_for: side,
      });
      if (vErr) throw vErr;
    } catch (err) {
      console.error("Vote error:", err);
      // Rollback on error
      setUserVotes(prev => {
        const copy = { ...prev };
        if (oldVote) copy[matchId] = oldVote;
        else delete copy[matchId];
        return copy;
      });
      setMatches(prev => prev.map(m => {
        if (m.id !== matchId) return m;
        let { votes_a, votes_b } = m;
        // Undo the optimistic update
        if (side === "a") votes_a--;
        else votes_b--;
        if (oldVote) {
          if (oldVote === "a") votes_a++;
          else votes_b++;
        }
        return { ...m, votes_a, votes_b };
      }));
    }
  }, [user, userVotes]);

  // ─── ADVANCE ROUND (creator only) ───
  const handleAdvanceRound = useCallback(async () => {
    if (!supabase || !user || !bracket) return;
    if (bracket.creator_id !== user.id) return;
    setAdvancing(true);

    try {
      // Re-fetch fresh state to avoid stale closure
      const { data: freshBracket } = await supabase
        .from("community_brackets")
        .select("*")
        .eq("id", bracket.id)
        .single();
      if (!freshBracket || freshBracket.status !== "active") {
        await loadBracket();
        return;
      }

      const { data: freshMatches } = await supabase
        .from("community_bracket_matches")
        .select("*")
        .eq("bracket_id", bracket.id)
        .eq("round", freshBracket.current_round);

      const currentRound = freshBracket.current_round;
      const currentMatches = freshMatches || [];

      // Determine winners for non-BYE matches
      const updates = [];
      const winners = [];
      for (const m of currentMatches) {
        if (m.is_bye) {
          winners.push(m.winner);
          continue;
        }
        // Winner = most votes. Tie = item_a wins (first listed).
        const winner = m.votes_a >= m.votes_b ? m.item_a : m.item_b;
        updates.push({ id: m.id, winner });
        winners.push(winner);
      }

      // Update match winners
      for (const u of updates) {
        await supabase
          .from("community_bracket_matches")
          .update({ winner: u.winner })
          .eq("id", u.id);
      }

      const nextRound = currentRound + 1;

      // Check if tournament is complete
      if (nextRound >= freshBracket.total_rounds) {
        // Tournament finished — the final match winner is the champion
        const finalWinner = winners[0]; // Only 1 match in the final round
        await supabase
          .from("community_brackets")
          .update({
            status: "finished",
            champion: finalWinner,
            current_round: currentRound,
            updated_at: new Date().toISOString(),
          })
          .eq("id", bracket.id);
      } else {
        // Build next round matches
        const votingEndsAt = new Date(Date.now() + freshBracket.round_duration_hours * 3600000).toISOString();
        const nextMatches = [];
        for (let i = 0; i < winners.length; i += 2) {
          const a = winners[i] || null;
          const b = i + 1 < winners.length ? winners[i + 1] : null;
          const isBye = a === null || b === null;
          nextMatches.push({
            bracket_id: bracket.id,
            round: nextRound,
            match_index: Math.floor(i / 2),
            item_a: a,
            item_b: b,
            is_bye: isBye,
            winner: isBye ? (a ?? b) : null,
            voting_ends_at: isBye ? null : votingEndsAt,
          });
        }

        await supabase
          .from("community_bracket_matches")
          .insert(nextMatches);

        await supabase
          .from("community_brackets")
          .update({
            current_round: nextRound,
            updated_at: new Date().toISOString(),
          })
          .eq("id", bracket.id);
      }

      await loadBracket();
    } catch (err) {
      console.error("Advance error:", err);
    } finally {
      setAdvancing(false);
    }
  }, [user, bracket, loadBracket]);

  // ─── CANCEL TOURNAMENT (creator only) ───
  const handleCancelTournament = useCallback(async () => {
    if (!supabase || !user || !bracket) return;
    if (bracket.creator_id !== user.id) return;
    setCancelling(true);
    try {
      await supabase
        .from("community_brackets")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bracket.id);
      await loadBracket();
      setConfirmCancel(false);
      setShowAdminPanel(false);
    } catch (err) {
      console.error("Cancel error:", err);
    } finally {
      setCancelling(false);
    }
  }, [user, bracket, loadBracket]);

  // ─── RENDER ───
  if (loading) {
    return (
      <div className="cb-loading fade">
        <div className="cb-spinner" />
        <p>Chargement du tournoi…</p>
      </div>
    );
  }

  if (error || !bracket) {
    return (
      <div className="cb-error-page fade">
        <p className="cb-error">{error || "Tournoi introuvable"}</p>
        <button className="btn-ghost" onClick={() => navigate("/community")}>← Retour</button>
      </div>
    );
  }

  const isCreator = user?.id === bracket.creator_id;
  const currentRoundMatches = matches
    .filter(m => m.round === bracket.current_round && !m.is_bye)
    .sort((a, b) => a.match_index - b.match_index);
  const totalVotesThisRound = currentRoundMatches.reduce((sum, m) => sum + m.votes_a + m.votes_b, 0);
  const matchesWithVotes = currentRoundMatches.filter(m => (m.votes_a + m.votes_b) > 0).length;

  // ─── CANCELLED ───
  if (bracket.status === "cancelled") {
    return (
      <div className="cb-page-wrap">
      <div className="cb-page fade">
        <div className="cb-champion-screen">
          <div className="cb-ornament">✦ ✦ ✦</div>
          <h1 className="cb-champion-title" style={{ color: "var(--text-dim)" }}>Tournoi annulé</h1>
          <p className="cb-champion-subtitle">Ce tournoi a été annulé par son créateur.</p>
          <div className="cb-actions">
            <button className="btn-ghost" onClick={() => navigate("/community")}>← Tous les tournois</button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  // ─── FINISHED ───
  if (bracket.status === "finished") {
    return (
      <div className="cb-page-wrap">
      <div className="cb-page fade">
        <div className="cb-champion-screen">
          <div className="cb-ornament">✦ ✦ ✦</div>
          <p className="cb-champion-subtitle">Le champion élu par la communauté</p>
          {imageMap?.get(bracket.champion) && (
            <img src={imageMap.get(bracket.champion)} alt="" className="cb-champion-img" />
          )}
          <h1 className="cb-champion-title">👑 {bracket.champion}</h1>
          <div className="cb-champion-stats">
            <span className="badge">{bracket.items.length} combattants</span>
            <span className="badge">{bracket.total_rounds} tours</span>
          </div>
          <BracketOverview allMatches={matches} totalRounds={bracket.total_rounds} currentRound={-1} imageMap={imageMap} />
          <div className="cb-actions">
            <button className="btn-ghost" onClick={() => navigate("/community")}>← Tous les tournois</button>
          </div>
        </div>
      </div>
      </div>
    );
  }

  // ─── ACTIVE TOURNAMENT ───
  return (
    <div className="cb-page-wrap">
    <div className="cb-page fade">
      <div className="cb-header">
        <button className="cb-back-btn" onClick={() => navigate("/community")}>←</button>
        <div className="cb-header-info">
          <h1 className="cb-title">{bracket.title}</h1>
          <div className="cb-meta">
            <span className="cb-round-badge">
              {getRoundName(bracket.current_round, bracket.total_rounds)}
            </span>
            <span className="cb-meta-sep">·</span>
            <span className="cb-items-count">{bracket.items.length} combattants</span>
          </div>
        </div>
        {countdown && !countdown.expired && (
          <div className="cb-countdown">
            <span className="cb-countdown-label">Fin du vote dans</span>
            <span className="cb-countdown-time">{formatCountdown(countdown)}</span>
          </div>
        )}
        {countdown?.expired && (
          <div className="cb-countdown cb-countdown-expired">
            <span className="cb-countdown-label">Vote terminé !</span>
          </div>
        )}
        {isCreator && (
          <button
            className={`cb-admin-toggle${showAdminPanel ? " active" : ""}`}
            onClick={() => setShowAdminPanel(v => !v)}
            title="Panneau admin"
          >
            ⚙
          </button>
        )}
        <button
          className={`cb-yt-toggle${showYouTube ? " active" : ""}`}
          onClick={() => setShowYouTube(v => !v)}
          title={showYouTube ? "Masquer YouTube" : "Afficher YouTube"}
        >
          🎵
        </button>
      </div>

      {/* ─── ADMIN PANEL (creator only) ─── */}
      {isCreator && showAdminPanel && (
        <div className="cb-admin-panel">
          <div className="cb-admin-header">
            <span className="cb-admin-title">⚙ Panneau Administrateur</span>
            <button className="cb-admin-close" onClick={() => { setShowAdminPanel(false); setConfirmCancel(false); }}>✕</button>
          </div>

          <div className="cb-admin-stats">
            <div className="cb-admin-stat">
              <span className="cb-admin-stat-value">{totalVotesThisRound}</span>
              <span className="cb-admin-stat-label">votes ce tour</span>
            </div>
            <div className="cb-admin-stat">
              <span className="cb-admin-stat-value">{matchesWithVotes}/{currentRoundMatches.length}</span>
              <span className="cb-admin-stat-label">matchs avec votes</span>
            </div>
            <div className="cb-admin-stat">
              <span className="cb-admin-stat-value">Tour {bracket.current_round + 1}/{bracket.total_rounds}</span>
              <span className="cb-admin-stat-label">progression</span>
            </div>
          </div>

          <div className="cb-admin-section">
            <h4 className="cb-admin-section-title">Avancer le tournoi</h4>
            <p className="cb-admin-section-desc">
              Mettre fin au vote en cours et passer au tour suivant immédiatement.
              Les matchs sans vote seront tranchés en faveur du premier élément (A).
            </p>
            <button
              className="btn-gold cb-advance-btn"
              onClick={handleAdvanceRound}
              disabled={advancing}
            >
              {advancing ? "Avancement…" : countdown?.expired ? "Passer au tour suivant →" : "⚡ Forcer le passage au tour suivant"}
            </button>
          </div>

          <div className="cb-admin-section cb-admin-danger">
            <h4 className="cb-admin-section-title">Zone dangereuse</h4>
            {!confirmCancel ? (
              <button
                className="cb-cancel-btn"
                onClick={() => setConfirmCancel(true)}
              >
                Annuler le tournoi
              </button>
            ) : (
              <div className="cb-confirm-cancel">
                <p className="cb-confirm-text">⚠ Cette action est irréversible. Le tournoi sera définitivement annulé.</p>
                <div className="cb-confirm-actions">
                  <button
                    className="cb-cancel-confirm-btn"
                    onClick={handleCancelTournament}
                    disabled={cancelling}
                  >
                    {cancelling ? "Annulation…" : "Confirmer l'annulation"}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Non, garder
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Share link */}
      <div className="cb-share">
        <span className="cb-share-label">Partagez ce lien pour que la communauté vote :</span>
        <div className="cb-share-link">
          <input
            readOnly
            value={`${window.location.origin}/community/${bracket.id}`}
            onClick={e => e.target.select()}
            className="cb-share-input"
          />
          <button
            className="cb-copy-btn"
            onClick={() => navigator.clipboard.writeText(`${window.location.origin}/community/${bracket.id}`)}
          >
            Copier
          </button>
        </div>
      </div>

      {/* Login prompt */}
      {!user && (
        <div className="cb-login-prompt">
          <p>🔒 Connectez-vous pour voter !</p>
        </div>
      )}

      {/* Current round matches */}
      <div className="cb-matches-section">
        <h2 className="cb-section-title">
          Matchs en cours — {getRoundName(bracket.current_round, bracket.total_rounds)}
        </h2>
        <div className="cb-matches-grid">
          {currentRoundMatches.map(m => (
            <div key={m.id} id={`match-card-${m.id}`}>
            <MatchVoteCard
              match={m}
              userVote={userVotes[m.id]}
              onVote={handleVote}
              disabled={!user || countdown?.expired}
              imageMap={imageMap}
              onDismissImage={isCreator ? handleDismissImage : undefined}
              format={bracket?.format}
              showYouTube={showYouTube}
            />
            </div>
          ))}
        </div>
        {currentRoundMatches.length === 0 && (
          <p className="cb-no-matches">Aucun match à voter pour ce tour (tous les BYEs ont été résolus).</p>
        )}
      </div>

      {/* Bracket overview */}
      <div className="cb-overview-section">
        <h2 className="cb-section-title">Tableau du Tournoi</h2>
        <BracketOverview allMatches={matches} totalRounds={bracket.total_rounds} currentRound={bracket.current_round} imageMap={imageMap} />
      </div>
    </div>
    </div>
  );
}

// =====================================================================
// COMMUNITY BRACKETS LIST PAGE
// =====================================================================
export function CommunityBracketList({ onCreateNew }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [brackets, setBrackets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase
      .from("community_brackets")
      .select("*, profiles(pseudo)")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error) setBrackets(data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div className="cb-list-page fade">
      <div className="cb-list-header">
        <div>
          <div className="cb-ornament">✦ ✦ ✦</div>
          <h1 className="cb-list-title">Tournois Communautaires</h1>
          <p className="cb-list-subtitle">
            Votez ensemble pour élire le champion ! Tous les matchs se jouent en simultané.
          </p>
        </div>
        {user && (
          <button className="btn-gold" onClick={onCreateNew}>
            + Créer un tournoi
          </button>
        )}
      </div>

      {loading && (
        <div className="cb-loading">
          <div className="cb-spinner" />
        </div>
      )}

      {!loading && brackets.length === 0 && (
        <div className="cb-empty">
          <p>Aucun tournoi pour l'instant.</p>
          {user && <button className="btn-gold" onClick={onCreateNew}>Créer le premier tournoi !</button>}
        </div>
      )}

      <div className="cb-list-grid">
        {brackets.map(b => {
          const progress = b.status === "finished"
            ? 100
            : Math.round((b.current_round / b.total_rounds) * 100);

          return (
            <div
              key={b.id}
              className={`cb-list-card${b.status === "finished" ? " cb-finished" : ""}`}
              onClick={() => navigate(`/community/${b.id}`)}
              role="button"
              tabIndex={0}
            >
              <div className="cb-list-card-header">
                <h3 className="cb-list-card-title">{b.title}</h3>
                <span className={`cb-status-badge cb-status-${b.status}`}>
                  {b.status === "active" ? "⚔ En cours" : b.status === "finished" ? "👑 Terminé" : "Annulé"}
                </span>
              </div>
              <div className="cb-list-card-meta">
                <span>{b.items?.length || 0} combattants</span>
                <span>·</span>
                <span>Tour {b.current_round + 1}/{b.total_rounds}</span>
                <span>·</span>
                <span>par {b.profiles?.pseudo || "Anonyme"}</span>
              </div>
              {b.champion && (
                <div className="cb-list-card-champion">
                  👑 {b.champion}
                </div>
              )}
              <div className="cb-list-card-progress">
                <div className="cb-list-card-progress-bar" style={{ width: `${progress}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// WRAPPER — routed page
// =====================================================================
export default function CommunityBracketPage({ items, listName, listId, format }) {
  const navigate = useNavigate();

  const handleCreated = (bracketId) => {
    navigate(`/community/${bracketId}`);
  };

  // If we have items passed in, show creation form
  if (items && items.length >= 2) {
    return (
      <div className="cb-page-wrap">
        <CreateBracketForm
          items={items}
          listName={listName}
          listId={listId}
          format={format}
          onCreated={handleCreated}
          onCancel={() => navigate("/community")}
        />
      </div>
    );
  }

  // Otherwise show the list
  return (
    <div className="cb-page-wrap">
      <CommunityBracketList onCreateNew={() => navigate("/")} />
    </div>
  );
}
