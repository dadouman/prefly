// Serverless function: searches Wikipedia for an item and extracts attributes
// (genre, year, type, etc.) from the Wikidata entity and Wikipedia infobox.

const WIKI_API_FR = "https://fr.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

// Wikidata property IDs we care about
const WIKIDATA_PROPS = {
  P136: "genre",
  P577: "date de sortie",
  P57: "réalisateur",
  P175: "interprète",
  P264: "label",
  P495: "pays d'origine",
  P364: "langue originale",
  P840: "lieu de l'intrigue",
  P58: "scénariste",
  P86: "compositeur",
  P162: "producteur",
  P2047: "durée",
  P444: "note critique",
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

// Find the Wikipedia page title via search
async function searchWikipedia(query, apiBase) {
  const url = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  const results = data?.query?.search;
  return results && results.length > 0 ? results[0].title : null;
}

// Get the Wikidata entity ID from a Wikipedia page title
async function getWikidataId(pageTitle, lang) {
  const apiBase = lang === "fr" ? WIKI_API_FR : WIKI_API_EN;
  const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&ppprop=wikibase_item&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.pageprops?.wikibase_item || null;
}

// Fetch Wikidata entity and extract human-readable attributes
async function getWikidataAttributes(entityId) {
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=claims|labels&languages=fr|en&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return {};
  const data = await res.json();
  const entity = data?.entities?.[entityId];
  if (!entity) return {};

  const claims = entity.claims || {};
  const attrs = {};

  for (const [propId, attrName] of Object.entries(WIKIDATA_PROPS)) {
    const propClaims = claims[propId];
    if (!propClaims || propClaims.length === 0) continue;

    const values = [];
    for (const claim of propClaims.slice(0, 5)) {
      const mainsnak = claim.mainsnak;
      if (!mainsnak || mainsnak.snaktype !== "value") continue;
      const dv = mainsnak.datavalue;
      if (!dv) continue;

      switch (dv.type) {
        case "wikibase-entityid": {
          // Resolve entity label
          const qid = dv.value.id;
          const label = await resolveEntityLabel(qid);
          if (label) values.push(label);
          break;
        }
        case "time": {
          const time = dv.value.time;
          // Format: +YYYY-MM-DDT00:00:00Z
          const year = time?.match(/\+?(\d{4})/)?.[1];
          if (year) values.push(year);
          break;
        }
        case "quantity": {
          const amount = dv.value.amount?.replace("+", "");
          const unit = dv.value.unit;
          let unitLabel = "";
          if (unit && unit !== "1") {
            const unitId = unit.split("/").pop();
            unitLabel = await resolveEntityLabel(unitId);
          }
          values.push(unitLabel ? `${amount} ${unitLabel}` : amount);
          break;
        }
        case "string":
          values.push(dv.value);
          break;
        case "monolingualtext":
          values.push(dv.value.text);
          break;
        default:
          break;
      }
    }

    if (values.length > 0) {
      attrs[attrName] = values.join(", ");
    }
  }

  return attrs;
}

// Resolve a Wikidata entity ID to its French (or English) label
async function resolveEntityLabel(entityId) {
  try {
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=labels&languages=fr|en&format=json&origin=*`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return entityId;
    const data = await res.json();
    const entity = data?.entities?.[entityId];
    if (!entity) return entityId;
    return entity.labels?.fr?.value || entity.labels?.en?.value || entityId;
  } catch {
    return entityId;
  }
}

// Get a short Wikipedia extract as a description
async function getWikiExtract(pageTitle, apiBase) {
  const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const page = Object.values(pages)[0];
  return page?.extract || null;
}

export default async function handler(req, res) {
  const { q } = req.query;
  if (!q || typeof q !== "string" || q.trim().length === 0) {
    return res.status(400).json({ error: "Missing q parameter" });
  }

  const query = q.trim();

  try {
    // Try French Wikipedia first, then English
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

    // Get Wikidata entity
    const wikidataId = await getWikidataId(pageTitle, lang);
    let attributes = {};

    if (wikidataId) {
      attributes = await getWikidataAttributes(wikidataId);
    }

    // Also get a short description
    const extract = await getWikiExtract(pageTitle, apiBase);
    if (extract) {
      attributes["description"] = extract;
    }

    // Add Wikipedia source
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
