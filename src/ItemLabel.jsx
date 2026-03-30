// =====================================================================
// ITEM LABEL — Shared format-aware item display
// =====================================================================

export function parseDiscographyItem(item) {
  const first = item.indexOf(" - ");
  if (first === -1) return { song: item, meta: null };
  const song = item.substring(0, first);
  const rest = item.substring(first + 3);
  const ld = rest.lastIndexOf(" - ");
  const album = ld !== -1 ? rest.substring(0, ld) : rest;
  const year = ld !== -1 ? rest.substring(ld + 3) : "";
  return { song, meta: year ? `${album} · ${year}` : album };
}

export default function ItemLabel({ item, format }) {
  if (!item) return <span className="bracket-bye">BYE</span>;
  if (format === "discography") {
    const { song, meta } = parseDiscographyItem(item);
    if (meta) {
      return (
        <>
          <span className="disco-song">{song}</span>
          <span className="disco-meta">{meta}</span>
        </>
      );
    }
  }
  return <>{item}</>;
}
