import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import ItemLabel from "./ItemLabel";
import {
  getRoundName,
  getDestinationMatch,
  getFeederMatches,
  getNextOpponentPreview,
} from "./bracketEngine";

// =====================================================================
// BRACKET DISPLAY — Unified bracket visualization
//
// Two rendering modes:
//   1. "round-view"   — pre-R16: one round at a time, large matchup cards
//   2. "split-bracket" — R16 onwards: two halves with final in the center
//
// Used by both BracketArena (solo) and CommunityBracket (community)
// =====================================================================

// Threshold: rounds with > 8 matches use round-view
const SPLIT_BRACKET_THRESHOLD = 8;

// ─── HELPERS ───

function isMatchClickable(match, mode, currentRound) {
  if (match.isBye) return false;
  if (match.a === null || match.b === null) return false;
  if (mode === "solo") return match.winner === null;
  // community: only current round matches
  return match.winner === null;
}

function getMatchKey(roundIdx, matchIdx) {
  return `${roundIdx}-${matchIdx}`;
}

// ─── DUEL CARD — shared fight card above the bracket ───

function DuelCard({
  match, roundIdx, totalRounds, format, imageMap, onDismissImage,
  mode, onPickWinner, chosen,
  userVote, onVote, disabled,
  nextOpponent, showYouTube, YouTubePlayer,
}) {
  if (!match || match.isBye) return null;

  const roundName = getRoundName(roundIdx, totalRounds);

  const renderThumb = (item, side) => {
    const url = imageMap?.get(item);
    if (!url) return null;
    return (
      <div className="bd-duel-img-wrap">
        <img src={url} alt="" className="bd-duel-img" />
        {onDismissImage && (
          <button
            className="bd-img-dismiss"
            onClick={(e) => { e.stopPropagation(); onDismissImage(item); }}
            title="Autre image"
          >×</button>
        )}
      </div>
    );
  };

  // Community mode: vote buttons
  if (mode === "community") {
    const totalVotes = (match.votes_a || 0) + (match.votes_b || 0);
    const pctA = totalVotes > 0 ? Math.round(((match.votes_a || 0) / totalVotes) * 100) : 50;
    const pctB = 100 - pctA;

    return (
      <div className="bd-duel-card bd-duel-community">
        <div className="bd-duel-header">
          <span className="bd-duel-round">{roundName}</span>
          {nextOpponent && (
            <span className="bd-duel-next">
              Si victoire → contre <strong>{typeof nextOpponent === 'string' ? nextOpponent : '?'}</strong>
            </span>
          )}
        </div>
        <div className="bd-duel-fight">
          <button
            className={`bd-duel-fighter${userVote === "a" ? " bd-voted" : ""}${match.winner === match.item_a ? " bd-winner-side" : ""}${match.winner && match.winner !== match.item_a ? " bd-loser-side" : ""}`}
            onClick={() => !disabled && onVote?.(match.id, "a")}
            disabled={disabled || !!match.winner}
          >
            {renderThumb(match.item_a, "a")}
            <span className="bd-duel-name">
              <ItemLabel item={match.item_a} format={format} />
            </span>
            {showYouTube && YouTubePlayer && <YouTubePlayer item={match.item_a} />}
            <div className="bd-vote-bar-wrap">
              <div className="bd-vote-bar bd-bar-a" style={{ width: `${pctA}%` }} />
            </div>
            <span className="bd-vote-count">{match.votes_a || 0} vote{(match.votes_a || 0) !== 1 ? "s" : ""} ({pctA}%)</span>
          </button>
          <span className="bd-duel-vs">VS</span>
          <button
            className={`bd-duel-fighter${userVote === "b" ? " bd-voted" : ""}${match.winner === match.item_b ? " bd-winner-side" : ""}${match.winner && match.winner !== match.item_b ? " bd-loser-side" : ""}`}
            onClick={() => !disabled && onVote?.(match.id, "b")}
            disabled={disabled || !!match.winner}
          >
            {renderThumb(match.item_b, "b")}
            <span className="bd-duel-name">
              <ItemLabel item={match.item_b} format={format} />
            </span>
            {showYouTube && YouTubePlayer && <YouTubePlayer item={match.item_b} />}
            <div className="bd-vote-bar-wrap">
              <div className="bd-vote-bar bd-bar-b" style={{ width: `${pctB}%` }} />
            </div>
            <span className="bd-vote-count">{match.votes_b || 0} vote{(match.votes_b || 0) !== 1 ? "s" : ""} ({pctB}%)</span>
          </button>
        </div>
        <div className="bd-duel-total">{totalVotes} vote{totalVotes !== 1 ? "s" : ""} au total</div>
      </div>
    );
  }

  // Solo mode: pick winner
  return (
    <div className={`bd-duel-card${chosen ? " bd-duel-choosing" : ""}`}>
      <div className="bd-duel-header">
        <span className="bd-duel-question">QUI SURVIT ?</span>
        {nextOpponent && (
          <span className="bd-duel-next">
            Prochain duel → <strong>{nextOpponent}</strong>
          </span>
        )}
      </div>
      <div className="bd-duel-fight">
        <button
          className={`bd-duel-fighter left${chosen === "a" ? " bd-victor" : chosen === "b" ? " bd-fallen" : ""}`}
          onClick={() => onPickWinner?.("a")}
        >
          {renderThumb(match.a, "a")}
          <span className="bd-duel-name">
            <ItemLabel item={match.a} format={format} />
          </span>
          <span className="bd-duel-hint">←</span>
        </button>
        <span className="bd-duel-vs">VS</span>
        <button
          className={`bd-duel-fighter right${chosen === "b" ? " bd-victor" : chosen === "a" ? " bd-fallen" : ""}`}
          onClick={() => onPickWinner?.("b")}
        >
          {renderThumb(match.b, "b")}
          <span className="bd-duel-name">
            <ItemLabel item={match.b} format={format} />
          </span>
          <span className="bd-duel-hint">→</span>
        </button>
      </div>
    </div>
  );
}

// ─── ROUND VIEW — pre-R16 large card grid ───

function RoundView({
  rounds, totalRounds, format, imageMap, onDismissImage,
  mode, selectedMatch, onSelectMatch, onPickWinner, chosen,
  userVotes, onVote, disabled, viewingRound, onChangeRound,
  showYouTube, YouTubePlayer,
}) {
  const matchesInRound = rounds[viewingRound] || [];

  // Find the first round that has any playable matches (not all byes/resolved)
  const roundTabs = rounds.map((round, rIdx) => {
    const hasUnresolved = round.some(m => !m.isBye && m.winner === null && m.a !== null && m.b !== null);
    const hasMatches = round.some(m => !m.isBye);
    const allResolved = hasMatches && round.every(m => m.isBye || m.winner !== null);
    return { idx: rIdx, name: getRoundName(rIdx, totalRounds), hasUnresolved, allResolved, hasMatches };
  });

  // For community, only show rounds up to current_round + future stubs
  // For solo, show all rounds that have matches

  return (
    <div className="bd-round-view">
      {/* Round tabs */}
      <div className="bd-round-tabs">
        {roundTabs.map(tab => {
          if (!tab.hasMatches && rounds[tab.idx].length === 0) return null;
          const isActive = tab.idx === viewingRound;
          return (
            <button
              key={tab.idx}
              className={`bd-round-tab${isActive ? " active" : ""}${tab.allResolved ? " done" : ""}${tab.hasUnresolved ? " playable" : ""}`}
              onClick={() => onChangeRound(tab.idx)}
            >
              {tab.name}
              {tab.allResolved && <span className="bd-tab-check">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Match cards grid */}
      <div className="bd-round-grid">
        {matchesInRound.map((match, mIdx) => {
          if (match.isBye) return null;
          const key = getMatchKey(viewingRound, mIdx);
          const isSelected = selectedMatch && selectedMatch.round === viewingRound && selectedMatch.match === mIdx;
          const clickable = isMatchClickable(match, mode, viewingRound);
          const isResolved = match.winner !== null;

          // Community mode fields
          const itemA = mode === "community" ? match.item_a : match.a;
          const itemB = mode === "community" ? match.item_b : match.b;
          const winner = match.winner;
          const totalVotes = (match.votes_a || 0) + (match.votes_b || 0);
          const pctA = totalVotes > 0 ? Math.round(((match.votes_a || 0) / totalVotes) * 100) : 50;
          const pctB = 100 - pctA;
          const userVote = mode === "community" ? userVotes?.[match.id] : null;

          return (
            <div
              key={key}
              className={`bd-round-card${isSelected ? " bd-selected" : ""}${isResolved ? " bd-resolved" : ""}${clickable ? " bd-clickable" : ""}`}
              onClick={() => clickable && onSelectMatch?.({ round: viewingRound, match: mIdx })}
            >
              <div className="bd-round-card-inner">
                {/* Side A */}
                <div className={`bd-card-side${winner === itemA ? " bd-side-winner" : ""}${winner && winner !== itemA ? " bd-side-loser" : ""}${userVote === "a" ? " bd-side-voted" : ""}`}>
                  {imageMap?.get(itemA) && (
                    <img src={imageMap.get(itemA)} alt="" className="bd-card-thumb" />
                  )}
                  <span className="bd-card-name">
                    <ItemLabel item={itemA} format={format} />
                  </span>
                  {mode === "community" && (
                    <span className="bd-card-votes">{match.votes_a || 0} ({pctA}%)</span>
                  )}
                </div>

                <span className="bd-card-vs">VS</span>

                {/* Side B */}
                <div className={`bd-card-side${winner === itemB ? " bd-side-winner" : ""}${winner && winner !== itemB ? " bd-side-loser" : ""}${userVote === "b" ? " bd-side-voted" : ""}`}>
                  {imageMap?.get(itemB) && (
                    <img src={imageMap.get(itemB)} alt="" className="bd-card-thumb" />
                  )}
                  <span className="bd-card-name">
                    <ItemLabel item={itemB} format={format} />
                  </span>
                  {mode === "community" && (
                    <span className="bd-card-votes">{match.votes_b || 0} ({pctB}%)</span>
                  )}
                </div>
              </div>

              {/* Vote bar for community */}
              {mode === "community" && totalVotes > 0 && (
                <div className="bd-card-vote-bar">
                  <div className="bd-card-bar-a" style={{ width: `${pctA}%` }} />
                </div>
              )}

              {isSelected && <div className="bd-card-glow" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SPLIT BRACKET VIEW — R16 onwards, two halves + final center ───

function SplitBracketSlot({ match, mIdx, rIdx, totalRounds, format, imageMap, mode,
  selectedMatch, highlightedKeys, onSelectMatch, onPickWinner, chosen }) {
  const key = getMatchKey(rIdx, mIdx);
  const isSelected = selectedMatch && selectedMatch.round === rIdx && selectedMatch.match === mIdx;
  const isHighlighted = highlightedKeys.has(key);
  const clickable = isMatchClickable(match, mode);
  const isResolved = match.winner !== null;
  const isFuture = !match.isBye && (match.a === null || match.b === null);

  const itemA = mode === "community" ? (match.item_a ?? match.a) : match.a;
  const itemB = mode === "community" ? (match.item_b ?? match.b) : match.b;
  const winner = match.winner;

  return (
    <div
      className={`bd-bracket-match${isSelected ? " bd-match-selected" : ""}${isHighlighted ? " bd-match-highlight" : ""}${isResolved ? " bd-match-resolved" : ""}${isFuture ? " bd-match-future" : ""}${match.isBye ? " bd-match-bye" : ""}${clickable ? " bd-match-clickable" : ""}`}
      onClick={() => {
        if (clickable) {
          onSelectMatch?.({ round: rIdx, match: mIdx });
        }
      }}
    >
      <div
        className={`bd-bracket-slot bd-slot-top${winner === itemA && itemA != null ? " bd-slot-winner" : ""}${winner === itemB && itemB != null && itemA != null ? " bd-slot-eliminated" : ""}${isSelected && chosen === "a" ? " bd-slot-chosen" : ""}${isSelected && chosen === "b" ? " bd-slot-unchosen" : ""}`}
        onClick={(e) => {
          if (isSelected && chosen === null && mode === "solo") {
            e.stopPropagation();
            onPickWinner?.("a");
          }
        }}
        role={isSelected && mode === "solo" ? "button" : undefined}
      >
        <span className="bd-slot-seed">{itemA ? "●" : ""}</span>
        <span className="bd-slot-name">
          {itemA ? <ItemLabel item={itemA} format={format} /> : <span className="bd-slot-tbd">···</span>}
        </span>
        {winner === itemA && itemA != null && <span className="bd-slot-check">⚔</span>}
      </div>
      <div className="bd-slot-vs-line">
        {(isSelected || (clickable && !isResolved)) && <span className="bd-slot-vs-mini">VS</span>}
      </div>
      <div
        className={`bd-bracket-slot bd-slot-bottom${winner === itemB && itemB != null ? " bd-slot-winner" : ""}${winner === itemA && itemA != null && itemB != null ? " bd-slot-eliminated" : ""}${isSelected && chosen === "b" ? " bd-slot-chosen" : ""}${isSelected && chosen === "a" ? " bd-slot-unchosen" : ""}`}
        onClick={(e) => {
          if (isSelected && chosen === null && mode === "solo") {
            e.stopPropagation();
            onPickWinner?.("b");
          }
        }}
        role={isSelected && mode === "solo" ? "button" : undefined}
      >
        <span className="bd-slot-seed">{itemB ? "●" : ""}</span>
        <span className="bd-slot-name">
          {itemB ? <ItemLabel item={itemB} format={format} /> : <span className="bd-slot-tbd">···</span>}
        </span>
        {winner === itemB && itemB != null && <span className="bd-slot-check">⚔</span>}
      </div>
      {isSelected && <div className="bd-match-glow" />}
    </div>
  );
}

function SplitBracketView({
  rounds, totalRounds, format, imageMap, mode,
  selectedMatch, onSelectMatch, onPickWinner, chosen,
  startFromRound,
}) {
  const bracketRef = useRef(null);
  const selectedRef = useRef(null);

  // Determine which rounds to show in the split bracket
  // startFromRound is the first round with <= SPLIT_BRACKET_THRESHOLD matches
  const visibleRounds = rounds.slice(startFromRound);
  const visibleTotalRounds = visibleRounds.length;

  // Compute highlighted keys (group of 3: feeders + destination of selected match)
  const highlightedKeys = useMemo(() => {
    const keys = new Set();
    if (!selectedMatch) return keys;
    const feeders = getFeederMatches(selectedMatch.round, selectedMatch.match);
    for (const f of feeders) {
      if (f.round >= startFromRound) keys.add(getMatchKey(f.round, f.match));
    }
    const dest = getDestinationMatch(selectedMatch.round, selectedMatch.match, rounds.length);
    if (dest) keys.add(getMatchKey(dest.round, dest.match));
    return keys;
  }, [selectedMatch, startFromRound, rounds.length]);

  // Auto-scroll to selected match
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [selectedMatch]);

  if (visibleRounds.length === 0) return null;

  // Split into left half and right half
  // Left side: matches with even indices in first visible round → left tree
  // Right side: matches with odd indices → right tree
  // We split the first visible round in half: first N/2 matches → left, last N/2 → right
  const firstRound = visibleRounds[0];
  const halfLen = Math.ceil(firstRound.length / 2);

  // Build left rounds and right rounds
  // Left side: matches 0..halfLen-1 in first round, then their winners flow forward
  // Right side: matches halfLen..end in first round, mirrored
  const leftRounds = [];
  const rightRounds = [];

  for (let vr = 0; vr < visibleRounds.length; vr++) {
    const realRound = startFromRound + vr;
    const round = visibleRounds[vr];
    const roundHalf = Math.ceil(round.length / 2);

    if (round.length === 1) {
      // This is the final — don't put in left or right, render in center
      continue;
    }

    leftRounds.push({
      realRound,
      matches: round.slice(0, roundHalf),
      startIdx: 0,
    });
    rightRounds.push({
      realRound,
      matches: round.slice(roundHalf),
      startIdx: roundHalf,
    });
  }

  // Final match
  const finalRound = visibleRounds[visibleRounds.length - 1];
  const finalMatch = finalRound.length === 1 ? finalRound[0] : null;
  const finalRoundIdx = startFromRound + visibleRounds.length - 1;

  // Champion
  const champion = finalMatch?.winner;

  return (
    <div className="bd-split-bracket" ref={bracketRef}>
      {/* Left side */}
      <div className="bd-split-left">
        {leftRounds.map((lr, i) => (
          <div key={i} className="bd-split-round">
            <div className="bd-split-round-label">
              {getRoundName(lr.realRound, totalRounds)}
            </div>
            <div className="bd-split-matches">
              {lr.matches.map((match, mIdx) => {
                const realMatchIdx = lr.startIdx + mIdx;
                const isSelRef = selectedMatch && selectedMatch.round === lr.realRound && selectedMatch.match === realMatchIdx;
                return (
                  <div key={mIdx} ref={isSelRef ? selectedRef : null}>
                    <SplitBracketSlot
                      match={match}
                      mIdx={realMatchIdx}
                      rIdx={lr.realRound}
                      totalRounds={totalRounds}
                      format={format}
                      imageMap={imageMap}
                      mode={mode}
                      selectedMatch={selectedMatch}
                      highlightedKeys={highlightedKeys}
                      onSelectMatch={onSelectMatch}
                      onPickWinner={onPickWinner}
                      chosen={isSelRef ? chosen : null}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Center: Final + Champion */}
      <div className="bd-split-center">
        <div className="bd-split-round-label bd-final-label">Finale</div>
        {finalMatch && (
          <div ref={selectedMatch && selectedMatch.round === finalRoundIdx && selectedMatch.match === 0 ? selectedRef : null}>
            <SplitBracketSlot
              match={finalMatch}
              mIdx={0}
              rIdx={finalRoundIdx}
              totalRounds={totalRounds}
              format={format}
              imageMap={imageMap}
              mode={mode}
              selectedMatch={selectedMatch}
              highlightedKeys={highlightedKeys}
              onSelectMatch={onSelectMatch}
              onPickWinner={onPickWinner}
              chosen={selectedMatch && selectedMatch.round === finalRoundIdx && selectedMatch.match === 0 ? chosen : null}
            />
          </div>
        )}
        <div className={`bd-champion-slot${champion ? " bd-crowned" : ""}`}>
          {champion ? (
            <>
              <span className="bd-champion-crown">👑</span>
              <span className="bd-champion-name">
                <ItemLabel item={champion} format={format} />
              </span>
            </>
          ) : (
            <span className="bd-champion-tbd">?</span>
          )}
        </div>
      </div>

      {/* Right side (mirrored) */}
      <div className="bd-split-right">
        {rightRounds.map((rr, i) => (
          <div key={i} className="bd-split-round bd-split-round-mirror">
            <div className="bd-split-round-label">
              {getRoundName(rr.realRound, totalRounds)}
            </div>
            <div className="bd-split-matches">
              {rr.matches.map((match, mIdx) => {
                const realMatchIdx = rr.startIdx + mIdx;
                const isSelRef = selectedMatch && selectedMatch.round === rr.realRound && selectedMatch.match === realMatchIdx;
                return (
                  <div key={mIdx} ref={isSelRef ? selectedRef : null}>
                    <SplitBracketSlot
                      match={match}
                      mIdx={realMatchIdx}
                      rIdx={rr.realRound}
                      totalRounds={totalRounds}
                      format={format}
                      imageMap={imageMap}
                      mode={mode}
                      selectedMatch={selectedMatch}
                      highlightedKeys={highlightedKeys}
                      onSelectMatch={onSelectMatch}
                      onPickWinner={onPickWinner}
                      chosen={isSelRef ? chosen : null}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// MAIN BRACKET DISPLAY COMPONENT
// =====================================================================

export default function BracketDisplay({
  // Core data — SOLO mode uses `rounds`, COMMUNITY mode uses `allMatches`
  rounds,          // solo: Array<Array<Match>>, community: reconstructed from allMatches
  allMatches,      // community: raw DB matches (optional, for community mode)
  currentRound,    // community: which round is active for voting
  totalRounds,     // number of rounds
  format,
  imageMap,
  onDismissImage,

  // Mode
  mode = "solo",   // "solo" | "community"

  // Selection
  selectedMatch,   // { round, match } currently focused match
  onSelectMatch,   // (loc) => void

  // Solo mode callbacks
  onPickWinner,    // (side: "a"|"b") => void
  chosen,          // "a"|"b"|null (animation state)

  // Community mode callbacks
  userVotes,       // { matchId: "a"|"b" }
  onVote,          // (matchId, side) => void
  disabled,        // voting disabled?
  showYouTube,
  YouTubePlayer,
}) {
  const [viewingRound, setViewingRound] = useState(0);

  // Build rounds from allMatches for community mode if rounds not provided
  const effectiveRounds = useMemo(() => {
    if (rounds) return rounds;
    if (!allMatches || allMatches.length === 0) return [];

    // Reconstruct rounds array from flat matches
    const byRound = {};
    for (const m of allMatches) {
      if (!byRound[m.round]) byRound[m.round] = [];
      byRound[m.round].push(m);
    }
    const result = [];
    for (let r = 0; r < totalRounds; r++) {
      const roundMatches = (byRound[r] || []).sort((a, b) => a.match_index - b.match_index);
      result.push(roundMatches);
    }
    return result;
  }, [rounds, allMatches, totalRounds]);

  // Determine the split-bracket start round: the first round with <= SPLIT_BRACKET_THRESHOLD matches
  const splitStartRound = useMemo(() => {
    for (let r = 0; r < effectiveRounds.length; r++) {
      const nonByeCount = effectiveRounds[r].filter(m => !m.isBye && !m.is_bye).length;
      const totalCount = effectiveRounds[r].length;
      if (totalCount <= SPLIT_BRACKET_THRESHOLD) return r;
    }
    return effectiveRounds.length - 1;
  }, [effectiveRounds]);

  // Determine current display mode based on the viewing/active round
  const activeRound = mode === "community" ? (currentRound ?? 0) : viewingRound;

  // Auto-select viewing round based on where we are
  useEffect(() => {
    if (mode === "solo" && selectedMatch) {
      setViewingRound(selectedMatch.round);
    } else if (mode === "community") {
      setViewingRound(currentRound ?? 0);
    }
  }, [mode, selectedMatch, currentRound]);

  const displayMode = activeRound < splitStartRound ? "round-view" : "split-bracket";

  // Get the selected match data for the duel card
  const selectedMatchData = useMemo(() => {
    if (!selectedMatch || !effectiveRounds[selectedMatch.round]) return null;
    return effectiveRounds[selectedMatch.round][selectedMatch.match] || null;
  }, [selectedMatch, effectiveRounds]);

  // Next opponent preview
  const nextOpponent = useMemo(() => {
    if (!selectedMatch || !effectiveRounds.length) return null;
    if (mode === "community") {
      // For community, use item_a/item_b field names
      const dest = getDestinationMatch(selectedMatch.round, selectedMatch.match, effectiveRounds.length);
      if (!dest || !effectiveRounds[dest.round]) return null;
      const destMatch = effectiveRounds[dest.round][dest.match];
      if (!destMatch) return null;
      const otherSlot = selectedMatch.match % 2 === 0 ? "b" : "a";
      return destMatch[`item_${otherSlot}`] || destMatch[otherSlot] || null;
    }
    return getNextOpponentPreview(effectiveRounds, selectedMatch.round, selectedMatch.match);
  }, [selectedMatch, effectiveRounds, mode]);

  // Community mode: match user vote for the selected match
  const selectedUserVote = mode === "community" && selectedMatchData
    ? userVotes?.[selectedMatchData.id]
    : null;

  // Don't render anything if no data
  if (effectiveRounds.length === 0) return null;

  return (
    <div className={`bd-display bd-mode-${mode} bd-view-${displayMode}`}>
      {/* Duel card at the top (always visible when a match is selected) */}
      {selectedMatchData && (
        <DuelCard
          match={selectedMatchData}
          roundIdx={selectedMatch.round}
          totalRounds={totalRounds}
          format={format}
          imageMap={imageMap}
          onDismissImage={onDismissImage}
          mode={mode}
          onPickWinner={onPickWinner}
          chosen={chosen}
          userVote={selectedUserVote}
          onVote={onVote}
          disabled={disabled}
          nextOpponent={nextOpponent}
          showYouTube={showYouTube}
          YouTubePlayer={YouTubePlayer}
        />
      )}

      {/* Main bracket area */}
      {displayMode === "round-view" ? (
        <RoundView
          rounds={effectiveRounds}
          totalRounds={totalRounds}
          format={format}
          imageMap={imageMap}
          onDismissImage={onDismissImage}
          mode={mode}
          selectedMatch={selectedMatch}
          onSelectMatch={onSelectMatch}
          onPickWinner={onPickWinner}
          chosen={chosen}
          userVotes={userVotes}
          onVote={onVote}
          disabled={disabled}
          viewingRound={viewingRound}
          onChangeRound={setViewingRound}
          showYouTube={showYouTube}
          YouTubePlayer={YouTubePlayer}
        />
      ) : (
        <SplitBracketView
          rounds={effectiveRounds}
          totalRounds={totalRounds}
          format={format}
          imageMap={imageMap}
          mode={mode}
          selectedMatch={selectedMatch}
          onSelectMatch={onSelectMatch}
          onPickWinner={onPickWinner}
          chosen={chosen}
          startFromRound={splitStartRound}
        />
      )}
    </div>
  );
}
