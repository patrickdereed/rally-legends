// Converts the CC-BY source models in models-src/ into game-ready GLBs in the RallyLegendsCars* static resources
// (each zip must stay under 5 MB, so models are split into numbered packs), then writes kits.js (model -> pack),
// each pack's CREDITS.txt and resource metadata, and the pack URLs in the Visualforce page.
//   cd tools && npm install && cd .. && node tools/build-cars.mjs [name ...]
// Sources (see CREDITS.md for where each one comes from) go in models-src/<name>/source.glb, which isn't committed.
// Each model is flattened into car space (x = left, y = up from the ground, z = forward), its wheels and callipers
// are removed (the game builds its own so rim colours and tyre/brake upgrades still show), paint and lamps are
// tagged by material name, a second UV set maps the livery canvas around the body, textures are shrunk to WebP,
// and the measurements car.js needs (axles, wheel size, cabin, belt line) are stored in the scene extras.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { flatten, join, dedup, prune, quantize, textureCompress, clearNodeTransform } from "@gltf-transform/functions";
import sharp from "sharp";

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const SR = path.join(root, "force-app/main/default/staticresources");
const packName = n => "RallyLegendsCars" + (n > 1 ? n : "");
const DZ = "Daniel Zhabotinsky", DZU = "https://sketchfab.com/DanielZhabotinsky";
const sf = uid => "https://sketchfab.com/3d-models/" + uid;

// fwd: which source axis is the front of the car; scale, plus zs to stretch the length; drop: extra node names to remove.
const MODELS = {
  thunderbolt: { pack: 1, fwd: "+x", scale: 1, paint: ["thunderbolt96_body"],
    credit: ["Thunderbolt '96 - Low poly model", DZ, sf("thunderbolt-96-low-poly-model-25a4ff2002834ec1b4441c57ecd7ca9f")] },
  // headlamp units are part of shared trim meshes here: split out the triangles inside the lamp box (|x|, y, z)
  toyama: { pack: 1, fwd: "+z", scale: 1, paint: ["Body_Paint"], brake: /Glass_Body_Glass_Red/, steer: 0.37,
    headBox: { mats: /^(Textures|Body_Chrome)$/, min: [0.3, 0.6, 1.75], max: [0.9, 0.9, 2.3] },
    credit: ["Generic Toyama XR Sedan", "mk2design", sf("generic-toyama-xr-sedan-a161542c38ac44fca3b1c283f6d986bb")] },
  mv6: { pack: 1, fwd: "+x", scale: 1.1, zs: 1.08, paint: ["PlaceholderMV683_Bodymat"], note: "scaled up 10% and lengthened 8%",
    credit: ["Placeholder MV6 '83 - Low poly model", DZ, sf("placeholder-mv6-83-low-poly-model-d78bdfc34e024ac7926853f9ae863190")] },
  asti: { pack: 2, fwd: "+x", scale: 1, paint: ["APGRPA89_Bodymat"],
    credit: ["Asti Stradale '89 - Low poly model", DZ, sf("asti-stradale-89-low-poly-model-97b15b067111443ebe05840137b49c65")] },
  lasley: { pack: 2, fwd: "+x", scale: 1, paint: ["lasley67_Bodymat"],
    credit: ["Lasley '67 - Low poly model", DZ, sf("lasley-67-low-poly-model-1269720ec7b84c899eac77c1d325141e")] },
  doutrive: { pack: 3, fwd: "+x", scale: 0.88, note: "scaled to 88%", paint: ["DOUTRIVE78_bodymat"],
    credit: ["Doutrive '78 - Low poly model", DZ, sf("doutrive-78-low-poly-model-30700a84311c4bea9ef722f0773ce92a")] },
  stinger: { pack: 3, fwd: "+x", scale: 1.06, note: "scaled up 6%", paint: ["Boxer96_Body"],
    credit: ["Stinger '96 - Low Poly model", DZ, sf("stinger-96-low-poly-model-a9832fee5393460baf1675fade6f2f25")] },
  urban: { pack: 4, fwd: "+x", scale: 1, paint: ["Urban10_bodymat"],
    credit: ["Urban '10 - Low poly model", DZ, sf("urban-10-low-poly-model-2866efdfa943484391ef8313768e074d")] },
  eagle: { pack: 2, fwd: "-x", scale: 0.95, note: "scaled to 95%", glass: /^GT1_Glass_Clean$/, paint: ["Body_EagleTurbo92"],
    credit: ["Eagle Turbo '92 - Retro Style Model", DZ, sf("eagle-turbo-92-retro-style-model-eb7d6c072bf54d9ba6a48f6d49e6abeb")] },
  sialia: { pack: 4, fwd: "+x", scale: 1, paint: ["SialiaSW68_body"],
    credit: ["Sialia SW '68 Racemod - Low poly model", DZ, sf("sialia-sw-68-racemod-low-poly-model-2e63fb0a8f7e4ea9b3cbf796e8373d49")] },
  fairheaven: { pack: 5, fwd: "+x", scale: 1, paint: ["Fairheaven_LT80_Bodymat"],
    credit: ["Fairheaven SW '84 - Low poly model", DZ, sf("fairheaven-sw-84-low-poly-model-aa0becb6e854422596cac6b21bf79787")] },
  sanremo: { pack: 5, fwd: "+x", scale: 1, paint: ["Sanremo70_Bodymat"],
    credit: ["Sanremo '70 - Low poly model", DZ, sf("sanremo-70-low-poly-model-b2261c471645417a8b7e5882d541c248")] },
  // Single-texture models that keep their own livery (fixed: no paint material). Wheels are found from the
  // geometry (autoWheels) and cut out; body measurements use bodyMat, and anything the geometry can't tell
  // (glass, belt line) comes from meta.
  quattro: { pack: 6, fwd: "-z", scale: 0.00937, paint: [], fixed: true, autoWheels: true, bodyMat: /^Audi$/,
    meta: { belt: 0.9, screenBase: 0.6, screenTop: 0.22, rearTop: -1.08, rearBase: -1.3, hoodY: 0.92 },
    credit: ["Audi Quattro S1", "TonyWony", sf("audi-quattro-s1-402697365eaa41a68a543b71d0e0bfa8")] },
  l037: { pack: 6, fwd: "-z", scale: 0.7583, paint: [], fixed: true, autoWheels: true, bodyMat: /^material_0$/,
    meta: { belt: 0.83, screenBase: 0.6, screenTop: 0.1, rearTop: -0.76, rearBase: -1.0, hoodY: 0.8 },
    credit: ["83' Lancia Rallye 037 (Martini Livery)", "ashminggu", sf("83-lancia-rallye-037-martini-livery-97629bcffa3442e08e094e93093d3676")] },
  a110: { pack: 6, fwd: "+z", scale: 0.762, paint: [], fixed: true, autoWheels: true, bodyMat: /^chassis$/, glass: /^glas$/,
    credit: ["Renault Alpine A110 lowPoly", "DINmatin", sf("renault-alpine-a110-lowpoly-d39c04955c784d02acc09c159e0b6a82")] }
};

// Wheels from geometry: the lowest points give each wheel's contact patch, a circle fitted through the
// tread (it must touch the ground) gives the radius, and every triangle inside the tyre's cylinder is cut.
function cutWheels(scene, wheels) {
  const all = [];
  for (const node of scene.listChildren()) for (const prim of node.getMesh().listPrimitives()) eachVertex(prim, v => all.push([...v]));
  const minY = Math.min(...all.map(p => p[1]));
  const low = all.filter(p => p[1] < minY + 0.03), q = { FL: [], FR: [], RL: [], RR: [] };
  for (const p of low) q[(p[2] > 0 ? "F" : "R") + (p[0] > 0 ? "L" : "R")].push(p);
  const cyl = {};
  for (const [k, ps] of Object.entries(q)) {
    if (!ps.length) throw new Error("autoWheels: no contact patch " + k);
    const cx = ps.reduce((a, p) => a + p[0], 0) / ps.length, cz = ps.reduce((a, p) => a + p[2], 0) / ps.length;
    const sl = all.filter(p => Math.abs(p[0] - cx) < 0.22 && Math.abs(p[2] - cz) < 0.5 && p[1] < minY + 0.9);
    let best = 0, r = 0.3;
    for (let R = 0.2; R <= 0.42; R += 0.002) { const n = sl.filter(p => Math.abs(Math.hypot(p[1] - minY - R, p[2] - cz) - R) < 0.006).length; if (n > best) { best = n; r = R; } }
    const ring = all.filter(p => { const d = Math.hypot(p[1] - minY - r, p[2] - cz); return d > r * 0.85 && d < r * 1.01 && Math.abs(p[0] - cx) < 0.25; }).map(p => p[0]).sort((a, b) => a - b);
    const x0 = ring[Math.floor(ring.length * 0.03)], x1 = ring[Math.floor(ring.length * 0.97)];
    cyl[k] = { cx: (x0 + x1) / 2, cy: minY + r, cz, r, w: x1 - x0 };
  }
  // cut triangles whose vertices are all inside a tyre cylinder (rims, tyres, discs, callipers)
  const inside = v => Object.values(cyl).some(c => Math.abs(v[0] - c.cx) < c.w / 2 + 0.03 && Math.hypot(v[1] - c.cy, v[2] - c.cz) < c.r * 1.02);
  for (const node of scene.listChildren()) for (const prim of node.getMesh().listPrimitives()) {
    const pos = prim.getAttribute("POSITION"), idx = prim.getIndices(); if (!idx) continue;
    const arr = idx.getArray(), keep = [], a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
    for (let t = 0; t < arr.length; t += 3) { pos.getElement(arr[t], a); pos.getElement(arr[t + 1], b); pos.getElement(arr[t + 2], c); if (!(inside(a) && inside(b) && inside(c))) keep.push(arr[t], arr[t + 1], arr[t + 2]); }
    idx.setArray(new arr.constructor(keep));
  }
  for (const [k, c] of Object.entries(cyl)) for (const sx of [-1, 1]) for (const sy of [-1, 1]) wheels[k].push([c.cx + sx * c.w / 2, c.cy + sy * c.r, c.cz]);
}
const DROP = /WheelStock|WheelSport|WheelTuned|(^|_)Wheel_(FL|FR|RL|RR)|Caliper|Shadow/i;
const WHEEL = /(WheelStock|WheelSport|WheelTuned|(^|_)Wheel)_(FL|FR|RL|RR)/i;
const HEAD = /(Headlights|Rallylights_Headlights|Foglights)\d*_UCB_Lights_and_Glass_0$|^Glass_Headlights_gt1/i;
const BRAKE = /Brakelights\d*_UCB_Lights_and_Glass_0$|^Glass_Stoplight_gt1/i;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "sharp": sharp });

// Source axis -> car space: rotation about y so that the front faces +z.
// Column-major 4x4.
function orient(fwd, s) {
  return {
    "+x": [0, 0, s, 0, 0, s, 0, 0, -s, 0, 0, 0, 0, 0, 0, 1],
    "+z": [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1],
    "-x": [0, 0, -s, 0, 0, s, 0, 0, s, 0, 0, 0, 0, 0, 0, 1],
    "-z": [-s, 0, 0, 0, 0, s, 0, 0, 0, 0, -s, 0, 0, 0, 0, 1]
  }[fwd];
}

function eachVertex(prim, fn) {
  const p = prim.getAttribute("POSITION"), n = prim.getAttribute("NORMAL"), v = [0, 0, 0], nv = [0, 0, 0];
  for (let i = 0; i < p.getCount(); i++) { p.getElement(i, v); if (n) n.getElement(i, nv); fn(v, nv, i); }
}
const pct = (arr, q) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

async function build(name) {
  const cfg = MODELS[name];
  const src = path.join(root, "models-src", name, "source.glb");
  const doc = await io.read(src);
  const R = doc.getRoot(), scene = R.listScenes()[0];
  await doc.transform(flatten());

  // bake every node transform (and the orientation) into its mesh
  const M = orient(cfg.fwd, cfg.scale);
  for (const i of [2, 6, 10]) M[i] *= cfg.zs || 1;
  const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };
  const wheels = { FL: [], FR: [], RL: [], RR: [] };
  for (const node of scene.listChildren()) {
    node.setMatrix(mul(M, node.getMatrix()));
    if (node.getMesh() && node.getMesh().listParents().filter(p => p.propertyType === "Node").length > 1) node.setMesh(node.getMesh().clone());
    clearNodeTransform(node);
  }
  // measure the wheels, then drop them with everything else we don't want
  for (const node of [...scene.listChildren()]) {
    const nm = node.getName(), mesh = node.getMesh();
    const w = nm.match(WHEEL);
    if (w && mesh && !/Caliper/i.test(nm)) for (const prim of mesh.listPrimitives()) eachVertex(prim, v => wheels[w[3].toUpperCase()].push([...v]));
    if (DROP.test(nm) || (cfg.drop && cfg.drop.test(nm)) || !mesh) { node.dispose(); continue; }
  }
  if (cfg.autoWheels) cutWheels(scene, wheels);
  // centre the car: wheels straddle x = 0, body ends equidistant from z = 0 (some sources sit off to one side)
  {
    const wp = Object.values(wheels).flat();
    let zMin = Infinity, zMax = -Infinity;
    for (const node of scene.listChildren()) for (const prim of node.getMesh().listPrimitives()) eachVertex(prim, v => { zMin = Math.min(zMin, v[2]); zMax = Math.max(zMax, v[2]); });
    const dx = wp.length ? wp.reduce((s, v) => s + v[0], 0) / wp.length : 0, dz = (zMin + zMax) / 2;
    if (Math.abs(dx) > 0.005 || Math.abs(dz) > 0.005) {
      const done = new Set();
      for (const node of scene.listChildren()) for (const prim of node.getMesh().listPrimitives()) {
        const acc = prim.getAttribute("POSITION"); if (done.has(acc)) continue; done.add(acc);
        const v = [0, 0, 0]; for (let i = 0; i < acc.getCount(); i++) { acc.getElement(i, v); v[0] -= dx; v[2] -= dz; acc.setElement(i, v); }
      }
      for (const v of wp) { v[0] -= dx; v[2] -= dz; }
    }
  }
  // tag lamps with their own material copies so the game can light them separately
  const tagged = new Map();
  const retag = (prim, tag) => {
    const key = tag + ":" + prim.getMaterial().getName();
    if (!tagged.has(key)) tagged.set(key, prim.getMaterial().clone().setName(tag));
    prim.setMaterial(tagged.get(key));
  };
  for (const node of scene.listChildren()) {
    const nm = node.getName();
    for (const prim of node.getMesh().listPrimitives()) {
      if (HEAD.test(nm)) retag(prim, "lamp_head");
      else if (BRAKE.test(nm) || (cfg.brake && cfg.brake.test(nm))) retag(prim, "lamp_brake");
    }
  }
  if (cfg.headBox) {
    const hb = cfg.headBox, inBox = c => Math.abs(c[0]) >= hb.min[0] && Math.abs(c[0]) <= hb.max[0] && c[1] >= hb.min[1] && c[1] <= hb.max[1] && c[2] >= hb.min[2] && c[2] <= hb.max[2];
    for (const node of scene.listChildren()) for (const prim of node.getMesh().listPrimitives()) {
      if (!hb.mats.test(prim.getMaterial().getName()) || !prim.getIndices()) continue;
      const idx = prim.getIndices().getArray(), pos = prim.getAttribute("POSITION"), a = [0, 0, 0], inside = [], outside = [];
      for (let t = 0; t < idx.length; t += 3) {
        const c = [0, 0, 0];
        for (let k = 0; k < 3; k++) { pos.getElement(idx[t + k], a); c[0] += a[0] / 3; c[1] += a[1] / 3; c[2] += a[2] / 3; }
        (inBox(c) ? inside : outside).push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (!inside.length) continue;
      const Arr = idx.constructor, buf = R.listBuffers()[0];
      prim.getIndices().setArray(new Arr(outside));
      const lamp = prim.clone().setIndices(doc.createAccessor().setType("SCALAR").setArray(new Arr(inside)).setBuffer(buf));
      node.getMesh().addPrimitive(lamp);
      retag(lamp, "lamp_head");
    }
  }
  let steerX = cfg.steer;
  if (steerX == null) {
    const sw = [];
    for (const node of scene.listChildren()) if (/Steering/i.test(node.getName())) for (const prim of node.getMesh().listPrimitives()) eachVertex(prim, v => sw.push(v[0]));
    steerX = sw.length ? (Math.min(...sw) + Math.max(...sw)) / 2 : 0.37;
  }
  for (const m of R.listMaterials()) if (cfg.paint.includes(m.getName())) m.setName("paint");
  await doc.transform(prune(), dedup({ keepUniqueNames: true }), join({ keepNamed: false }));

  // ---- measurements in car space ----
  const allPaint = [], glass = [], all = [];
  for (const mesh of R.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial(), isPaint = mat.getName() === "paint" || !!(cfg.bodyMat && cfg.bodyMat.test(mat.getName()));
    const isGlass = cfg.glass ? cfg.glass.test(mat.getName()) : mat.getAlphaMode() === "BLEND" && /glass|transperent|^glas$/i.test(mat.getName()) && !/lamp/i.test(mat.getName());
    eachVertex(prim, (v, n) => { all.push([...v]); if (isPaint) allPaint.push([...v]); if (isGlass) glass.push([...v, ...n]); });
  }
  const wheel = k => {
    const pts = wheels[k]; if (!pts.length) throw new Error(name + ": no wheel " + k);
    const mn = [0, 1, 2].map(i => Math.min(...pts.map(p => p[i]))), mx = [0, 1, 2].map(i => Math.max(...pts.map(p => p[i])));
    return { c: mn.map((a, i) => (a + mx[i]) / 2), r: (mx[1] - mn[1]) / 2, w: mx[0] - mn[0] };
  };
  const W = Object.keys(wheels).map(wheel);
  const front = W.filter(w => w.c[2] > 0), rear = W.filter(w => w.c[2] < 0);
  const zF = front.reduce((s, w) => s + w.c[2], 0) / 2, zR = rear.reduce((s, w) => s + w.c[2], 0) / 2;
  const wheelR = W.reduce((s, w) => s + w.r, 0) / 4, wheelW = W.reduce((s, w) => s + w.w, 0) / 4;
  const track = W.reduce((s, w) => s + Math.abs(w.c[0]), 0) / 2;
  const zNose = Math.max(...all.map(p => p[2])), zTail = Math.min(...all.map(p => p[2]));
  const hwMax = Math.max(...allPaint.map(p => Math.abs(p[0])));
  const mid = allPaint.filter(p => p[2] < zF - wheelR && p[2] > zR + wheelR);
  const sill = pct(mid.filter(p => Math.abs(p[0]) > hwMax * 0.85).map(p => p[1]), 0.04);
  const sideGlass = glass.filter(p => p[2] < zF && p[2] > zR && Math.abs(p[3]) > 0.5);
  const belt = pct(sideGlass.map(p => p[1]), 0.02);
  const roofY = Math.max(...allPaint.filter(p => Math.abs(p[0]) < 0.3 && p[2] < zF && p[2] > zR).map(p => p[1]));
  const centreGlass = glass.filter(p => Math.abs(p[0]) < 0.3);
  // windscreen base: centre glass near belt height (lamp lenses sit lower and further forward)
  const screenBase = Math.max(...centreGlass.filter(p => p[1] < belt + 0.12 && p[1] > belt - 0.2 && p[2] > 0 && p[2] < zNose - 0.45).map(p => p[2]));
  const screenTop = Math.max(...centreGlass.filter(p => p[1] > roofY - 0.15).map(p => p[2]));
  const rearTop = Math.min(...centreGlass.filter(p => p[1] > roofY - 0.15).map(p => p[2]));
  const rearBase = Math.min(...centreGlass.filter(p => p[1] < belt + 0.15 && p[1] > belt - 0.2 && p[2] < 0).map(p => p[2]));
  const hoodY = Math.max(...allPaint.filter(p => Math.abs(p[0]) < 0.3 && p[2] > screenBase && p[2] < screenBase + 0.35).map(p => p[1]));
  // half-width of the lower body along z, for the livery mapping
  const NB = 48, hwBins = new Array(NB).fill(0);
  const bin = z => Math.max(0, Math.min(NB - 1, Math.floor((zNose - z) / (zNose - zTail) * NB)));
  for (const p of allPaint) if (p[1] < belt + 0.05) { const b = bin(p[2]); hwBins[b] = Math.max(hwBins[b], Math.abs(p[0])); }
  for (let i = 0; i < NB; i++) if (!hwBins[i]) hwBins[i] = hwBins[i - 1] || hwMax;

  // ---- livery UVs (TEXCOORD_1): u along the car nose->tail, v around the cross-section ----
  // Matches paintLivery: rows 0..256 of 512 run underside centre -> sill (64) -> mid door (128) -> shoulder (192) -> top centre
  // on the left (+x) side, mirrored for the right.
  const yc = (sill + belt) / 2, hh = (belt - sill) / 2;
  for (const mesh of R.listMeshes()) for (const prim of mesh.listPrimitives()) {
    if (prim.getMaterial().getName() !== "paint") continue;
    const n = prim.getAttribute("POSITION").getCount(), uv = new Float32Array(n * 2);
    eachVertex(prim, (v, _, i) => {
      const hw = hwBins[bin(v[2])] || hwMax;
      const nx = Math.abs(v[0]) / hw, ny = (v[1] - yc) / hh;
      const th = Math.atan2(nx, -ny) / Math.PI; // 0 underside .. 1 top
      const row = th * 256;
      uv[i * 2] = (zNose - v[2]) / (zNose - zTail);
      uv[i * 2 + 1] = (v[0] >= 0 ? row : 512 - row) / 512;
    });
    prim.setAttribute("TEXCOORD_1", doc.createAccessor().setType("VEC2").setArray(uv).setBuffer(R.listBuffers()[0]));
  }

  const r3 = x => Math.round(x * 1000) / 1000;
  const meta = {
    zF: r3(zF), zR: r3(zR), wheelR: r3(wheelR), wheelW: r3(wheelW), track: r3(track),
    nose: r3(zNose), tail: r3(zTail), hw: r3(hwMax), sill: r3(sill), belt: r3(belt), roofY: r3(roofY),
    screenBase: r3(screenBase), screenTop: r3(screenTop), rearTop: r3(rearTop), rearBase: r3(rearBase), hoodY: r3(hoodY), steerX: r3(steerX),
    wheels: Object.fromEntries(Object.keys(wheels).map((k, i) => [k, W[i].c.map(r3)])),
    ...(cfg.fixed ? { fixed: true } : {}), ...(cfg.meta || {})
  };
  scene.setExtras({ rl: meta });
  scene.listChildren().forEach((n, i) => n.setName("part" + i));

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
    quantize({ pattern: /^(NORMAL|TEXCOORD_\d+)$/ }),
    prune({ keepAttributes: true }), dedup({ keepUniqueNames: true })
  );
  const OUT = path.join(SR, packName(cfg.pack));
  fs.mkdirSync(OUT, { recursive: true });
  for (const p of fs.readdirSync(SR)) if (/^RallyLegendsCars\d*$/.test(p) && p !== packName(cfg.pack)) fs.rmSync(path.join(SR, p, name + ".glb"), { force: true });
  const out = path.join(OUT, name + ".glb");
  await io.write(out, doc);
  console.log(name, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + " MB", JSON.stringify(meta));
}

// kits.js, per-pack credits and metadata, and the pack URLs in the page
function writePacks() {
  const packs = [...new Set(Object.values(MODELS).map(m => m.pack))].sort((a, b) => a - b);
  for (const n of packs) {
    const dir = path.join(SR, packName(n)), names = Object.keys(MODELS).filter(k => MODELS[k].pack === n);
    const size = names.reduce((s, k) => s + (fs.existsSync(path.join(dir, k + ".glb")) ? fs.statSync(path.join(dir, k + ".glb")).size : 0), 0);
    if (size > 4.8 * 1024 * 1024) console.warn("!! " + packName(n) + " is " + (size / 1048576).toFixed(2) + " MB; move a model to another pack");
    fs.writeFileSync(path.join(dir, "CREDITS.txt"), "Rally Legends - modelled car bodies\n\nAdapted from models shared on Sketchfab under Creative Commons Attribution 4.0\n(https://creativecommons.org/licenses/by/4.0/).\n\n" +
      names.map(k => { const [t, a, u] = MODELS[k].credit; return `${k}.glb  "${t}" by ${a}\n  ${u}`; }).join("\n") +
      "\n\nChanges: converted to car space, wheels and brake callipers removed, lamp materials separated, livery UVs added,\ntextures resized and re-encoded as WebP" +
      names.filter(k => MODELS[k].note).map(k => "; " + k + " " + MODELS[k].note).join("") + ".\n");
    fs.writeFileSync(path.join(SR, packName(n) + ".resource-meta.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<StaticResource xmlns="http://soap.sforce.com/2006/04/metadata">
    <cacheControl>Private</cacheControl>
    <contentType>application/zip</contentType>
    <description>Rally Legends modelled car bodies, pack ${n} (GLB, CC BY 4.0, see CREDITS.txt), loaded by the RallyLegends Visualforce page.</description>
</StaticResource>
`);
    console.log(packName(n), (size / 1048576).toFixed(2) + " MB", names.join(", "));
  }
  fs.writeFileSync(path.join(SR, "RallyLegends/kits.js"), "// Generated by tools/build-cars.mjs: which static resource holds each modelled body.\nexport const KIT_PACKS = " +
    JSON.stringify(Object.fromEntries(Object.keys(MODELS).map(k => [k, packName(MODELS[k].pack)])), null, 1).replace(/\n/g, "") + ";\n");
  const page = path.join(root, "force-app/main/default/pages/RallyLegends.page");
  const src = fs.readFileSync(page, "utf8").replace(/window\.RL_(CARS|RES) = [^\n]*\n/g, "");
  const res = "window.RL_RES = { " + packs.map(n => `${packName(n)}: '{!URLFOR($Resource.${packName(n)})}'`).join(", ") + " };\n";
  fs.writeFileSync(page, src.replace("</script>\n<script type=\"module\"", res + "</script>\n<script type=\"module\""));
}

for (const n of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS)) await build(n);
writePacks();
