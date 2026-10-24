// Converts the CC-BY source models in models-src/ into game-ready GLBs in the RallyLegendsCars static resource.
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
const OUT = path.join(root, "force-app/main/default/staticresources/RallyLegendsCars");

// fwd: which source axis is the front of the car; scale, plus zs to stretch the length; drop: extra node names to remove.
const MODELS = {
  thunderbolt: { fwd: "+x", scale: 1, paint: ["thunderbolt96_body"] },
  // headlamp units are part of shared trim meshes here: split out the triangles inside the lamp box (|x|, y, z)
  toyama: { fwd: "+z", scale: 1, paint: ["Body_Paint"], brake: /Glass_Body_Glass_Red/, steer: 0.37,
    headBox: { mats: /^(Textures|Body_Chrome)$/, min: [0.3, 0.6, 1.75], max: [0.9, 0.9, 2.3] } },
  asti: { fwd: "+x", scale: 1, paint: ["APGRPA89_Bodymat"], spare: true }, // downloaded, not used by a car yet
  mv6: { fwd: "+x", scale: 1.1, zs: 1.08, paint: ["PlaceholderMV683_Bodymat"] }
};
const DROP = /WheelStock|WheelSport|(^|_)Wheel_(FL|FR|RL|RR)|Caliper|Shadow/i;
const WHEEL = /(WheelStock|WheelSport|(^|_)Wheel)_(FL|FR|RL|RR)/i;
const HEAD = /(Headlights|Rallylights_Headlights)_UCB_Lights_and_Glass_0$/;
const BRAKE = /Brakelights_UCB_Lights_and_Glass_0$/;

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
    const mat = prim.getMaterial(), isPaint = mat.getName() === "paint";
    const isGlass = mat.getAlphaMode() === "BLEND" && !/lamp|Numberplate|badge/i.test(mat.getName());
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
  const screenBase = Math.max(...centreGlass.filter(p => p[1] < belt + 0.12 && p[2] > 0).map(p => p[2]));
  const screenTop = Math.max(...centreGlass.filter(p => p[1] > roofY - 0.15).map(p => p[2]));
  const rearTop = Math.min(...centreGlass.filter(p => p[1] > roofY - 0.15).map(p => p[2]));
  const rearBase = Math.min(...centreGlass.filter(p => p[1] < belt + 0.15 && p[2] < 0).map(p => p[2]));
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
    wheels: Object.fromEntries(Object.keys(wheels).map((k, i) => [k, W[i].c.map(r3)]))
  };
  scene.setExtras({ rl: meta });
  scene.listChildren().forEach((n, i) => n.setName("part" + i));

  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 82 }),
    quantize({ pattern: /^(NORMAL|TEXCOORD_\d+)$/ }),
    prune({ keepAttributes: true }), dedup({ keepUniqueNames: true })
  );
  fs.mkdirSync(OUT, { recursive: true });
  const out = path.join(OUT, name + ".glb");
  await io.write(out, doc);
  console.log(name, (fs.statSync(out).size / 1024 / 1024).toFixed(2) + " MB", JSON.stringify(meta));
}

for (const n of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(MODELS).filter(k => !MODELS[k].spare)) await build(n);
