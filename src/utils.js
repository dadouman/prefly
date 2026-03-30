// =====================================================================
// SHARED UTILITIES — Deduplicates helpers used across components
// =====================================================================

/**
 * Extract display name from an item (may be a string or an object).
 */
export function getName(item) {
  return typeof item === "string" ? item : item.item || String(item);
}

/**
 * Relative date format in French (e.g. "il y a 3h", "il y a 2j").
 * Falls back to "DD mois YYYY" for dates older than a week.
 */
export function formatRelativeDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  if (hours < 24) return `il y a ${hours}h`;
  if (days < 7) return `il y a ${days}j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Short absolute date format in French (e.g. "12 oct. 2025").
 */
export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Full date+time format in French (e.g. "12 oct. 2025, 14:30").
 */
export function formatDateTime(iso) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Return the top N items from a ranking result array.
 */
export function getTopItems(result, n = 3) {
  if (!result || !Array.isArray(result)) return [];
  return result.slice(0, n);
}
