import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// YouTube search proxy plugin — uses YouTube Data API v3
function ytSearchPlugin() {
  return {
    name: 'yt-search-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/api/yt-search') return next();

        const query = url.searchParams.get('q');
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Missing q parameter' }));
        }

        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'YOUTUBE_API_KEY not configured' }));
        }

        try {
          const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=5&q=${encodeURIComponent(query)}&key=${apiKey}`;
          const response = await fetch(searchUrl);
          if (!response.ok) {
            res.writeHead(502, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: 'YouTube API request failed' }));
          }
          const data = await response.json();
          const ids = (data.items || [])
            .map((item) => item.id?.videoId)
            .filter(Boolean);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ videoIds: ids }));
        } catch (e) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'YouTube fetch failed' }));
        }
      });
    },
  };
}

// Wikipedia/Wikidata attribute search proxy plugin (batched label resolution)
function wikiAttributesPlugin() {
  const WIKI_API_FR = "https://fr.wikipedia.org/w/api.php";
  const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";
  const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

  const WIKIDATA_PROPS = {
    P31: "type", P17: "pays", P131: "localisation", P625: "coordonnées",
    P580: "date de début", P582: "date de fin", P571: "date de création", P276: "lieu", P921: "sujet principal",
    P136: "genre", P577: "date de sortie", P57: "réalisateur", P175: "interprète",
    P264: "label", P495: "pays d'origine", P364: "langue originale",
    P58: "scénariste", P86: "compositeur", P162: "producteur", P2047: "durée",
    P106: "profession", P27: "nationalité", P569: "date de naissance",
    P19: "lieu de naissance", P413: "poste", P54: "équipe", P641: "sport",
    P50: "auteur", P123: "éditeur", P407: "langue",
    P1535: "utilisé pour", P2043: "longueur", P1083: "capacité", P1619: "date d'ouverture",
    P840: "lieu de l'action", P710: "participant", P1346: "vainqueur", P859: "sponsor",
    P186: "matériau", P176: "fabricant", P127: "propriétaire", P138: "nommé d'après",
  };

  const FETCH_HEADERS = { "User-Agent": "Prefly/1.0 (https://prefly.vercel.app; contact@prefly.app)" };

  async function safeFetch(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: controller.signal, headers: FETCH_HEADERS });
      clearTimeout(timer);
      return r;
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  function buildSearchVariants(raw) {
    raw = raw.replace(/[\t\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
    let cleaned = raw
      .replace(/\d{1,2}[-–]\d{1,2}\s+\w+/g, "")
      .replace(/\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s*\d{0,4}/gi, "")
      .replace(/\b(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\b/gi, "")
      .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, "")
      .replace(/\b\d{4}\b/g, "")
      .replace(/\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    const variants = [];
    const words = cleaned ? cleaned.split(/\s+/) : raw.split(/\s+/);
    if (words.length > 4) variants.push(words.slice(0, 4).join(" "));
    if (words.length > 3) variants.push(words.slice(0, 3).join(" "));
    if (words.length > 2) variants.push(words.slice(0, 2).join(" "));
    if (cleaned && cleaned !== raw) variants.push(cleaned);
    if (words.length > 1) variants.push(words[0]);
    variants.push(raw);
    return [...new Set(variants.filter(Boolean))];
  }

  async function searchWikipedia(query, apiBase) {
    const url = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const r = await safeFetch(url, 4000); if (!r?.ok) return null;
    const d = await r.json(); return d?.query?.search?.[0]?.title || null;
  }

  async function getWikidataId(pageTitle, lang) {
    const apiBase = lang === "fr" ? WIKI_API_FR : WIKI_API_EN;
    const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&ppprop=wikibase_item&format=json&origin=*`;
    const r = await safeFetch(url, 5000); if (!r?.ok) return null;
    const d = await r.json(); const pages = d?.query?.pages;
    return pages ? Object.values(pages)[0]?.pageprops?.wikibase_item || null : null;
  }

  async function batchResolveLabels(entityIds) {
    if (entityIds.length === 0) return {};
    const unique = [...new Set(entityIds)]; const labels = {};
    for (let i = 0; i < unique.length; i += 50) {
      const batch = unique.slice(i, i + 50);
      const url = `${WIKIDATA_API}?action=wbgetentities&ids=${batch.join("|")}&props=labels&languages=fr|en&format=json&origin=*`;
      const r = await safeFetch(url, 10000); if (!r?.ok) continue;
      const d = await r.json();
      for (const [id, entity] of Object.entries(d?.entities || {})) {
        labels[id] = entity?.labels?.fr?.value || entity?.labels?.en?.value || id;
      }
    }
    return labels;
  }

  async function getWikidataAttributes(entityId) {
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`;
    const r = await safeFetch(url, 8000); if (!r?.ok) return {};
    const d = await r.json(); const entity = d?.entities?.[entityId];
    if (!entity) return {};
    const claims = entity.claims || {};
    const entityIdsToResolve = new Set(); const rawValues = {};
    for (const [propId, attrName] of Object.entries(WIKIDATA_PROPS)) {
      const propClaims = claims[propId]; if (!propClaims?.length) continue;
      rawValues[attrName] = [];
      for (const claim of propClaims.slice(0, 4)) {
        const ms = claim.mainsnak; if (!ms || ms.snaktype !== "value") continue;
        const dv = ms.datavalue; if (!dv) continue;
        if (dv.type === "wikibase-entityid") { entityIdsToResolve.add(dv.value.id); rawValues[attrName].push({ type: "entity", id: dv.value.id }); }
        else if (dv.type === "time") { const y = dv.value.time?.match(/\+?(\d{4})/)?.[1]; if (y) rawValues[attrName].push({ type: "literal", value: y }); }
        else if (dv.type === "quantity") {
          const a = dv.value.amount?.replace("+", "");
          if (dv.value.unit && dv.value.unit !== "1") {
            const unitId = dv.value.unit.split("/").pop();
            entityIdsToResolve.add(unitId);
            rawValues[attrName].push({ type: "quantity", amount: a, unitId });
          } else { rawValues[attrName].push({ type: "literal", value: a }); }
        }
        else if (dv.type === "string") rawValues[attrName].push({ type: "literal", value: dv.value });
        else if (dv.type === "monolingualtext") rawValues[attrName].push({ type: "literal", value: dv.value.text });
      }
    }
    const labels = await batchResolveLabels([...entityIdsToResolve]);
    const attrs = {};
    for (const [attrName, items] of Object.entries(rawValues)) {
      const values = items.map(item => {
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
    const r = await safeFetch(url, 4000); if (!r?.ok) return null;
    const d = await r.json(); const pages = d?.query?.pages;
    return pages ? Object.values(pages)[0]?.extract || null : null;
  }

  return {
    name: 'wiki-attributes-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/api/wiki-attributes') return next();
        const query = url.searchParams.get('q');
        if (!query) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Missing q parameter' })); }
        try {
          const variants = buildSearchVariants(query.trim());
          let pageTitle = null;
          let lang = "fr", apiBase = WIKI_API_FR;
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
          if (!pageTitle) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ attributes: {}, source: null })); }
          const [wikidataId, extract] = await Promise.all([getWikidataId(pageTitle, lang), getWikiExtract(pageTitle, apiBase)]);
          let attributes = {};
          if (wikidataId) attributes = await getWikidataAttributes(wikidataId);
          if (extract) attributes["description"] = extract;
          const wikiUrl = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, "_"))}`;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ attributes, source: wikiUrl, title: pageTitle }));
        } catch {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Wikipedia/Wikidata fetch failed' }));
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    ytSearchPlugin(),
    wikiAttributesPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
