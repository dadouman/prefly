import { useState, useCallback, useEffect } from "react";
import ItemLabel from "./ItemLabel";
import BracketDisplay from "./BracketDisplay";
import {
  buildBracket,
  propagate,
  findCurrentMatch,
  getRoundName,
  countTotalMatches,
  countResolvedMatches,
} from "./bracketEngine";

// =====================================================================
// BRACKET ARENA — Single Elimination Tournament (Solo Mode)
// Now uses shared BracketDisplay for visualization
// =====================================================================

export default function BracketArena({ items, format, imageMap, onDismissImage, onFinish, onReset }) {
  const [rounds, setRounds] = useState(() => buildBracket(items));
  const [chosen, setChosen] = useState(null);
  const [champion, setChampion] = useState(null);
  const [shakeScreen, setShakeScreen] = useState(false);
  const [history, setHistory] = useState([]);
  const [selectedMatch, setSelectedMatch] = useState(null);

  const totalRounds = rounds.length;
  const totalMatches = countTotalMatches(rounds);
  const resolvedMatches = countResolvedMatches(rounds);

  // Auto-select the first resolvable match when none is selected or selection becomes invalid
  useEffect(() => {
    if (selectedMatch) {
      const match = rounds[selectedMatch.round]?.[selectedMatch.match];
      if (match && match.a !== null && match.b !== null && match.winner === null && !match.isBye) {
        return; // Selection still valid
      }
    }
    const first = findCurrentMatch(rounds);
    setSelectedMatch(first);
  }, [rounds, selectedMatch]);

  const currentRoundName = selectedMatch
    ? getRoundName(selectedMatch.round, totalRounds)
    : "";

  const handleSelectMatch = useCallback((loc) => {
    if (chosen !== null) return;
    const match = rounds[loc.round]?.[loc.match];
    if (!match || match.winner !== null || match.isBye) return;
    if (match.a === null || match.b === null) return;
    setSelectedMatch(loc);
  }, [rounds, chosen]);

  const handleChoice = useCallback((side) => {
    if (chosen !== null || !selectedMatch) return;
    const match = rounds[selectedMatch.round]?.[selectedMatch.match];
    if (!match || match.winner !== null) return;

    setChosen(side);
    setShakeScreen(true);

    setTimeout(() => {
      setShakeScreen(false);
      setHistory(prev => [...prev, rounds]);
      const newRounds = rounds.map(r => r.map(m => ({ ...m })));
      const m = newRounds[selectedMatch.round][selectedMatch.match];
      m.winner = side === "a" ? m.a : m.b;

      propagate(newRounds);
      setRounds(newRounds);
      setChosen(null);
      setSelectedMatch(null); // Will auto-select next via useEffect

      const next = findCurrentMatch(newRounds);
      if (!next) {
        const finalWinner = newRounds[newRounds.length - 1][0]?.winner;
        if (finalWinner) {
          setTimeout(() => {
            setChampion(finalWinner);
            if (onFinish) {
              onFinish({ champion: finalWinner, resolvedMatches: countResolvedMatches(newRounds), items });
            }
          }, 200);
        }
      }
    }, 500);
  }, [chosen, selectedMatch, rounds, onFinish, items]);

  const handleUndo = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setRounds(prev);
    setChosen(null);
    setChampion(null);
    setSelectedMatch(null);
  }, [history]);

  // Keyboard shortcuts
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "ArrowLeft") handleChoice("a");
      if (e.key === "ArrowRight") handleChoice("b");
      if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); handleUndo(); }
      if (e.key === "Backspace") { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [handleChoice, handleUndo]);

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
            <BracketDisplay
              rounds={rounds}
              totalRounds={totalRounds}
              format={format}
              imageMap={imageMap}
              mode="solo"
              selectedMatch={null}
              onSelectMatch={() => {}}
              onPickWinner={() => {}}
              chosen={null}
            />
          </div>

          <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap", marginTop: "2rem" }}>
            {history.length > 0 && (
              <button className="bracket-undo-btn" onClick={handleUndo}>↩ Revenir en arrière</button>
            )}
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
          {history.length > 0 && (
            <button
              className="bracket-undo-btn"
              onClick={handleUndo}
              title="Revenir au choix précédent (Ctrl+Z)"
            >↩</button>
          )}
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

      {/* Unified bracket display */}
      <BracketDisplay
        rounds={rounds}
        totalRounds={totalRounds}
        format={format}
        imageMap={imageMap}
        onDismissImage={onDismissImage}
        mode="solo"
        selectedMatch={selectedMatch}
        onSelectMatch={handleSelectMatch}
        onPickWinner={handleChoice}
        chosen={chosen}
      />
    </div>
  );
}
