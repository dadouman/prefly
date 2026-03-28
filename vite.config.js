import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

// YouTube search proxy plugin — server-side scraping, no CORS issues
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

        try {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
          const response = await fetch(searchUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
            },
          });
          const html = await response.text();
          // Extract video IDs from ytInitialData JSON embedded in the page
          const ids = [];
          const regex = /\"videoId\":\"([a-zA-Z0-9_-]{11})\"/g;
          let match;
          const seen = new Set();
          while ((match = regex.exec(html)) !== null) {
            if (!seen.has(match[1])) {
              seen.add(match[1]);
              ids.push(match[1]);
            }
            if (ids.length >= 5) break;
          }
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
    P136: "genre", P577: "date de sortie", P57: "réalisateur", P175: "interprète",
    P264: "label", P495: "pays d'origine", P364: "langue originale",
    P58: "scénariste", P86: "compositeur", P162: "producteur", P2047: "durée",
    P31: "type", P106: "profession", P27: "nationalité", P569: "date de naissance",
    P19: "lieu de naissance", P413: "poste", P54: "équipe", P641: "sport",
    P50: "auteur", P123: "éditeur", P407: "langue", P921: "sujet principal",
  };

  async function searchWikipedia(query, apiBase) {
    const url = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`;
    const r = await fetch(url); if (!r.ok) return null;
    const d = await r.json(); return d?.query?.search?.[0]?.title || null;
  }

  async function getWikidataId(pageTitle, lang) {
    const apiBase = lang === "fr" ? WIKI_API_FR : WIKI_API_EN;
    const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageprops&ppprop=wikibase_item&format=json&origin=*`;
    const r = await fetch(url); if (!r.ok) return null;
    const d = await r.json(); const pages = d?.query?.pages;
    return pages ? Object.values(pages)[0]?.pageprops?.wikibase_item || null : null;
  }

  async function batchResolveLabels(entityIds) {
    if (entityIds.length === 0) return {};
    const unique = [...new Set(entityIds)]; const labels = {};
    for (let i = 0; i < unique.length; i += 50) {
      const batch = unique.slice(i, i + 50);
      const url = `${WIKIDATA_API}?action=wbgetentities&ids=${batch.join("|")}&props=labels&languages=fr|en&format=json&origin=*`;
      const r = await fetch(url); if (!r.ok) continue;
      const d = await r.json();
      for (const [id, entity] of Object.entries(d?.entities || {})) {
        labels[id] = entity?.labels?.fr?.value || entity?.labels?.en?.value || id;
      }
    }
    return labels;
  }

  async function getWikidataAttributes(entityId) {
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`;
    const r = await fetch(url); if (!r.ok) return {};
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
        else if (dv.type === "quantity") { const a = dv.value.amount?.replace("+", ""); rawValues[attrName].push({ type: "literal", value: a }); }
        else if (dv.type === "string") rawValues[attrName].push({ type: "literal", value: dv.value });
        else if (dv.type === "monolingualtext") rawValues[attrName].push({ type: "literal", value: dv.value.text });
      }
    }
    const labels = await batchResolveLabels([...entityIdsToResolve]);
    const attrs = {};
    for (const [attrName, items] of Object.entries(rawValues)) {
      const values = items.map(item => item.type === "entity" ? (labels[item.id] || item.id) : item.value).filter(Boolean);
      const unique = [...new Set(values)];
      if (unique.length > 0) attrs[attrName] = unique.join(", ");
    }
    return attrs;
  }

  async function getWikiExtract(pageTitle, apiBase) {
    const url = `${apiBase}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=extracts&exintro=1&explaintext=1&exsentences=2&format=json&origin=*`;
    const r = await fetch(url); if (!r.ok) return null;
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
          let pageTitle = await searchWikipedia(query, WIKI_API_FR);
          let lang = "fr", apiBase = WIKI_API_FR;
          if (!pageTitle) { pageTitle = await searchWikipedia(query, WIKI_API_EN); lang = "en"; apiBase = WIKI_API_EN; }
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
