// Serverless proxy for TMDb image search.
// Requires TMDB_API_KEY environment variable (free at https://www.themoviedb.org/settings/api).

const TMDB_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/w200";

const FETCH_HEADERS = {
  "User-Agent": "Prefly/1.0 (https://prefly.vercel.app)",
  "Accept": "application/json",
};

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Missing q parameter" });
  if (!TMDB_KEY) return res.status(500).json({ error: "TMDB_API_KEY not configured — add it in Vercel Environment Variables" });

  try {
    const url = `${TMDB_BASE}/search/multi?${new URLSearchParams({
      api_key: TMDB_KEY,
      query: q,
      language: "fr-FR",
      include_adult: "false",
    })}`;

    const response = await fetch(url, { headers: FETCH_HEADERS });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return res.status(502).json({ error: `TMDb API error: ${response.status}`, detail: text.slice(0, 200) });
    }

    const data = await response.json();
    const images = [];

    for (const item of data.results || []) {
      // Movies / TV → poster_path; People → profile_path
      const path = item.poster_path || item.profile_path || item.backdrop_path;
      if (path) {
        images.push(`${IMG_BASE}${path}`);
      }
      if (images.length >= 8) break;
    }

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({ images });
  } catch {
    return res.status(502).json({ error: "TMDb fetch failed" });
  }
}
