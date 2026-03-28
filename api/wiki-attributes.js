// Serverless function: searches Wikipedia for an item and extracts attributes
// (genre, year, type, etc.) from the Wikidata entity.
// Optimized: batches all entity label resolutions in a single Wikidata call.

const WIKI_API_FR = "https://fr.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const WIKIDATA_PROPS = {
  // General
  P31: "type",
  P17: "pays",
  P131: "localisation",
  P625: "coordonnées",
  P580: "date de début",
  P582: "date de fin",
  P571: "date de création",
  P276: "lieu",
  P921: "sujet principal",
  // Music / Film / Art
  P136: "genre",
  P577: "date de sortie",
  P57: "réalisateur",
  P175: "interprète",
  P264: "label",
  P495: "pays d'origine",
  P364: "langue originale",
  P58: "scénariste",
  P86: "compositeur",
  P162: "producteur",
  P2047: "durée",
  // People
  P106: "profession",
  P27: "nationalité",
  P569: "date de naissance",
  P19: "lieu de naissance",
  P413: "poste",
  P54: "équipe",
  P641: "sport",
  // Books
  P50: "auteur",
  P123: "éditeur",
  P407: "langue",
  // Sport / Circuits / Events
  P1535: "utilisé pour",
  P2043: "longueur",
  P1083: "capacité",
  P1619: "date d'ouverture",
  P840: "lieu de l'action",
  P710: "participant",
  P1346: "vainqueur",
  P859: "sponsor",
  // Food / Drink
  P186: "matériau",
  P176: "fabricant",
  P127: "propriétaire",
  P138: "nommé d'après",
};

const FETCH_HEADERS = { "User-Agent": "Prefly/1.0 (https://prefly.vercel.app; contact@prefly.app)" };

async function safeFetch(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// Clean a query string to extract the most meaningful search term
// E.g. "Hungaroring\tBudapest\tHongrie\t24-26 juillet" → ["Hungaroring", "Hungaroring Budapest"]
function buildSearchVariants(raw) {
  // Normalize: replace tabs and multiple spaces with single space
  raw = raw.replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();

  // Remove date patterns: "24-26 juillet", "3 mars 2024", "2024", "12/06", etc.
  let cleaned = raw
    .replace(/\d{1,2}[-–]\d{1,2}\s+\w+/g, "")   // "24-26 juillet"
    .replace(/\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*\d{0,4}/gi, "") // "3 mars 2024"
    .replace(/\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi, "") // standalone months
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, "")
    .replace(/\b\d{4}\b/g, "")                     // standalone years "2024"
    .replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g, "") // dates like 12/06, 12-06-2024
    .replace(/\s{2,}/g, " ")
    .trim();

  const variants = [];

  // Prioritize: longer prefixes first (better disambiguation), then cleaned, then shorter, then full raw
  const words = cleaned ? cleaned.split(/\s+/) : raw.split(/\s+/);
  if (words.length > 4) variants.push(words.slice(0, 4).join(" "));
  if (words.length > 3) variants.push(words.slice(0, 3).join(" "));
  if (words.length > 2) variants.push(words.slice(0, 2).join(" "));
  if (cleaned && cleaned !== raw) variants.push(cleaned);
  if (words.length > 1) variants.push(words[0]);
  variants.push(raw);

  // Deduplicate while preserving order
  return [...new Set(variants.filter(Boolean))];
}

async function searchWikipedia(query, apiBase) {
  const url = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json`;
  const res = await safeFetch(url, 4000);
  if (!res?.ok) return null;
  const data = await res.json();
  return data?.query?.search?.[0]?.title || null;
}

async function getWikidataId(pageTitle, lang) {
  const apiBase = lang === "fr" ? WIKI_API_FR : WIKI_API_EN;
  const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&ppprop=wikibase_item&format=json`;
  const res = await safeFetch(url, 5000);
  if (!res?.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0]?.pageprops?.wikibase_item || null;
}

// Batch-resolve multiple Wikidata entity IDs to labels in ONE call (max 50)
async function batchResolveLabels(entityIds) {
  if (entityIds.length === 0) return {};
  const unique = [...new Set(entityIds)];
  const labels = {};
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${batch.join("|")}&props=labels&languages=fr|en&format=json`;
    const res = await safeFetch(url, 10000);
    if (!res?.ok) continue;
    const data = await res.json();
    const entities = data?.entities || {};
    for (const [id, entity] of Object.entries(entities)) {
      labels[id] = entity?.labels?.fr?.value || entity?.labels?.en?.value || id;
    }
  }
  return labels;
}

// Two-pass approach: collect entity IDs, batch resolve, then build attrs
async function getWikidataAttributes(entityId) {
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=claims&format=json`;
  const res = await safeFetch(url, 8000);
  if (!res?.ok) return {};
  const data = await res.json();
  const entity = data?.entities?.[entityId];
  if (!entity) return {};
  const claims = entity.claims || {};

  // PASS 1: Collect all entity IDs needing resolution
  const entityIdsToResolve = new Set();
  const rawValues = {};

  for (const [propId, attrName] of Object.entries(WIKIDATA_PROPS)) {
    const propClaims = claims[propId];
    if (!propClaims?.length) continue;
    rawValues[attrName] = [];
    for (const claim of propClaims.slice(0, 4)) {
      const ms = claim.mainsnak;
      if (!ms || ms.snaktype !== "value") continue;
      const dv = ms.datavalue;
      if (!dv) continue;
      if (dv.type === "wikibase-entityid") {
        entityIdsToResolve.add(dv.value.id);
        rawValues[attrName].push({ type: "entity", id: dv.value.id });
      } else if (dv.type === "time") {
        const year = dv.value.time?.match(/\+?(\d{4})/)?.[1];
        if (year) rawValues[attrName].push({ type: "literal", value: year });
      } else if (dv.type === "quantity") {
        const amount = dv.value.amount?.replace("+", "");
        if (dv.value.unit && dv.value.unit !== "1") {
          const unitId = dv.value.unit.split("/").pop();
          entityIdsToResolve.add(unitId);
          rawValues[attrName].push({ type: "quantity", amount, unitId });
        } else {
          rawValues[attrName].push({ type: "literal", value: amount });
        }
      } else if (dv.type === "string") {
        rawValues[attrName].push({ type: "literal", value: dv.value });
      } else if (dv.type === "monolingualtext") {
        rawValues[attrName].push({ type: "literal", value: dv.value.text });
      }
    }
  }

  // PASS 2: Batch resolve all entity labels in ONE API call
  const labels = await batchResolveLabels([...entityIdsToResolve]);

  // PASS 3: Build final attributes
  const attrs = {};
  for (const [attrName, items] of Object.entries(rawValues)) {
    const values = items.map((item) => {
      if (item.type === "entity") return labels[item.id] || item.id;
      if (item.type === "quantity") return labels[item.unitId] ? `${item.amount} ${labels[item.unitId]}` : item.amount;
      return item.value;
    }).filter(Boolean);
    const unique = [...new Set(values)];
    if (unique.length > 0) attrs[attrName] = unique.join(", ");
  }
  return attrs;
}

async function getWikiExtract(pageTitle, apiBase) {
  const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts&exintro=1&explaintext=1&exsentences=2&format=json`;
  const res = await safeFetch(url, 4000);
  if (!res?.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0]?.extract || null;
}

export const config = { maxDuration: 25 };

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return res.status(400).json({ error: "Missing q parameter" });
  }

  const query = q.trim();
  const variants = buildSearchVariants(query);

  try {
    let pageTitle = null;
    let lang = "fr";
    let apiBase = WIKI_API_FR;

    // Try each variant on FR Wikipedia, then EN
    for (const variant of variants) {
      pageTitle = await searchWikipedia(variant, WIKI_API_FR);
      if (pageTitle) { lang = "fr"; apiBase = WIKI_API_FR; break; }
    }
    if (!pageTitle) {
      for (const variant of variants) {
        pageTitle = await searchWikipedia(variant, WIKI_API_EN);
        if (pageTitle) { lang = "en"; apiBase = WIKI_API_EN; break; }
      }
    }

    if (!pageTitle) {
      return res.status(200).json({ attributes: {}, source: null });
    }

    // Run Wikidata + extract fetch in parallel
    const [wikidataId, extract] = await Promise.all([
      getWikidataId(pageTitle, lang),
      getWikiExtract(pageTitle, apiBase),
    ]);

    let attributes = {};
    if (wikidataId) {
      attributes = await getWikidataAttributes(wikidataId);
    }
    if (extract) {
      attributes["description"] = extract;
    }

    const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=600");
    return res.status(200).json({
      attributes,
      source: wikiUrl,
      title: pageTitle,
    });
  } catch (err) {
    return res.status(502).json({ error: "Wikipedia/Wikidata fetch failed" });
  }
}
