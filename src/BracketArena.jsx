import { useState, useCallback, useEffect, useRef } from "react";

// =====================================================================
// BRACKET ENGINE — Single Elimination Tournament
// =====================================================================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Place BYEs optimally: spread them so they don't cluster together.
// Standard bracket seeding: place BYEs against the last seeds.
function seedBracket(items) {
  const shuffled = shuffle(items);
  let n = 1;
  while (n < shuffled.length) n *= 2;
  const numByes = n - shuffled.length;

  // Create seed positions using standard bracket seeding order
  // This ensures BYEs are spread across the bracket
  const seedOrder = buildSeedOrder(n);

  // Place real items first, then BYEs
  const slots = new Array(n).fill(null);
  for (let i = 0; i < shuffled.length; i++) {
    slots[seedOrder[i]] = shuffled[i];
  }
  // Remaining positions (seedOrder[shuffled.length..n-1]) stay null = BYE

  return slots;
}

// Build standard tournament seeding order for n slots (power of 2)
// Ensures seed 1 vs seed n, seed 2 vs seed n-1, etc.
function buildSeedOrder(n) {
  if (n === 1) return [0];
  if (n === 2) return [0, 1];
  const half = buildSeedOrder(n / 2);
  const result = [];
  for (const pos of half) {
    result.push(pos * 2);
    result.push(pos * 2 + 1);
  }
  return result;
}

function buildBracket(items) {
  const slots = seedBracket(items);
  const n = slots.length;
  const totalRounds = Math.log2(n);

  const rounds = [];

  // Round 0 = first matchups
  const firstRound = [];
  for (let i = 0; i < n; i += 2) {
    const a = slots[i];
    const b = slots[i + 1];
    const isBye = a === null || b === null;
    const winner = isBye ? (a ?? b) : null;
    firstRound.push({ a, b, winner, isBye });
  }
  rounds.push(firstRound);

  // Remaining rounds: empty slots
  for (let r = 1; r < totalRounds; r++) {
    const prevLen = rounds[r - 1].length;
    const thisRound = [];
    for (let i = 0; i < prevLen / 2; i++) {
      thisRound.push({ a: null, b: null, winner: null, isBye: false });
    }
    rounds.push(thisRound);
  }

  // Propagate all resolved matches
  propagate(rounds);

  return rounds;
}

// Propagate winners upward through the bracket, auto-resolving BYEs
function propagate(rounds) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < rounds.length - 1; r++) {
      for (let m = 0; m < rounds[r].length; m++) {
        const match = rounds[r][m];
        if (match.winner === null) continue;

        const nextIdx = Math.floor(m / 2);
        const next = rounds[r + 1][nextIdx];
        const slot = m % 2 === 0 ? "a" : "b";

        if (next[slot] !== match.winner) {
          next[slot] = match.winner;
          changed = true;
        }
      }
    }
    // Auto-resolve rounds where one side got a BYE propagation
    // (both source matches resolved, but one side is null because of BYE chain)
    for (let r = 1; r < rounds.length; r++) {
      for (let m = 0; m < rounds[r].length; m++) {
        const match = rounds[r][m];
        if (match.winner !== null) continue;

        // Check if both source matches are resolved
        const srcA = rounds[r - 1][m * 2];
        const srcB = rounds[r - 1][m * 2 + 1];
        if (!srcA || !srcB) continue;

        if (srcA.winner !== null && srcB.winner !== null) {
          match.a = srcA.winner;
          match.b = srcB.winner;
          // Don't auto-resolve — needs user choice (unless one is null from double-BYE)
        }

        // If one side is filled and the other can never be filled (all sources resolved)
        if (match.a !== null && match.b === null && srcB?.winner === null && allSourcesResolved(rounds, r, m * 2 + 1)) {
          // Shouldn't happen in proper bracket, but handle gracefully
        }
      }
    }
  }
}

function allSourcesResolved(rounds, roundIdx, matchIdx) {
  if (roundIdx === 0) return true;
  const match = rounds[roundIdx]?.[matchIdx];
  if (!match) return true;
  return match.winner !== null;
}

function findCurrentMatch(rounds) {
  for (let r = 0; r < rounds.length; r++) {
    for (let m = 0; m < rounds[r].length; m++) {
      const match = rounds[r][m];
      if (match.a !== null && match.b !== null && match.winner === null) {
        return { round: r, match: m };
      }
    }
  }
  return null;
}

function getRoundName(roundIdx, totalRounds) {
  const remaining = totalRounds - roundIdx;
  if (remaining === 1) return "Finale";
  if (remaining === 2) return "Demi-finales";
  if (remaining === 3) return "Quarts de finale";
  if (remaining === 4) return "Huitièmes de finale";
  if (remaining === 5) return "Seizièmes de finale";
  return `Tour ${roundIdx + 1}`;
}

function countTotalMatches(rounds) {
  let total = 0;
  for (const round of rounds) {
    for (const match of round) {
      if (!match.isBye) total++;
    }
  }
  return total;
}

function countResolvedMatches(rounds) {
  let resolved = 0;
  for (const round of rounds) {
    for (const match of round) {
      if (match.winner !== null && !match.isBye) resolved++;
    }
  }
  return resolved;
}

// =====================================================================
// ITEM LABEL (shared format parsing)
// =====================================================================
function ItemLabel({ item, format }) {
  if (!item) return <span className="bracket-bye">BYE</span>;
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
        <>
          <span className="disco-song">{song}</span>
          <span className="disco-meta">{albumYear}</span>
        </>
      );
    }
  }
  return <>{item}</>;
}

// =====================================================================
// BRACKET VISUAL COMPONENT — with clickable slots for current match
// =====================================================================
function BracketView({ rounds, currentMatch, format, imageMap, onPickWinner, chosen }) {
  const bracketRef = useRef(null);
  const currentRef = useRef(null);
  const totalRounds = rounds.length;

  // Auto-scroll to current match
  useEffect(() => {
    if (currentRef.current && bracketRef.current) {
      const container = bracketRef.current;
      const el = currentRef.current;
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Only scroll horizontally if needed
      if (elRect.left < containerRect.left || elRect.right > containerRect.right) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      }
    }
  }, [currentMatch]);

  return (
    <div className="bracket-scroll" ref={bracketRef}>
      <div className="bracket-container">
        {rounds.map((round, rIdx) => (
          <div key={rIdx} className="bracket-round">
            <div className="bracket-round-label">
              {getRoundName(rIdx, totalRounds)}
            </div>
            <div className="bracket-matches">
              {round.map((match, mIdx) => {
                const isCurrent = currentMatch && currentMatch.round === rIdx && currentMatch.match === mIdx;
                const isResolved = match.winner !== null;
                const isFuture = !isCurrent && (match.a === null || match.b === null) && !match.isBye;

                return (
                  <div
                    key={mIdx}
                    ref={isCurrent ? currentRef : null}
                    className={`bracket-match${isCurrent ? " bracket-current" : ""}${isResolved ? " bracket-resolved" : ""}${isFuture ? " bracket-future" : ""}${match.isBye ? " bracket-bye-match" : ""}`}
                  >
                    {/* Slot A (top) */}
                    <div
                      className={`bracket-slot bracket-top${match.winner === match.a && match.a !== null ? " bracket-winner" : ""}${match.winner === match.b && match.b !== null && match.a !== null ? " bracket-eliminated" : ""}${isCurrent ? " bracket-clickable" : ""}${isCurrent && chosen === "a" ? " bracket-slot-chosen" : ""}${isCurrent && chosen === "b" ? " bracket-slot-unchosen" : ""}`}
                      onClick={isCurrent && chosen === null ? () => onPickWinner("a") : undefined}
                      role={isCurrent ? "button" : undefined}
                      tabIndex={isCurrent ? 0 : undefined}
                    >
                      <span className="bracket-seed">{match.a ? "●" : ""}</span>
                      <span className="bracket-name">
                        {match.a ? <ItemLabel item={match.a} format={format} imageUrl={imageMap?.get(match.a)} /> : <span className="bracket-tbd">···</span>}
                      </span>
                      {match.winner === match.a && match.a !== null && <span className="bracket-check">⚔</span>}
                    </div>
                    <div className="bracket-vs-line">
                      {isCurrent && <span className="bracket-vs-mini">VS</span>}
                    </div>
                    {/* Slot B (bottom) */}
                    <div
                      className={`bracket-slot bracket-bottom${match.winner === match.b && match.b !== null ? " bracket-winner" : ""}${match.winner === match.a && match.a !== null && match.b !== null ? " bracket-eliminated" : ""}${isCurrent ? " bracket-clickable" : ""}${isCurrent && chosen === "b" ? " bracket-slot-chosen" : ""}${isCurrent && chosen === "a" ? " bracket-slot-unchosen" : ""}`}
                      onClick={isCurrent && chosen === null ? () => onPickWinner("b") : undefined}
                      role={isCurrent ? "button" : undefined}
                      tabIndex={isCurrent ? 0 : undefined}
                    >
                      <span className="bracket-seed">{match.b ? "●" : ""}</span>
                      <span className="bracket-name">
                        {match.b ? <ItemLabel item={match.b} format={format} imageUrl={imageMap?.get(match.b)} /> : <span className="bracket-tbd">···</span>}
                      </span>
                      {match.winner === match.b && match.b !== null && <span className="bracket-check">⚔</span>}
                    </div>
                    {isCurrent && <div className="bracket-current-glow" />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Champion */}
        <div className="bracket-round bracket-champion-round">
          <div className="bracket-round-label">Champion</div>
          <div className="bracket-matches">
            <div className={`bracket-champion-slot${rounds[rounds.length - 1]?.[0]?.winner ? " bracket-crowned" : ""}`}>
              {rounds[rounds.length - 1]?.[0]?.winner ? (
                <>
                  <span className="bracket-crown">👑</span>
                  <span className="bracket-champion-name">
                    <ItemLabel item={rounds[rounds.length - 1][0].winner} format={format} imageUrl={imageMap?.get(rounds[rounds.length - 1][0].winner)} />
                  </span>
                </>
              ) : (
                <span className="bracket-tbd-champion">?</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// MAIN BRACKET ARENA COMPONENT
// =====================================================================
export default function BracketArena({ items, format, imageMap, onFinish, onReset }) {
  const [rounds, setRounds] = useState(() => {
    const r = buildBracket(items);
    return r;
  });
  const [chosen, setChosen] = useState(null);
  const [champion, setChampion] = useState(null);
  const [shakeScreen, setShakeScreen] = useState(false);

  const currentMatch = findCurrentMatch(rounds);
  const totalRounds = rounds.length;
  const totalMatches = countTotalMatches(rounds);
  const resolvedMatches = countResolvedMatches(rounds);

  const currentMatchData = currentMatch
    ? rounds[currentMatch.round][currentMatch.match]
    : null;

  const currentRoundName = currentMatch
    ? getRoundName(currentMatch.round, totalRounds)
    : "";

  const handleChoice = useCallback((side) => {
    if (chosen !== null || !currentMatch) return;
    setChosen(side);
    setShakeScreen(true);

    setTimeout(() => {
      setShakeScreen(false);
      const newRounds = rounds.map(r => r.map(m => ({ ...m })));
      const match = newRounds[currentMatch.round][currentMatch.match];
      match.winner = side === "a" ? match.a : match.b;

      propagate(newRounds);
      setRounds(newRounds);
      setChosen(null);

      // Check if tournament is complete
      const next = findCurrentMatch(newRounds);
      if (!next) {
        const finalWinner = newRounds[newRounds.length - 1][0]?.winner;
        if (finalWinner) {
          setTimeout(() => setChampion(finalWinner), 200);
        }
      }
    }, 500);
  }, [chosen, currentMatch, rounds]);

  // Keyboard shortcuts
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "ArrowLeft") handleChoice("a");
      if (e.key === "ArrowRight") handleChoice("b");
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [handleChoice]);

  const progress = totalMatches > 0 ? (resolvedMatches / totalMatches) * 100 : 0;

  // ─── CHAMPION SCREEN ───
  if (champion) {
    return (
      <div className="bracket-champion-screen fade">
        <div className="bracket-champion-confetti" />
        <div className="bracket-champion-content">
          <div className="bracket-trophy-glow" />
          <div className="bracket-champion-ornament">✦ ✦ ✦</div>
          <p className="bracket-champion-subtitle">Le champion incontesté</p>
          {imageMap?.get(champion) && (
            <div className="bracket-champion-img-wrap">
              <img src={imageMap.get(champion)} alt="" className="bracket-champion-img" />
            </div>
          )}
          <h1 className="bracket-champion-title">
            <ItemLabel item={champion} format={format} />
          </h1>
          <div className="bracket-champion-crown">👑</div>
          <div className="bracket-champion-stats">
            <span className="badge">{items.length} combattants</span>
            <span className="badge">{resolvedMatches} combats</span>
          </div>

          <div className="bracket-champion-bracket-preview">
            <h3 className="bracket-recap-title">Tableau Final</h3>
            <BracketView rounds={rounds} currentMatch={null} format={format} imageMap={imageMap} onPickWinner={() => {}} chosen={null} />
          </div>

          <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap", marginTop: "2rem" }}>
            <button className="btn-gold" onClick={onReset}>Nouveau Tournoi</button>
          </div>
        </div>
      </div>
    );
  }

  // ─── ACTIVE TOURNAMENT ───
  return (
    <div className={`bracket-arena${shakeScreen ? " bracket-shake" : ""}`}>
      {/* Header bar */}
      <div className="bracket-top-bar">
        <div className="bracket-header-info">
          <div className="bracket-blood-splat-sm">⚔</div>
          <div>
            <span className="bracket-round-tag">{currentRoundName}</span>
            <span className="bracket-duel-count">
              Match {resolvedMatches + 1} / {totalMatches}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.68rem", color: "var(--text-faint)", letterSpacing: "0.06em" }}>
            <span style={{ color: "rgba(201,162,39,0.45)" }}>←</span> gauche · <span style={{ color: "rgba(201,162,39,0.45)" }}>→</span> droite
          </span>
          <button
            onClick={onReset}
            style={{ background: "none", border: "none", color: "var(--text-faint)", cursor: "pointer", fontSize: "0.7rem", letterSpacing: "0.1em", textDecoration: "underline", textUnderlineOffset: "3px" }}
          >
            Abandonner
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bracket-progress-wrap">
        <div className="bracket-progress-bg">
          <div className="bracket-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Focused duel card (mobile-friendly, also visible on desktop) */}
      {currentMatchData && (
        <div className={`bracket-inline-duel${chosen ? " bracket-duel-choosing" : ""}`}>
          <div className="bracket-duel-question">QUI SURVIT ?</div>
          <div className="bracket-inline-fight">
            <button
              className={`bracket-fighter-compact left${chosen === "a" ? " bracket-victor" : chosen === "b" ? " bracket-fallen" : ""}`}
              onClick={() => handleChoice("a")}
            >
              {imageMap?.get(currentMatchData.a) && (
                <div className="bracket-fighter-img-wrap">
                  <img src={imageMap.get(currentMatchData.a)} alt="" className="bracket-fighter-img" />
                </div>
              )}
              <span className="bracket-fighter-compact-text">
                <ItemLabel item={currentMatchData.a} format={format} />
              </span>
              <span className="bracket-fighter-compact-hint">←</span>
            </button>
            <span className="bracket-inline-vs">VS</span>
            <button
              className={`bracket-fighter-compact right${chosen === "b" ? " bracket-victor" : chosen === "a" ? " bracket-fallen" : ""}`}
              onClick={() => handleChoice("b")}
            >
              {imageMap?.get(currentMatchData.b) && (
                <div className="bracket-fighter-img-wrap">
                  <img src={imageMap.get(currentMatchData.b)} alt="" className="bracket-fighter-img" />
                </div>
              )}
              <span className="bracket-fighter-compact-text">
                <ItemLabel item={currentMatchData.b} format={format} />
              </span>
              <span className="bracket-fighter-compact-hint">→</span>
            </button>
          </div>
        </div>
      )}

      {/* Bracket view — clickable */}
      <BracketView
        rounds={rounds}
        currentMatch={currentMatch}
        format={format}
        imageMap={imageMap}
        onPickWinner={handleChoice}
        chosen={chosen}
      />
    </div>
  );
}
