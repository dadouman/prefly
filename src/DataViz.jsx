import { useState, useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { getRankingsForList } from "./rankingService";
import { supabase } from "./supabaseClient";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, ScatterChart, Scatter,
  ZAxis, Legend,
} from "recharts";

const COLORS = [
  "#c9a227", "#e67e22", "#e74c3c", "#9b59b6", "#3498db",
  "#1abc9c", "#2ecc71", "#f39c12", "#d35400", "#8e44ad",
  "#2980b9", "#27ae60", "#f1c40f", "#c0392b", "#16a085",
];

import { getName } from "./utils";

// ─── EVOLUTION CHART ───
function EvolutionChart({ rankings, currentRanking }) {
  // Need at least 2 rankings of the same list to show evolution
  const allRankings = useMemo(() => {
    const relevant = rankings.filter((r) => r.list_name === currentRanking.list_name);
    // Include current if not already in list
    if (!relevant.find((r) => r.id === currentRanking.id)) {
      relevant.push(currentRanking);
    }
    return relevant.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [rankings, currentRanking]);

  const { chartData, items } = useMemo(() => {
    if (allRankings.length < 2) return { chartData: [], items: [] };

    // Collect all items
    const itemSet = new Set();
    allRankings.forEach((r) =>
      (r.result || []).forEach((item) => itemSet.add(getName(item)))
    );

    const items = [...itemSet];
    const chartData = allRankings.map((r) => {
      const entry = {
        date: new Date(r.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
      };
      const resultNames = (r.result || []).map(getName);
      items.forEach((item) => {
        const idx = resultNames.indexOf(item);
        entry[item] = idx >= 0 ? idx + 1 : null;
      });
      return entry;
    });

    return { chartData, items };
  }, [allRankings]);

  if (chartData.length < 2) {
    return (
      <div className="dataviz-empty">
        <p>Il faut au moins 2 classements de la même liste pour voir l'évolution.</p>
      </div>
    );
  }

  // Show only top 10 items for readability
  const topItems = items.slice(0, 10);

  return (
    <div className="dataviz-chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8b8578" }} />
          <YAxis reversed domain={[1, "auto"]} tick={{ fontSize: 11, fill: "#8b8578" }} label={{ value: "Rang", angle: -90, position: "insideLeft", fontSize: 11, fill: "#8b8578" }} />
          <Tooltip
            contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#c9a227" }}
            itemStyle={{ color: "#e8e4d9" }}
          />
          {topItems.map((item, i) => (
            <Line
              key={item}
              type="monotone"
              dataKey={item}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="dataviz-legend">
        {topItems.map((item, i) => (
          <span key={item} className="dataviz-legend-item">
            <span className="dataviz-legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
            {item.length > 25 ? item.slice(0, 25) + "…" : item}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── DISTRIBUTION BAR CHART ───
function DistributionChart({ ranking }) {
  const data = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    const n = result.length;
    if (n === 0) return [];

    // Split into quartiles
    const tiers = [
      { name: "Top 25%", count: 0, color: "#c9a227" },
      { name: "25-50%", count: 0, color: "#e67e22" },
      { name: "50-75%", count: 0, color: "#3498db" },
      { name: "Bottom 25%", count: 0, color: "#95a5a6" },
    ];

    result.forEach((_, i) => {
      const pct = i / n;
      if (pct < 0.25) tiers[0].count++;
      else if (pct < 0.5) tiers[1].count++;
      else if (pct < 0.75) tiers[2].count++;
      else tiers[3].count++;
    });

    return tiers;
  }, [ranking]);

  if (data.length === 0) return null;

  return (
    <div className="dataviz-chart-wrap">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#8b8578" }} />
          <YAxis tick={{ fontSize: 11, fill: "#8b8578" }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#c9a227" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── STATS SUMMARY ───
function StatsSummary({ ranking, allRankings }) {
  const stats = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    const sameList = allRankings.filter((r) => r.list_name === ranking.list_name);

    return {
      totalItems: result.length,
      comparisons: ranking.comparisons_count || 0,
      duration: ranking.duration_seconds || 0,
      timesRanked: sameList.length,
      champion: result[0] || "—",
      lastPlace: result[result.length - 1] || "—",
    };
  }, [ranking, allRankings]);

  const formatDuration = (s) => {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  return (
    <div className="dataviz-stats">
      <div className="dataviz-stat-card">
        <span className="dataviz-stat-value">{stats.totalItems}</span>
        <span className="dataviz-stat-label">Éléments</span>
      </div>
      <div className="dataviz-stat-card">
        <span className="dataviz-stat-value">{stats.comparisons}</span>
        <span className="dataviz-stat-label">Duels</span>
      </div>
      <div className="dataviz-stat-card">
        <span className="dataviz-stat-value">{formatDuration(stats.duration)}</span>
        <span className="dataviz-stat-label">Durée</span>
      </div>
      <div className="dataviz-stat-card">
        <span className="dataviz-stat-value">{stats.timesRanked}×</span>
        <span className="dataviz-stat-label">Classé</span>
      </div>
      <div className="dataviz-stat-card highlight">
        <span className="dataviz-stat-value">🥇</span>
        <span className="dataviz-stat-label">{stats.champion.length > 20 ? stats.champion.slice(0, 20) + "…" : stats.champion}</span>
      </div>
      <div className="dataviz-stat-card">
        <span className="dataviz-stat-value">#{stats.totalItems}</span>
        <span className="dataviz-stat-label">{stats.lastPlace.length > 20 ? stats.lastPlace.slice(0, 20) + "…" : stats.lastPlace}</span>
      </div>
    </div>
  );
}

// ─── ATTRIBUTE: GENRE / CATEGORY BREAKDOWN (PIE CHART) ───
function GenreBreakdown({ attributes, ranking }) {
  const data = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    const genreCounts = {};

    result.forEach((item) => {
      const attrs = attributes[item] || {};
      // Look for genre, type, or sport attribute
      const genreVal = attrs.genre || attrs.type || attrs.sport || null;
      if (!genreVal) {
        genreCounts["Non classé"] = (genreCounts["Non classé"] || 0) + 1;
        return;
      }
      // Split multi-value genres (e.g. "action, science-fiction")
      const genres = genreVal.split(",").map((g) => g.trim()).filter(Boolean);
      genres.forEach((g) => {
        // Truncate long genre names
        const label = g.length > 30 ? g.slice(0, 30) + "…" : g;
        genreCounts[label] = (genreCounts[label] || 0) + 1;
      });
    });

    return Object.entries(genreCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [attributes, ranking]);

  if (data.length === 0) return <div className="dataviz-empty">Aucun attribut genre/type trouvé.</div>;

  return (
    <div className="dataviz-chart-wrap">
      <h4 className="dataviz-chart-title">Répartition par genre / type</h4>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            outerRadius={100}
            innerRadius={40}
            dataKey="value"
            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            labelLine={{ stroke: "#8b8578" }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#c9a227" }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── ATTRIBUTE: RANKING BY ATTRIBUTE VALUE (BAR CHART) ───
function AttributeBarChart({ attributes, ranking, attrKey }) {
  const data = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    return result
      .map((item, i) => {
        const attrs = attributes[item] || {};
        const val = attrs[attrKey];
        if (!val) return null;
        // Try to parse numeric
        const num = parseFloat(val);
        return {
          name: item.length > 20 ? item.slice(0, 20) + "…" : item,
          value: isNaN(num) ? val : num,
          rank: i + 1,
          isNumeric: !isNaN(num),
        };
      })
      .filter(Boolean);
  }, [attributes, ranking, attrKey]);

  if (data.length === 0) return null;

  // If all values are numeric, show a bar chart
  const allNumeric = data.every((d) => d.isNumeric);

  if (!allNumeric) {
    // Group by value for categorical data
    const counts = {};
    data.forEach((d) => {
      const vals = String(d.value).split(",").map((v) => v.trim());
      vals.forEach((v) => {
        const label = v.length > 25 ? v.slice(0, 25) + "…" : v;
        counts[label] = (counts[label] || 0) + 1;
      });
    });
    const catData = Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    return (
      <div className="dataviz-chart-wrap">
        <h4 className="dataviz-chart-title">Distribution : {attrKey}</h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={catData} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 11, fill: "#8b8578" }} allowDecimals={false} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "#8b8578" }} width={120} />
            <Tooltip
              contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#c9a227" }}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {catData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Numeric: scatter plot rank vs value
  return (
    <div className="dataviz-chart-wrap">
      <h4 className="dataviz-chart-title">Rang vs {attrKey}</h4>
      <ResponsiveContainer width="100%" height={250}>
        <ScatterChart>
          <XAxis dataKey="rank" name="Rang" tick={{ fontSize: 11, fill: "#8b8578" }} label={{ value: "Rang", position: "bottom", fontSize: 11, fill: "#8b8578" }} />
          <YAxis dataKey="value" name={attrKey} tick={{ fontSize: 11, fill: "#8b8578" }} />
          <ZAxis range={[50, 50]} />
          <Tooltip
            contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#c9a227" }}
            formatter={(val, name) => [val, name === "rank" ? "Rang" : attrKey]}
          />
          <Scatter data={data} fill="#c9a227">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="dataviz-legend">
        {data.map((d, i) => (
          <span key={i} className="dataviz-legend-item">
            <span className="dataviz-legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ATTRIBUTE: RADAR PROFILE OF TOP ITEMS ───
function AttributeRadar({ attributes, ranking }) {
  const { radarData, topItems } = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    if (result.length === 0) return { radarData: [], topItems: [] };

    // Collect all attribute keys that are categorical (non-description, non-url)
    const skipKeys = new Set(["description", "source Wikipedia"]);
    const allKeys = new Set();
    result.forEach((item) => {
      const attrs = attributes[item] || {};
      Object.keys(attrs).forEach((k) => {
        if (!skipKeys.has(k)) allKeys.add(k);
      });
    });

    const keys = [...allKeys].slice(0, 8); // max 8 axes
    if (keys.length < 3) return { radarData: [], topItems: [] };

    const topItems = result.slice(0, 5);
    const radarData = keys.map((key) => {
      const entry = { attribute: key.length > 12 ? key.slice(0, 12) + "…" : key };
      topItems.forEach((item) => {
        const attrs = attributes[item] || {};
        const val = attrs[key];
        // Score: has value = 1, no value = 0
        entry[item] = val ? 1 : 0;
      });
      return entry;
    });

    return { radarData, topItems };
  }, [attributes, ranking]);

  if (radarData.length < 3) {
    return <div className="dataviz-empty">Il faut au moins 3 attributs pour le radar.</div>;
  }

  return (
    <div className="dataviz-chart-wrap">
      <h4 className="dataviz-chart-title">Profil attributs — Top 5</h4>
      <ResponsiveContainer width="100%" height={350}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#4a4035" />
          <PolarAngleAxis dataKey="attribute" tick={{ fontSize: 10, fill: "#8b8578" }} />
          <PolarRadiusAxis tick={false} domain={[0, 1]} />
          {topItems.map((item, i) => (
            <Radar
              key={item}
              name={item.length > 20 ? item.slice(0, 20) + "…" : item}
              dataKey={item}
              stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: "'Raleway', sans-serif" }}
          />
          <Tooltip
            contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── ATTRIBUTE: TIMELINE (ITEMS BY DATE) ───
function AttributeTimeline({ attributes, ranking }) {
  const data = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    const items = [];

    result.forEach((item, i) => {
      const attrs = attributes[item] || {};
      const dateVal = attrs["date de sortie"] || attrs["date de naissance"] || null;
      if (!dateVal) return;
      // Extract first year
      const yearMatch = dateVal.match(/(\d{4})/);
      if (!yearMatch) return;
      items.push({
        name: item.length > 20 ? item.slice(0, 20) + "…" : item,
        year: parseInt(yearMatch[1]),
        rank: i + 1,
      });
    });

    return items.sort((a, b) => a.year - b.year);
  }, [attributes, ranking]);

  if (data.length < 2) {
    return <div className="dataviz-empty">Pas assez de dates trouvées dans les attributs.</div>;
  }

  return (
    <div className="dataviz-chart-wrap">
      <h4 className="dataviz-chart-title">Timeline — rang par année</h4>
      <ResponsiveContainer width="100%" height={280}>
        <ScatterChart>
          <XAxis dataKey="year" name="Année" tick={{ fontSize: 11, fill: "#8b8578" }} type="number" domain={["dataMin - 1", "dataMax + 1"]} />
          <YAxis dataKey="rank" name="Rang" reversed tick={{ fontSize: 11, fill: "#8b8578" }} label={{ value: "Rang", angle: -90, position: "insideLeft", fontSize: 11, fill: "#8b8578" }} />
          <ZAxis range={[80, 80]} />
          <Tooltip
            contentStyle={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#c9a227" }}
            formatter={(val, name) => [val, name === "year" ? "Année" : "Rang"]}
            labelFormatter={() => ""}
            content={({ payload }) => {
              if (!payload?.length) return null;
              const d = payload[0]?.payload;
              return (
                <div style={{ background: "#2a2520", border: "1px solid #4a4035", borderRadius: 8, padding: "0.5rem 0.7rem", fontSize: 12 }}>
                  <div style={{ color: "#c9a227", fontWeight: 600 }}>{d?.name}</div>
                  <div style={{ color: "#e8e4d9" }}>Année: {d?.year} · Rang: #{d?.rank}</div>
                </div>
              );
            }}
          />
          <Scatter data={data} fill="#c9a227">
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
      <div className="dataviz-legend">
        {data.map((d, i) => (
          <span key={i} className="dataviz-legend-item">
            <span className="dataviz-legend-dot" style={{ background: COLORS[i % COLORS.length] }} />
            {d.name} ({d.year})
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── ATTRIBUTE: COVERAGE SUMMARY ───
function AttributeCoverage({ attributes, ranking }) {
  const { coverageData, totalItems, filledCount } = useMemo(() => {
    const result = (ranking.result || []).map(getName);
    const totalItems = result.length;
    const skipKeys = new Set(["description", "source Wikipedia"]);

    // Collect all possible attribute keys
    const keyCounts = {};
    result.forEach((item) => {
      const attrs = attributes[item] || {};
      Object.keys(attrs).forEach((k) => {
        if (!skipKeys.has(k)) keyCounts[k] = (keyCounts[k] || 0) + 1;
      });
    });

    const filledCount = result.filter((item) => {
      const attrs = attributes[item] || {};
      return Object.keys(attrs).filter((k) => !skipKeys.has(k)).length > 0;
    }).length;

    const coverageData = Object.entries(keyCounts)
      .map(([name, count]) => ({
        name: name.length > 18 ? name.slice(0, 18) + "…" : name,
        count,
        pct: Math.round((count / totalItems) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    return { coverageData, totalItems, filledCount };
  }, [attributes, ranking]);

  return (
    <div className="dataviz-chart-wrap">
      <h4 className="dataviz-chart-title">Couverture des attributs</h4>
      <div className="dataviz-coverage-summary">
        <span className="dataviz-coverage-big">{filledCount}/{totalItems}</span>
        <span className="dataviz-coverage-label">éléments avec attributs</span>
      </div>
      {coverageData.length > 0 ? (
        <div className="dataviz-coverage-bars">
          {coverageData.map((d, i) => (
            <div key={i} className="dataviz-coverage-row">
              <span className="dataviz-coverage-name">{d.name}</span>
              <div className="dataviz-coverage-bar-bg">
                <div
                  className="dataviz-coverage-bar-fill"
                  style={{ width: `${d.pct}%`, background: COLORS[i % COLORS.length] }}
                />
              </div>
              <span className="dataviz-coverage-pct">{d.pct}%</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="dataviz-empty">Aucun attribut trouvé. Utilisez l'onglet Attributs pour en ajouter.</p>
      )}
    </div>
  );
}

// ─── MAIN DATAVIZ COMPONENT ───
export default function DataViz({ ranking }) {
  const { user } = useAuth();
  const [allRankings, setAllRankings] = useState([]);
  const [activeTab, setActiveTab] = useState("stats");
  const [attributes, setAttributes] = useState({});
  const [attrLoaded, setAttrLoaded] = useState(false);
  const [selectedAttrKey, setSelectedAttrKey] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await getRankingsForList(user?.id, ranking.list_name);
        setAllRankings(data);
      } catch {
        setAllRankings([]);
      }
    })();
  }, [user?.id, ranking.list_name]);

  // Load attributes for this ranking
  useEffect(() => {
    if (!supabase || !ranking.id) { setAttrLoaded(true); return; }
    (async () => {
      const { data } = await supabase
        .from("item_attributes")
        .select("item_name, attributes")
        .eq("ranking_id", ranking.id);
      if (data) {
        const map = {};
        data.forEach((row) => { map[row.item_name] = row.attributes || {}; });
        setAttributes(map);
      }
      setAttrLoaded(true);
    })();
  }, [ranking.id]);

  // Available attribute keys for the selector
  const attrKeys = useMemo(() => {
    const skipKeys = new Set(["description", "source Wikipedia"]);
    const keys = new Set();
    Object.values(attributes).forEach((attrs) => {
      Object.keys(attrs).forEach((k) => {
        if (!skipKeys.has(k)) keys.add(k);
      });
    });
    return [...keys];
  }, [attributes]);

  // Auto-select first key
  useEffect(() => {
    if (attrKeys.length > 0 && !selectedAttrKey) {
      setSelectedAttrKey(attrKeys[0]);
    }
  }, [attrKeys, selectedAttrKey]);

  const hasAttrs = Object.keys(attributes).length > 0;

  const tabs = [
    { key: "stats", label: "📊 Stats" },
    { key: "distribution", label: "📈 Distribution" },
    { key: "evolution", label: "📉 Évolution" },
    ...(hasAttrs ? [
      { key: "genres", label: "🎭 Genres" },
      { key: "timeline", label: "📅 Timeline" },
      { key: "radar", label: "🕸️ Radar" },
      { key: "attrbar", label: "📋 Par attribut" },
      { key: "coverage", label: "✅ Couverture" },
    ] : []),
  ];

  return (
    <div className="dataviz-container">
      <div className="dataviz-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`dataviz-tab${activeTab === t.key ? " active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="dataviz-content">
        {activeTab === "stats" && (
          <StatsSummary ranking={ranking} allRankings={allRankings} />
        )}
        {activeTab === "distribution" && (
          <DistributionChart ranking={ranking} />
        )}
        {activeTab === "evolution" && (
          <EvolutionChart rankings={allRankings} currentRanking={ranking} />
        )}
        {activeTab === "genres" && (
          <GenreBreakdown attributes={attributes} ranking={ranking} />
        )}
        {activeTab === "timeline" && (
          <AttributeTimeline attributes={attributes} ranking={ranking} />
        )}
        {activeTab === "radar" && (
          <AttributeRadar attributes={attributes} ranking={ranking} />
        )}
        {activeTab === "attrbar" && (
          <div>
            {attrKeys.length > 0 && (
              <div className="dataviz-attr-selector">
                <label className="dataviz-attr-selector-label">Attribut :</label>
                <select
                  className="dataviz-attr-selector-select"
                  value={selectedAttrKey || ""}
                  onChange={(e) => setSelectedAttrKey(e.target.value)}
                >
                  {attrKeys.map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              </div>
            )}
            {selectedAttrKey && (
              <AttributeBarChart attributes={attributes} ranking={ranking} attrKey={selectedAttrKey} />
            )}
          </div>
        )}
        {activeTab === "coverage" && (
          <AttributeCoverage attributes={attributes} ranking={ranking} />
        )}
        {!attrLoaded && activeTab !== "stats" && activeTab !== "distribution" && activeTab !== "evolution" && (
          <div className="dataviz-empty">Chargement des attributs…</div>
        )}
      </div>
    </div>
  );
}
