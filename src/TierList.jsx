import { useMemo } from "react";

const TIERS = [
  { label: "S", color: "#ff7675", bg: "rgba(255, 118, 117, 0.10)" },
  { label: "A", color: "#fdcb6e", bg: "rgba(253, 203, 110, 0.10)" },
  { label: "B", color: "#55efc4", bg: "rgba(85, 239, 196, 0.10)" },
  { label: "C", color: "#74b9ff", bg: "rgba(116, 185, 255, 0.10)" },
  { label: "D", color: "#a29bfe", bg: "rgba(162, 155, 254, 0.10)" },
  { label: "F", color: "#dfe6e9", bg: "rgba(223, 230, 233, 0.10)" },
];

function assignTiers(items) {
  const n = items.length;
  if (n === 0) return [];

  // Distribution: S=top ~10%, A=~20%, B=~25%, C=~25%, D=~15%, F=~5%
  const percentages = [0.10, 0.20, 0.25, 0.25, 0.15, 0.05];
  const result = [];
  let idx = 0;

  for (let t = 0; t < TIERS.length; t++) {
    const count = Math.max(t === 0 ? 1 : 0, Math.round(n * percentages[t]));
    const tierItems = items.slice(idx, idx + count);
    if (tierItems.length > 0) {
      result.push({ ...TIERS[t], items: tierItems });
    }
    idx += count;
  }

  // Remaining items go to last tier
  if (idx < n) {
    const last = result[result.length - 1];
    last.items = [...last.items, ...items.slice(idx)];
  }

  return result;
}

export default function TierList({ ranking }) {
  const tiers = useMemo(() => {
    const items = (ranking.result || []).map((item) =>
      typeof item === "string" ? item : item.item || String(item)
    );
    return assignTiers(items);
  }, [ranking]);

  if (tiers.length === 0) return null;

  return (
    <div className="tier-list">
      {tiers.map((tier) => (
        <div key={tier.label} className="tier-row" style={{ background: tier.bg }}>
          <div className="tier-label" style={{ background: tier.color, color: "#1a1a1a" }}>
            {tier.label}
          </div>
          <div className="tier-items">
            {tier.items.map((item, i) => (
              <div key={i} className="tier-item" style={{ borderColor: tier.color }}>
                {item}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
