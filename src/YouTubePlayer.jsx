import { useState, useEffect } from "react";

// =====================================================================
// YOUTUBE SEARCH HELPERS
// =====================================================================
async function searchYouTubeVideoId(query) {
  try {
    const res = await fetch(`/api/yt-search?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.videoIds && data.videoIds.length > 0) return data.videoIds[0];
    }
  } catch { /* fallback below */ }

  const fallbacks = [
    { url: (q) => `https://pipedapi.kavin.rocks/search?q=${encodeURIComponent(q)}&filter=videos`, parse: (d) => { const i = Array.isArray(d.items) && d.items.find(x => x.type === "stream"); return i?.url?.match(/v=([^&]+)/)?.[1] || null; } },
    { url: (q) => `https://inv.nadeko.net/api/v1/search?q=${encodeURIComponent(q)}&type=video`, parse: (d) => Array.isArray(d) && d.length > 0 ? d[0].videoId : null },
    { url: (q) => `https://invidious.fdn.fr/api/v1/search?q=${encodeURIComponent(q)}&type=video`, parse: (d) => Array.isArray(d) && d.length > 0 ? d[0].videoId : null },
  ];
  for (const api of fallbacks) {
    try {
      const res = await fetch(api.url(query), { signal: AbortSignal.timeout(5000) });
      if (!res.ok) continue;
      const data = await res.json();
      const id = api.parse(data);
      if (id) return id;
    } catch { /* try next */ }
  }
  return null;
}

const videoIdCache = {};
async function getVideoId(query) {
  if (videoIdCache[query]) return videoIdCache[query];
  const id = await searchYouTubeVideoId(query);
  if (id) videoIdCache[query] = id;
  return id;
}

function youtubeSearchUrl(title) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`;
}

// =====================================================================
// YOUTUBE PLAYER COMPONENT
// =====================================================================
export default function YouTubePlayer({ item }) {
  const [videoId, setVideoId] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setOpen(false);
    setVideoId(null);
    setError(false);
  }, [item]);

  const handleToggle = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (open) {
      setOpen(false);
      return;
    }
    if (videoId) {
      setOpen(true);
      return;
    }
    setLoading(true);
    setError(false);
    const id = await getVideoId(item);
    if (id) {
      setVideoId(id);
      setOpen(true);
    } else {
      setError(true);
    }
    setLoading(false);
  };

  return (
    <div className="yt-player-wrap" onClick={(e) => e.stopPropagation()}>
      <button
        className={`yt-play-btn${open ? " active" : ""}${error ? " error" : ""}`}
        onClick={handleToggle}
        title={error ? "Indisponible — ouvrir YouTube" : open ? "Fermer le lecteur" : "Écouter"}
      >
        {loading ? (
          <span className="yt-spinner" />
        ) : open ? (
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M21.8 8.001a2.749 2.749 0 0 0-1.935-1.946C18.265 5.5 12 5.5 12 5.5s-6.265 0-7.865.555A2.749 2.749 0 0 0 2.2 8.001 28.825 28.825 0 0 0 1.75 12a28.825 28.825 0 0 0 .45 3.999 2.749 2.749 0 0 0 1.935 1.946c1.6.555 7.865.555 7.865.555s6.265 0 7.865-.555a2.749 2.749 0 0 0 1.935-1.946A28.825 28.825 0 0 0 22.25 12a28.825 28.825 0 0 0-.45-3.999ZM9.75 15.02V8.98L15.5 12l-5.75 3.02Z" />
          </svg>
        )}
      </button>
      {error && (
        <a
          href={youtubeSearchUrl(item)}
          target="_blank"
          rel="noopener noreferrer"
          className="yt-fallback-link"
          onClick={(e) => e.stopPropagation()}
        >
          Ouvrir YouTube ↗
        </a>
      )}
      {open && videoId && (
        <div className="yt-player-embed">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="YouTube player"
          />
        </div>
      )}
    </div>
  );
}
