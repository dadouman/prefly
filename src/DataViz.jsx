import { useState, useEffect, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { getRankingsForList } from "./rankingService";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";

const COLORS = [
  "#c9a227", "#e67e22", "#e74c3c", "#9b59b6", "#3498db",
  "#1abc9c", "#2ecc71", "#f39c12", "#d35400", "#8e44ad",
  "#2980b9", "#27ae60", "#f1c40f", "#c0392b", "#16a085",
];

function getName(item) {
  return typeof item === "string" ? item : item.item || String(item);
}

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

// ─── MAIN DATAVIZ COMPONENT ───
export default function DataViz({ ranking }) {
  const { user } = useAuth();
  const [allRankings, setAllRankings] = useState([]);
  const [activeTab, setActiveTab] = useState("stats");

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

  const tabs = [
    { key: "stats", label: "📊 Stats" },
    { key: "distribution", label: "📈 Distribution" },
    { key: "evolution", label: "📉 Évolution" },
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
      </div>
    </div>
  );
}
