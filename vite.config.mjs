import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);

// Dev only: serve api/*.js (Vercel-style handlers) from the Vite dev server,
// so `npm run dev` runs the whole app without the Vercel CLI.
function vercelApi() {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const file = path.resolve('api', url.pathname.slice(5) + '.js');
        if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"Not found"}'); }
        let body = '';
        for await (const chunk of req) body += chunk;
        req.query = Object.fromEntries(url.searchParams);
        try { req.body = body ? JSON.parse(body) : {}; } catch { req.body = body; }
        res.status = code => { res.statusCode = code; return res; };
        res.json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
        res.send = s => { res.end(typeof s === 'string' ? s : JSON.stringify(s)); return res; };
        try {
          delete require.cache[file];
          await require(file)(req, res);
        } catch (err) {
          console.error(err);
          if (!res.writableEnded) res.status(500).json({ error: err.message });
        }
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) if (env[k]) process.env[k] = env[k];
  return { plugins: [react(), vercelApi()], server: { host: true } };
});
