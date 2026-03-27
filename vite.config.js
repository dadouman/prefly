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

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    ytSearchPlugin(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
})
