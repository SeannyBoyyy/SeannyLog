import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png'};
createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if(!pathname.startsWith('/seannylog/')){ res.writeHead(404).end(); return; }
  const relative = decodeURIComponent(pathname.slice('/seannylog/'.length)) || 'index.html';
  const filename = resolve(root, relative);
  if(!filename.startsWith(resolve(root)+sep) || relative.startsWith('backend/') || relative.startsWith('.')){
    res.writeHead(403).end(); return;
  }
  try{
    const bytes = await readFile(filename);
    res.writeHead(200, {'Content-Type':types[extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-cache'}).end(bytes);
  }catch{ res.writeHead(404).end(); }
}).listen(8080, 'localhost');
