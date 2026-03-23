// =====================================================================
// IMAGE SEARCH — Fetches thumbnails from Wikipedia for list items
// Uses Wikipedia search API (free, no API key, CORS-friendly)
// =====================================================================

const cache = new Map();

const WIKI_API = "https://fr.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
const THUMB_SIZE = 200;

/**
 * Fetch a thumbnail for a single item via Wikipedia search.
 * Tries French Wikipedia first, then English.
 */
async function fetchSingleImage(term) {
  if (cache.has(term)) return cache.get(term);

  // For discography format, extract just the song name
  const searchTerm = extractSearchTerm(term);

  for (const api of [WIKI_API, WIKI_API_EN]) {
    try {
      const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: searchTerm,
        gsrlimit: "1",
        prop: "pageimages",
        pithumbsize: String(THUMB_SIZE),
        format: "json",
        origin: "*",
      });

      const res = await fetch(`${api}?${params}`);
      if (!res.ok) continue;

      const data = await res.json();
      const pages = data.query?.pages;
      if (!pages) continue;

      const page = Object.values(pages)[0];
      const url = page?.thumbnail?.source;
      if (url) {
        cache.set(term, url);
        return url;
      }
    } catch {
      // Network error, try next API
    }
  }

  cache.set(term, null);
  return null;
}

/**
 * Extract a clean search term from an item string.
 * Handles discography format: "Song - Album - Year"
 */
function extractSearchTerm(item) {
  const first = item.indexOf(" - ");
  if (first !== -1) {
    // Discography: use "song album" for better search results
    const song = item.substring(0, first);
    const rest = item.substring(first + 3);
    const ld = rest.lastIndexOf(" - ");
    const album = ld !== -1 ? rest.substring(0, ld) : rest;
    return `${song} ${album}`;
  }
  return item;
}

/**
 * Fetch images for a list of items.
 * Returns a Map<string, string|null> of item → imageUrl.
 * Fetches in parallel with concurrency limit.
 */
export async function fetchItemImages(items, onProgress) {
  const results = new Map();
  const toFetch = items.filter((item) => !cache.has(item));
  const alreadyCached = items.filter((item) => cache.has(item));

  // Add cached results immediately
  for (const item of alreadyCached) {
    results.set(item, cache.get(item));
  }

  // Fetch in batches of 5 to avoid overwhelming the API
  const BATCH_SIZE = 5;
  let fetched = 0;

  for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
    const batch = toFetch.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (item) => {
      const url = await fetchSingleImage(item);
      results.set(item, url);
      fetched++;
      onProgress?.(fetched, toFetch.length);
    });
    await Promise.all(promises);
  }

  return results;
}
