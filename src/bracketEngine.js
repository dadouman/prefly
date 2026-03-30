// =====================================================================
// BRACKET ENGINE — Shared Single Elimination Tournament Logic
// Used by both BracketArena (solo) and CommunityBracket (community)
// =====================================================================

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build standard tournament seeding order for n slots (power of 2)
// Uses mirror-based placement so BYEs (last seeds) are spread across the bracket
// and never paired together.
export function buildSeedOrder(n) {
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

// Place BYEs optimally: spread them so they don't cluster together.
export function seedBracket(items) {
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

export function buildBracket(items) {
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

  propagate(rounds);
  return rounds;
}

// Propagate winners upward through the bracket, auto-resolving BYEs
export function propagate(rounds) {
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

    for (let r = 1; r < rounds.length; r++) {
      for (let m = 0; m < rounds[r].length; m++) {
        const match = rounds[r][m];
        if (match.winner !== null) continue;

        const srcA = rounds[r - 1][m * 2];
        const srcB = rounds[r - 1][m * 2 + 1];
        if (!srcA || !srcB) continue;

        const aDone = srcA.winner !== null || srcA.isBye;
        const bDone = srcB.winner !== null || srcB.isBye;
        if (!aDone || !bDone) continue;

        const aWinner = srcA.winner;
        const bWinner = srcB.winner;

        if (aWinner !== null && match.a !== aWinner) { match.a = aWinner; changed = true; }
        if (bWinner !== null && match.b !== bWinner) { match.b = bWinner; changed = true; }

        if (aWinner !== null && bWinner === null) {
          match.winner = aWinner;
          match.isBye = true;
          changed = true;
        } else if (aWinner === null && bWinner !== null) {
          match.winner = bWinner;
          match.isBye = true;
          changed = true;
        } else if (aWinner === null && bWinner === null) {
          if (!match.isBye) {
            match.isBye = true;
            changed = true;
          }
        }
      }
    }
  }
}

export function findCurrentMatch(rounds) {
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

// Find all resolvable matches (both sides filled, no winner yet, not a bye)
export function findAllResolvableMatches(rounds) {
  const result = [];
  for (let r = 0; r < rounds.length; r++) {
    for (let m = 0; m < rounds[r].length; m++) {
      const match = rounds[r][m];
      if (match.a !== null && match.b !== null && match.winner === null && !match.isBye) {
        result.push({ round: r, match: m });
      }
    }
  }
  return result;
}

export function getRoundName(roundIdx, totalRounds) {
  const remaining = totalRounds - roundIdx;
  if (remaining === 1) return "Finale";
  if (remaining === 2) return "Demi-finales";
  if (remaining === 3) return "Quarts de finale";
  if (remaining === 4) return "Huitièmes de finale";
  if (remaining === 5) return "Seizièmes de finale";
  return `Tour ${roundIdx + 1}`;
}

export function getTotalRounds(itemCount) {
  let n = 1;
  while (n < itemCount) n *= 2;
  return Math.log2(n);
}

export function countTotalMatches(rounds) {
  let total = 0;
  for (const round of rounds) {
    for (const match of round) {
      if (!match.isBye) total++;
    }
  }
  return total;
}

export function countResolvedMatches(rounds) {
  let resolved = 0;
  for (const round of rounds) {
    for (const match of round) {
      if (match.winner !== null && !match.isBye) resolved++;
    }
  }
  return resolved;
}

export function generateRound0(items) {
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

// Get the destination match for a given match (where the winner goes)
export function getDestinationMatch(roundIdx, matchIdx, totalRounds) {
  if (roundIdx >= totalRounds - 1) return null;
  return { round: roundIdx + 1, match: Math.floor(matchIdx / 2) };
}

// Get the two feeder matches that feed into a given match
export function getFeederMatches(roundIdx, matchIdx) {
  if (roundIdx === 0) return [];
  return [
    { round: roundIdx - 1, match: matchIdx * 2 },
    { round: roundIdx - 1, match: matchIdx * 2 + 1 },
  ];
}

// Find what the next opponent would be after winning a match
export function getNextOpponentPreview(rounds, roundIdx, matchIdx) {
  const dest = getDestinationMatch(roundIdx, matchIdx, rounds.length);
  if (!dest) return null;
  const destMatch = rounds[dest.round]?.[dest.match];
  if (!destMatch) return null;
  // The other slot in the destination match
  const otherSlot = matchIdx % 2 === 0 ? "b" : "a";
  return destMatch[otherSlot] || null;
}
