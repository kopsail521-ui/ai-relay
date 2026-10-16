import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../static');
http.createServer((req, res) => {
  let url;
  try { url = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return; }
  let file;
  if (url.startsWith('/brand/')) file = path.join(root, url);
  else if (url === '/') file = path.join(root, 'seo/index.html');
  else if (url === '/pricing-list') file = path.join(root, 'seo/pricing.html');
  else file = path.join(root, 'seo', url + (path.extname(url) && !url.startsWith('/model/') ? '' : '.html'));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('Local preview: route unavailable'); return; }
  const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.svg':'image/svg+xml','.js':'text/javascript','.xml':'application/xml','.txt':'text/plain'};
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(8873, '127.0.0.1', () => console.log('SEO preview: http://127.0.0.1:8873/models'));
