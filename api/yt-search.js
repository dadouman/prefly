export default async function handler(req, res) {
  const { q } = req.query;
  if (!q) {
    return res.status(400).json({ error: "Missing q parameter" });
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "YouTube API key not configured" });
  }

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=5&q=${encodeURIComponent(q)}&key=${apiKey}`;
    const response = await fetch(searchUrl);

    if (!response.ok) {
      const text = await response.text();
      console.error("YouTube API error:", text.slice(0, 200));
      return res.status(502).json({ error: "YouTube API request failed" });
    }

    const data = await response.json();
    const ids = (data.items || [])
      .map((item) => item.id?.videoId)
      .filter(Boolean);

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({ videoIds: ids });
  } catch (err) {
    console.error("YouTube search error:", err.message);
    return res.status(502).json({ error: "YouTube fetch failed" });
  }
}
