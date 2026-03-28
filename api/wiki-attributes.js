// Serverless function: searches Wikipedia for an item and extracts attributes
// (genre, year, type, etc.) from the Wikidata entity.
// Optimized: batches all entity label resolutions in a single Wikidata call.

const WIKI_API_FR = "https://fr.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const WIKIDATA_PROPS = {
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
  P31: "type",
  P106: "profession",
  P27: "nationalité",
  P569: "date de naissance",
  P19: "lieu de naissance",
  P413: "poste",
  P54: "équipe",
  P641: "sport",
  P50: "auteur",
  P123: "éditeur",
  P407: "langue",
  P921: "sujet principal",
};

async function safeFetch(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function searchWikipedia(query, apiBase) {
  const url = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
  const res = await safeFetch(url, 5000);
  if (!res?.ok) return null;
  const data = await res.json();
  return data?.query?.search?.[0]?.title || null;
}

async function getWikidataId(pageTitle, lang) {
  const apiBase = lang === "fr" ? WIKI_API_FR : WIKI_API_EN;
  const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&ppprop=wikibase_item&format=json&origin=*`;
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
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${batch.join("|")}&props=labels&languages=fr|en&format=json&origin=*`;
    const res = await safeFetch(url, 6000);
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
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`;
  const res = await safeFetch(url, 6000);
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
  const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`;
  const res = await safeFetch(url, 4000);
  if (!res?.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  return Object.values(pages)[0]?.extract || null;
}

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return res.status(400).json({ error: "Missing q parameter" });
  }

  const query = q.trim();

  try {
    let pageTitle = await searchWikipedia(query, WIKI_API_FR);
    let lang = "fr";
    let apiBase = WIKI_API_FR;

    if (!pageTitle) {
      pageTitle = await searchWikipedia(query, WIKI_API_EN);
      lang = "en";
      apiBase = WIKI_API_EN;
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

    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate");
    return res.status(200).json({
      attributes,
      source: wikiUrl,
      title: pageTitle,
    });
  } catch (err) {
    return res.status(502).json({ error: "Wikipedia/Wikidata fetch failed" });
  }
}
