import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import sharp from "sharp";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const n of process.argv.slice(2)) {
  const doc = await io.read(`../models-src/${n}/source.glb`); const P = [];
  doc.getRoot().listScenes()[0].traverse(node => { const m = node.getMesh(); if (!m) return; const M = node.getWorldMatrix();
    for (const p of m.listPrimitives()) { const a = p.getAttribute("POSITION"), v = [0,0,0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); P.push([M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12], M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13], M[2]*v[0]+M[6]*v[1]+M[10]*v[2]+M[14]]); } } });
  const mn = [0,1,2].map(i => Math.min(...P.map(p => p[i]))), mx = [0,1,2].map(i => Math.max(...P.map(p => p[i])));
  const W = 600, Hh = 260, S = W / Math.max(mx[0]-mn[0], mx[2]-mn[2]);
  const img = Buffer.alloc(W * Hh * 2 * 3, 255);
  for (const p of P) {
    const zx = Math.floor((p[2] - mn[2]) * S), y = Hh - 1 - Math.floor((p[1] - mn[1]) * S), xx = Math.floor((p[0] - mn[0]) * S);
    if (zx >= 0 && zx < W && y >= 0 && y < Hh) img.fill(0, (y * W + zx) * 3, (y * W + zx) * 3 + 3);
    const ty = Hh + Math.floor(xx * Hh / W * (W / Hh) * 0.43); if (zx >= 0 && zx < W && xx >= 0 && xx < Hh) img.fill(80, ((Hh + xx) * W + zx) * 3, ((Hh + xx) * W + zx) * 3 + 3);
  }
  await sharp(img, { raw: { width: W, height: Hh * 2, channels: 3 } }).png().toFile(`../test/tmp/sil_${n}.png`);
  console.log(n, "raw size", mx.map((m, i) => (m - mn[i]).toFixed(1)).join(" x "));
}
