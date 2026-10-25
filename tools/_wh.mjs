import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { flatten } from "@gltf-transform/functions";
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
// world-space vertices of every mesh
async function verts(n) {
  const doc = await io.read(`../models-src/${n}/source.glb`); const pts = [];
  doc.getRoot().listScenes()[0].traverse(node => { const m = node.getMesh(); if (!m) return; const M = node.getWorldMatrix();
    for (const p of m.listPrimitives()) { const a = p.getAttribute("POSITION"), v = [0,0,0]; for (let i = 0; i < a.getCount(); i++) { a.getElement(i, v); pts.push([M[0]*v[0]+M[4]*v[1]+M[8]*v[2]+M[12], M[1]*v[0]+M[5]*v[1]+M[9]*v[2]+M[13], M[2]*v[0]+M[6]*v[1]+M[10]*v[2]+M[14]]); } } });
  return pts;
}
for (const n of process.argv.slice(2)) {
  let P = await verts(n);
  const mn = [0,1,2].map(i => Math.min(...P.map(p => p[i]))), mx = [0,1,2].map(i => Math.max(...P.map(p => p[i])));
  const ext = mx.map((m, i) => m - mn[i]);
  const s = (+process.env["L_" + n] || 4.2) / Math.max(ext[0], ext[2]);
  const lenAxis = ext[0] > ext[2] ? 0 : 2, side = 2 - lenAxis;
  P = P.map(p => [(p[side] - (mn[side] + mx[side]) / 2) * s, (p[1] - mn[1]) * s, (p[lenAxis] - (mn[lenAxis] + mx[lenAxis]) / 2) * s]);
  const H = Math.max(...P.map(p => p[1]));
  // contact patches: lowest points
  const low = P.filter(p => p[1] < 0.03);
  const q = {}; for (const p of low) { const k = (p[0] > 0 ? "L" : "R") + (p[2] > 0 ? "F" : "B"); (q[k] ||= []).push(p); }
  console.log(`== ${n} scale≈${s.toFixed(4)} lenAxis=${"xyz"[lenAxis]} size ${ext.map(e => (e*s).toFixed(2)).join("x")} height ${H.toFixed(2)}`);
  for (const [k, ps] of Object.entries(q)) {
    const cx = ps.reduce((a, p) => a + p[0], 0) / ps.length, cz = ps.reduce((a, p) => a + p[2], 0) / ps.length;
    const sl = P.filter(p => Math.abs(p[0] - cx) < 0.22 && Math.abs(p[2] - cz) < 0.5 && p[1] < 0.9);
    let best = 0, r = 0;
    for (let R = 0.2; R <= 0.42; R += 0.002) { const n = sl.filter(p => Math.abs(Math.hypot(p[1] - R, p[2] - cz) - R) < 0.006).length; if (n > best) { best = n; r = R; } }
    const hist = [best], bi = 0;
    const ring = P.filter(p => { const d = Math.hypot(p[1] - r, p[2] - cz); return d > r * 0.85 && d < r * 1.01 && Math.abs(p[0] - cx) < 0.25; });
    const xs = ring.map(p => p[0]).sort((a, b) => a - b);
    console.log(`  ${k} n=${ps.length} centre x ${cx.toFixed(3)} z ${cz.toFixed(3)} r ${r.toFixed(3)} (hits ${hist[bi]}) width ${xs.length ? (xs[Math.floor(xs.length*0.97)] - xs[Math.floor(xs.length*0.03)]).toFixed(3) : "?"}`);
  }
}
