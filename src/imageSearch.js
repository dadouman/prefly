// =====================================================================
// IMAGE SEARCH — Fetches thumbnails for list items
// Supports Wikipedia (default) and TMDb sources
// =====================================================================

// Cache stores { urls: string[], index: number } per "source:term" key
const cache = new Map();

// Current source: "wikipedia" | "tmdb"
let currentSource = "wikipedia";

export function setImageSource(source) {
  currentSource = source;
}

export function getImageSource() {
  return currentSource;
}

const WIKI_API = "https://fr.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
const THUMB_SIZE = 200;
const RESULTS_PER_SEARCH = 8;

function cacheKey(term) {
  return `${currentSource}:${term}`;
}

/**
 * Fetch a thumbnail via Wikipedia search.
 */
async function fetchFromWikipedia(searchTerm) {
  const allUrls = [];
  for (const api of [WIKI_API, WIKI_API_EN]) {
    try {
      const params = new URLSearchParams({
        action: "query",
        generator: "search",
        gsrsearch: searchTerm,
        gsrlimit: String(RESULTS_PER_SEARCH),
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
      for (const page of Object.values(pages)) {
        const url = page?.thumbnail?.source;
        if (url && !allUrls.includes(url)) allUrls.push(url);
      }
      if (allUrls.length > 0) break;
    } catch {
      // Network error, try next API
    }
  }
  return allUrls;
}

/**
 * Fetch a thumbnail via our TMDb serverless proxy.
 */
async function fetchFromTMDb(searchTerm) {
  try {
    const params = new URLSearchParams({ q: searchTerm });
    const res = await fetch(`/api/tmdb-search?${params}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.images || [];
  } catch {
    return [];
  }
}

/**
 * Fetch a thumbnail for a single item using the current source.
 */
async function fetchSingleImage(term) {
  const key = cacheKey(term);
  if (cache.has(key)) {
    const entry = cache.get(key);
    return entry.urls[entry.index] ?? null;
  }

  const searchTerm = extractSearchTerm(term);
  const allUrls = currentSource === "tmdb"
    ? await fetchFromTMDb(searchTerm)
    : await fetchFromWikipedia(searchTerm);

  cache.set(key, { urls: allUrls, index: 0 });
  return allUrls[0] ?? null;
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
 * Dismiss current image for a term and return the next one (or null).
 */
export function dismissImage(term) {
  const key = cacheKey(term);
  const entry = cache.get(key);
  if (!entry || entry.urls.length === 0) return null;
  entry.index = (entry.index + 1) % entry.urls.length;
  return entry.urls[entry.index] ?? null;
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
    const entry = cache.get(item);
    results.set(item, entry.urls[entry.index] ?? null);
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
