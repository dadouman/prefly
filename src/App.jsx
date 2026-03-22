import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";

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

function exportCSV(items) {
  const csv = [`Rang,Élément`, ...items.map((item, i) => `${i + 1},"${item.replace(/"/g, '""')}"`)].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'classement.csv'; a.click();
  URL.revokeObjectURL(url);
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
function LivePanel({ snapshot }) {
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
              {entry.item}
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
  const fileRef = useRef(null);

  const parsedItems = parseInput(inputText);
  const comparison = sortState && !sortState.done ? getComparison(sortState) : null;
  const progress = total > 0 ? Math.min(100, (count / total) * 100) : 0;
  const roundSize = sortState && !sortState.done
    ? (sortState.currentMerge.left.length + sortState.currentMerge.right.length) : 0;
  const snapshot = getLiveSnapshot(sortState);

  const handleStart = () => {
    if (parsedItems.length < 2) return;
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
      const next = advance(sortState, pickLeft);
      setCount(c => c + 1);
      if (next.done) { setSorted(next.sorted); setPhase("result"); }
      else setSortState(next);
    }, 300);
  }, [chosen, sortState]);

  useEffect(() => {
    if (phase !== "sorting") return;
    const fn = (e) => {
      if (e.key === "ArrowLeft")  handleChoice(true);
      if (e.key === "ArrowRight") handleChoice(false);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [phase, handleChoice]);

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => setInputText(e.target.result);
    reader.readAsText(file);
  };

  const reset = () => { setPhase("input"); setInputText(""); setSortState(null); setSorted([]); };

  return (
    <>
      <div className="root">

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

              <button className="btn-gold" onClick={handleStart} disabled={parsedItems.length < 2}>
                Entrer dans l'Arène &nbsp;→
              </button>
            </div>
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
                <button
                  className={`choice-card${chosen === "a" ? " flash" : chosen === "b" ? " loser" : ""}`}
                  onClick={() => handleChoice(true)}
                >
                  <div className="choice-text">{comparison.a}</div>
                  <div className="choice-hint">← Gauche</div>
                </button>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span className="vs">VS</span>
                </div>
                <button
                  className={`choice-card${chosen === "b" ? " flash" : chosen === "a" ? " loser" : ""}`}
                  onClick={() => handleChoice(false)}
                >
                  <div className="choice-text">{comparison.b}</div>
                  <div className="choice-hint">Droite →</div>
                </button>
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
                <LivePanel snapshot={snapshot} />
              </div>
            )}

            {/* Inline panel — mobile (only shown if side panel is hidden) */}
            {showLive && (
              <style>{`.side-col { display: flex !important; } @media (max-width: 940px) { .side-col { padding-top: 0 !important; } }`}</style>
            )}
          </div>
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
                  <span style={{ fontSize: "0.95rem", fontWeight: i < 3 ? 600 : 400, color: i < 3 ? "var(--text)" : "var(--text-dim)", flex: 1 }}>
                    {item}
                  </span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "0.9rem", justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn-gold" onClick={() => exportCSV(sorted)}>↓ &nbsp;Exporter CSV</button>
              <button className="btn-ghost" onClick={reset}>Nouveau Tournoi</button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}