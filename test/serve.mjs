import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import url from "node:url";
const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "force-app/main/default/staticresources/RallyLegends");
const cars = path.join(root, "force-app/main/default/staticresources/RallyLegendsCars");
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".txt": "text/plain", ".glb": "model/gltf-binary" };
http.createServer((req, rsp) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = p.startsWith("/res/") ? path.join(res, p.slice(5)) : p.startsWith("/cars/") ? path.join(cars, p.slice(6)) : path.join(root, "test", p === "/" ? "index.html" : p);
  if (!file.startsWith(root) || !fs.existsSync(file)) { rsp.writeHead(404); return rsp.end("nf"); }
  rsp.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(rsp);
}).listen(8787, () => console.log("http://localhost:8787"));
