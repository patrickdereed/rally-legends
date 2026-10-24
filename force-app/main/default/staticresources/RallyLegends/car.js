// Procedural car models and liveries. Each car is lofted from the station profile in data.js: a lower
// body with wheel arches cut by raising the floor around each axle, a glass cabin with a painted roof,
// lamps, wings, flares, mud flaps and wheels. Liveries are painted on a canvas mapped around the body.
// Cars with a `mesh` in data.js use a modelled body instead (a "kit": CC-BY models converted by tools/build-cars.mjs
// into the RallyLegendsCars resource); wheels, liveries, decals, crew and lamps still come from here.
import * as THREE from "./three.module.min.js";
import { GLTFLoader } from "./GLTFLoader.js";
import { LIVERY_BY_ID, RIM_BY_ID, SPONSORS } from "./data.js";
import { makeRng, hashStr, clamp, lerp, smoothstep } from "./util.js";

const TEX_W = 1024, TEX_H = 512;

// ---------- model kits ----------
const KITS = {};
// Loads the kits once; a kit that fails to load leaves its car on the lofted body.
export function loadCarKits(base, names) {
  const loader = new GLTFLoader(), dir = String(base || "").replace(/\/$/, "");
  return Promise.all(names.map(n => KITS[n] ? null : loader.loadAsync(dir + "/" + n + ".glb").then(g => {
    g.scene.traverse(o => { if (o.isMesh) o.userData.shared = true; });
    KITS[n] = { scene: g.scene, meta: g.scene.userData.rl, decals: new Map() };
  }).catch(e => console.warn("Rally Legends: car model " + n + " didn't load; using the built-in body.", e))));
}
export function kitFor(car) { return car.mesh ? KITS[car.mesh] || null : null; }

// ---------- livery painting ----------
// Canvas layout: x = along the car (0 nose .. 1 tail); rows 0..256 = left half of the cross-section
// (0 = underside centre, ~64 sill, 128 mid-door, ~192 shoulder, 256 top centre); rows 256..512 mirror it.
export function paintLivery(livery, car, kit = null) {
  const cv = document.createElement("canvas");
  cv.width = TEX_W; cv.height = TEX_H;
  const ctx = cv.getContext("2d");
  const design = LIVERY_BY_ID[livery.design] || LIVERY_BY_ID.solid;
  const [c0, c1, c2] = livery.colors;
  const W = TEX_W, r = makeRng(hashStr(livery.design + livery.colors.join("") + car.id));
  ctx.fillStyle = c0; ctx.fillRect(0, 0, W, 256);
  const band = (y0, y1, col, x0 = 0, x1 = W) => { ctx.fillStyle = col; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); };
  const poly = (pts, col) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill(); };
  const star = (x, y, rad, col) => {
    ctx.fillStyle = col; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? rad * 0.45 : rad; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  };
  switch (design.id) {
    case "roof": band(183, 188, c2); break;
    case "stripes": band(214, 246, c1); band(212, 215, c2); band(245, 248, c2); break;
    case "tristripe": {
      const sweep = x => x > 0.68 * W ? (x - 0.68 * W) * 0.28 : 0;
      [[118, 132, c1], [134, 146, c2], [148, 160, c1]].forEach(([a, b, col]) => {
        const pts = [];
        for (let x = 0.04 * W; x <= 0.97 * W; x += 8) pts.push([x, a + sweep(x)]);
        for (let x = 0.97 * W; x >= 0.04 * W; x -= 8) pts.push([x, b + sweep(x)]);
        poly(pts, col);
      });
      band(214, 246, c1, 0, 0.3 * W);
      break;
    }
    case "chevron":
      poly([[0, 70], [0.55 * W, 70], [W, 200], [W, 256], [0.82 * W, 256], [0.45 * W, 112], [0, 112]], c1);
      poly([[0, 116], [0.43 * W, 116], [0.8 * W, 256], [0.74 * W, 256], [0.4 * W, 128], [0, 128]], c2);
      break;
    case "split": band(0, 118, c1); band(118, 126, c2); break;
    case "diagonal":
      poly([[0, 0], [0, 70], [W, 210], [W, 0]], c1);
      poly([[0, 70], [W, 210], [W, 222], [0, 82]], c2);
      break;
    case "slashes":
      [[0.34, c1], [0.44, c2], [0.54, c1]].forEach(([u, col]) => poly([[u * W, 40], [(u + 0.07) * W, 40], [(u + 0.13) * W, 200], [(u + 0.06) * W, 200]], col));
      break;
    case "checker": {
      const sq = 22;
      for (let y = 96; y < 160; y += sq) for (let x = 0; x < W; x += sq) if (((x / sq) + (y / sq)) % 2 < 1) band(y, y + sq, c1, x, x + sq);
      band(92, 96, c2); band(160, 164, c2);
      for (let y = 212; y < 256; y += sq) for (let x = 0; x < 0.28 * W; x += sq) if (((x / sq) + (y / sq)) % 2 < 1) band(y, y + sq, c1, x, x + sq);
      break;
    }
    case "fade": {
      const g = ctx.createLinearGradient(0.2 * W, 0, 0.85 * W, 0);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 256);
      ctx.fillStyle = c2;
      for (let x = 0.35 * W; x < 0.7 * W; x += 16) for (let y = 40; y < 250; y += 16) {
        const k = (x - 0.35 * W) / (0.35 * W), rad = 5.5 * Math.sin(k * Math.PI);
        if (rad > 0.6) { ctx.beginPath(); ctx.arc(x + (y % 32 ? 8 : 0), y, rad, 0, Math.PI * 2); ctx.fill(); }
      }
      break;
    }
    case "shards":
      for (let i = 0; i < 26; i++) {
        const front = r() < 0.5, x = front ? r() * 0.32 * W : W - r() * 0.38 * W, y = r() * 256;
        const s = r.range(30, 110), col = r() < 0.6 ? c1 : c2;
        poly([[x, y], [x + s * (front ? 1.4 : -1.4), y + s * 0.3], [x + s * (front ? 0.3 : -0.3), y - s * 0.6]], col);
      }
      band(150, 158, c2, 0.3 * W, 0.65 * W);
      break;
    case "stars":
      for (let i = 0; i < 34; i++) star(r() * W, r.range(40, 250), r.range(7, 26), c1);
      band(226, 236, c2);
      break;
    case "camo":
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = r() < 0.5 ? c1 : c2; ctx.beginPath();
        ctx.ellipse(r() * W, r() * 256, r.range(20, 70), r.range(12, 34), r() * Math.PI, 0, Math.PI * 2); ctx.fill();
      }
      break;
    case "lightning": {
      const pts = [[0.05 * W, 130], [0.3 * W, 112], [0.27 * W, 140], [0.58 * W, 106], [0.55 * W, 138], [0.95 * W, 92], [0.6 * W, 160], [0.63 * W, 128], [0.32 * W, 168], [0.35 * W, 142]];
      ctx.lineWidth = 8; ctx.strokeStyle = c2; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.stroke();
      poly(pts, c1);
      break;
    }
    case "sunset": {
      const cols = [c1, mixHex(c1, c2, 0.33), mixHex(c1, c2, 0.66), c2];
      cols.forEach((col, i) => {
        const a = 100 + i * 16, sweep = x => x > 0.55 * W ? (x - 0.55 * W) * 0.35 : 0, pts = [];
        for (let x = 0; x <= W; x += 8) pts.push([x, a + sweep(x)]);
        for (let x = W; x >= 0; x -= 8) pts.push([x, a + 12 + sweep(x)]);
        poly(pts, col);
      });
      break;
    }
    case "carbon":
      for (let y = 0; y < 256; y += 8) for (let x = 0; x < W; x += 8) { ctx.fillStyle = ((x + y) / 8) % 2 ? "#232326" : "#18181a"; ctx.fillRect(x, y, 8, 8); }
      band(138, 146, c1); band(214, 246, c1, 0, 0.25 * W);
      break;
    case "heritage":
      band(192, 256, c1, 0, 0.3 * W); band(186, 190, c2); band(70, 74, c2);
      break;
    default: break;
  }
  // Underside, the floor seen through the glass, panel gaps, door handle and fuel filler (a kit has its own),
  // or on a kit the contrast roof: the roof is part of the shell there, so paint the top rows between the screens.
  if (kit) {
    const m = kit.meta, u = z => (m.nose - z) / (m.nose - m.tail);
    if (design.roof) band(232, 256, livery.colors[design.roof], u(m.screenTop) * W, u(m.rearTop) * W);
  } else {
    const C = car.body.cab, tF = car.body.axF / car.body.L, mid = lerp(C.r0, C.r1, C.bPos || 0.46);
    ctx.fillStyle = "#141516"; ctx.fillRect(0, 0, W, 34);
    ctx.fillStyle = "#1c1d20"; ctx.fillRect((C.t0 + 0.01) * W, 204, (C.t1 - C.t0 - 0.02) * W, 52);
    const gap = (x0, y0, x1, y1) => {
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 1.5, y0 + 1); ctx.lineTo(x1 + 1.5, y1 + 1); ctx.stroke();
    };
    const dF = (C.t0 + 0.035) * W, dR = (mid + 0.02) * W;
    gap(dF, 54, dF + 6, 198); gap(dF, 54, dR - 18, 54);
    // rear edge: straight down from the belt, then curving forward into the sill
    ctx.lineCap = "round";
    for (const [col, lw, off] of [["rgba(0,0,0,0.55)", 2.2, 0], ["rgba(255,255,255,0.16)", 1, 1.5]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      ctx.moveTo(dR - 4 + off, 198); ctx.lineTo(dR + off, 96); ctx.quadraticCurveTo(dR + off, 56, dR - 18 + off, 54); ctx.stroke();
    }
    const fs = (tF + 0.12) * W; if (fs < dF - 20) gap(fs, 70, fs, 196);
    const hood = (C.t0 - 0.015) * W; gap(hood, 198, hood, 256); gap(6, 198, hood, 198);
    if (C.t1 < 0.95) { const boot = (C.t1 + 0.02) * W; gap(boot, 198, boot, 256); gap(boot, 198, W - 6, 198); }
    ctx.fillStyle = "rgba(10,10,12,0.75)"; ctx.fillRect(dR - 0.035 * W, 174, 24, 6);
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc((C.t1 * 0.5 + 0.5) * W, 168, 9, 0, Math.PI * 2); ctx.stroke();
  }
  // mirror the left half onto the right half
  ctx.save(); ctx.translate(0, TEX_H); ctx.scale(1, -1); ctx.drawImage(cv, 0, 0, W, 256, 0, 0, W, 256); ctx.restore();

  // Numbers, sponsors and stickers are separate decal meshes (CarModel.buildDecals), not painted here:
  // this texture stretches unevenly around the body and would distort them.
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  // Roof panel: its own small canvas (u along the car, v across).
  const rc = document.createElement("canvas"); rc.width = 256; rc.height = 128;
  const rx = rc.getContext("2d");
  rx.fillStyle = livery.colors[design.roof || 0]; rx.fillRect(0, 0, 256, 128);
  if (design.id === "stripes" || design.id === "tristripe" || design.id === "carbon") {
    rx.fillStyle = c1; rx.fillRect(0, 64 - 42, 256, 30); rx.fillRect(0, 64 + 12, 256, 30);
  }
  if (design.id === "checker") for (let y = 0; y < 128; y += 16) for (let x = 0; x < 256; x += 16) if (((x + y) / 16) % 2 < 1) { rx.fillStyle = c1; rx.fillRect(x, y, 16, 16); }
  rx.save(); rx.translate(128, 64); rx.rotate(Math.PI / 2); rx.scale(1, -1);
  rx.fillStyle = "#f7f7f2"; rx.fillRect(-34, -26, 68, 52);
  rx.fillStyle = "#111"; rx.font = "bold 40px Arial, sans-serif"; rx.textAlign = "center"; rx.textBaseline = "middle";
  rx.fillText(String(livery.number), 0, 2); rx.restore();
  const roofTex = new THREE.CanvasTexture(rc);
  roofTex.flipY = false; roofTex.colorSpace = THREE.SRGBColorSpace;
  return { tex, roofTex, canvas: cv };
}

function isDark(hex) { const c = new THREE.Color(hex); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.35; }
export function mixHex(a, b, t) { return "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString(); }

// ---------- dirt shader injection (shared by all paint-like materials) ----------
const DIRT_GLSL = `
uniform float uDirt; uniform vec3 uDirtCol; varying vec3 vLocalPos;
float rlHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rlNoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rlHash(i), rlHash(i + vec3(1,0,0)), f.x), mix(rlHash(i + vec3(0,1,0)), rlHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rlHash(i + vec3(0,0,1)), rlHash(i + vec3(1,0,1)), f.x), mix(rlHash(i + vec3(0,1,1)), rlHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// ao (lofted bodies only; kits carry baked occlusion): { zF, zR, r, low } darkens around the wheel arches and
// towards the bottom of the body, the way the modelled cars' baked occlusion grounds them.
export function addDirt(mat, uniforms, strength = 1, ao = null) {
  const f = v => v.toFixed(3);
  const aoGlsl = ao ? `
        { float aoA = 1.0, top = smoothstep(${f(ao.r * 2 + 0.02)}, ${f(ao.r * 2 + 0.16)}, vLocalPos.y);
          aoA *= mix(mix(0.55, 1.0, smoothstep(${f(ao.r + 0.03)}, ${f(ao.r + 0.24)}, length(vec2(vLocalPos.y - ${f(ao.r)}, vLocalPos.z - ${f(ao.zF)})))), 1.0, top);
          aoA *= mix(mix(0.55, 1.0, smoothstep(${f(ao.r + 0.03)}, ${f(ao.r + 0.24)}, length(vec2(vLocalPos.y - ${f(ao.r)}, vLocalPos.z - ${f(ao.zR)})))), 1.0, top);
          aoA *= mix(0.68, 1.0, smoothstep(${f(ao.low)}, ${f(ao.low + 0.3)}, vLocalPos.y));
          diffuseColor.rgb *= aoA; }` : "";
  mat.onBeforeCompile = shader => {
    shader.uniforms.uDirt = uniforms.uDirt;
    shader.uniforms.uDirtCol = uniforms.uDirtCol;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocalPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocalPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\n" + DIRT_GLSL)
      .replace("#include <map_fragment>", `#include <map_fragment>
        float dirtAmt = 0.0;
        { float h = clamp((vLocalPos.y - 0.1) / 1.0, 0.0, 1.0);
          float n = rlNoise(vLocalPos * 7.0) * 0.6 + rlNoise(vLocalPos * 23.0) * 0.4;
          dirtAmt = clamp(uDirt * ${strength.toFixed(2)} * (1.5 - h * 1.6) + (n - 0.5) * 0.9 * uDirt, 0.0, 1.0);
          diffuseColor.rgb = mix(diffuseColor.rgb, uDirtCol * (0.75 + 0.5 * n), dirtAmt * 0.94); }${aoGlsl}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.95, dirtAmt);")
      .replace("material.clearcoat = clearcoat;", "material.clearcoat = clearcoat * (1.0 - dirtAmt);");
  };
  mat.customProgramCacheKey = () => "rl-dirt-" + strength + (ao ? ":" + [ao.zF, ao.zR, ao.r, ao.low].map(f).join(",") : "");
}

// ---------- geometry helpers ----------
// Refined lower-body profile, built once per car from the stations in data.js:
// - belt line raised so the side glass is a realistic height for the roof (about 0.4 m, less on low cars)
// - bonnet as a straight rake from the nose up to the base of the screen, boot as a short rake down
export function profileOf(B) {
  if (B._low) return B._low;
  const C = B.cab, raw = B.low, N = 96;
  const yAt = t => sampleProfile(raw, t)[2];
  const glassH = C.roofY < 1.2 ? 0.33 : 0.41;
  const lift = Math.max(0, (C.roofY - glassH) - yAt((C.r0 + C.r1) / 2));
  const liftAt = t => lift * smoothstep(0.04, C.t0, t) * (1 - smoothstep(Math.min(0.97, C.t1 + 0.02), 1.0, t));
  const cowl = yAt(C.t0) + liftAt(C.t0), nose = raw[0][3] + lift * 0.35 + 0.04;
  const tail = raw[raw.length - 1][3] + lift * 0.5, deck = yAt(C.t1) + liftAt(C.t1);
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let [hw, yb, yt] = sampleProfile(raw, t);
    yt += liftAt(t);
    if (t < C.t0) { const u = t / C.t0; yt = lerp(nose, cowl, Math.pow(u, 0.75)); }
    else if (t > C.t1 && C.t1 < 0.97) { const u = (t - C.t1) / (1 - C.t1); yt = lerp(deck, tail, u * u); }
    out.push([t, hw, yb, Math.max(yt, yb + 0.12)]);
  }
  B._low = out;
  return out;
}
function sampleProfile(low, t) {
  if (t <= low[0][0]) return low[0].slice(1);
  for (let i = 0; i < low.length - 1; i++) {
    const a = low[i], b = low[i + 1];
    if (t <= b[0]) {
      // ease between the few hand-placed stations; plain linear between dense refined ones (easing there terraces)
      const u = (t - a[0]) / (b[0] - a[0]), f = low.length > 16 ? u : (1 - Math.cos(Math.PI * u)) / 2;
      return [lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)];
    }
  }
  return low[low.length - 1].slice(1);
}

// Lower-body cross-section, half ring from the underside centre up to the top centre:
// [x as a fraction of half-width, y as a fraction of height]. Rolled sill, slightly bowed door,
// a shoulder crease, then a crowned deck.
const BODY_PROF = [[0, 0], [0.82, 0], [0.95, 0.04], [0.99, 0.2], [1.0, 0.5], [0.995, 0.74], [0.985, 0.86], [0.965, 0.93], [0.91, 0.975], [0.72, 0.995], [0.36, 1.002], [0, 1.004]];
// Same section with the bonnet sunk between raised front wings (classic cars most, modern cars a little).
const BONNET_PROF = [[0, 0], [0.82, 0], [0.95, 0.04], [0.99, 0.2], [1.0, 0.5], [0.995, 0.74], [0.985, 0.87], [0.965, 0.95], [0.91, 0.99], [0.72, 0.975], [0.36, 0.955], [0, 0.95]];
const WING_RISE = { H: 1, G4: 0.85, GB: 0.5, WRC: 0.45, R1: 0.35 };
// Boxy section: near-vertical flat sides, tight shoulder radius, flat deck (same x stations as BODY_PROF).
const BOXY_PROF = [[0, 0], [0.82, 0], [0.95, 0.015], [0.99, 0.08], [1.0, 0.5], [0.998, 0.8], [0.99, 0.9], [0.975, 0.965], [0.91, 0.995], [0.72, 1.0], [0.36, 1.002], [0, 1.003]];
const BOXY_BONNET = [[0, 0], [0.82, 0], [0.95, 0.015], [0.99, 0.08], [1.0, 0.5], [0.998, 0.8], [0.99, 0.92], [0.975, 0.98], [0.91, 1.0], [0.72, 0.985], [0.36, 0.97], [0, 0.968]];

// Body ends are rounded with this radius; stations map onto the length inside the round-overs.
// Boxy cars (Mini, Escort, Quattro, 205, Evo, Impreza) have crisp corners; the Alpine, Stratos and modern cars are curvier.
const BOXY = { mosquito: 1, pennine: 1, vierring: 1, lionne: 0.8, ronin: 0.9, pleiad: 0.6 };
export function boxiness(car) { return BOXY[car.id] || 0; }
export function endR(B) { return B._endR != null ? B._endR : 0.11; }
export function zOf(t, L, er = 0.11) { return (L / 2 - er) - t * (L - 2 * er); }

// n + 1 points along a uniform Catmull-Rom spline through pts.
function catmull(pts, n) {
  const out = [], segs = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const s = i / n * segs, k = Math.min(segs - 1, Math.floor(s)), u = s - k;
    const p0 = pts[Math.max(0, k - 1)], p1 = pts[k], p2 = pts[k + 1], p3 = pts[Math.min(segs, k + 2)];
    const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

function buildBodyGeometry(car) {
  const B = car.body, L = B.L, hwMax = B.W / 2;
  const zF = L / 2 - B.axF, zR = zF - car.wheelbase;
  const archR = B.wheelR + 0.055;
  const ST = 120, M = 48;
  const bx = boxiness(car), mixP = (a, b) => a.map((p, i) => [lerp(p[0], b[i][0], bx), lerp(p[1], b[i][1], bx)]);
  const half = catmull(mixP(BODY_PROF, BOXY_PROF), M / 2), halfB = catmull(mixP(BONNET_PROF, BOXY_BONNET), M / 2);
  const ER = B._endR = lerp(0.11, 0.045, bx);
  const rise = B.wingRise != null ? B.wingRise : WING_RISE[car.cls] == null ? 0.5 : WING_RISE[car.cls];
  const pos = [], uv = [], idx = [];
  const rings = [];
  for (let j = 0; j < ST; j++) {
    const t = j / (ST - 1), z = zOf(t, L, ER);
    let [hwF, yb, yt] = sampleProfile(profileOf(B), t);
    // raise the floor over each axle to cut the wheel arches
    for (const za of [zF, zR]) {
      const dz = Math.abs(z - za);
      if (dz < archR) yb = Math.max(yb, B.wheelR + Math.sqrt(archR * archR - dz * dz) * 0.98);
    }
    yb = Math.min(yb, yt - 0.06);
    // how much of the bonnet section to use: full over the bonnet, fading out at the nose and the screen
    const bon = rise * smoothstep(0.0, 0.08, t) * (1 - smoothstep(B.cab.t0 - 0.06, B.cab.t0 + 0.01, t));
    rings.push({ z, hw: hwF * hwMax, yb, yt, t, bon });
  }
  // Round over the nose and tail: extra rings that step out to the end face and pull in at the edges.
  const round = (R, dir) => {
    const out = [];
    for (let k = 1; k <= 4; k++) {
      const th = k / 4 * Math.PI / 2, c = 1 - Math.cos(th), r = Math.min(ER, (R.yt - R.yb) * 0.4);
      out.push({ z: R.z + dir * ER * Math.sin(th), hw: R.hw - r * c * 1.1, yb: R.yb + r * c * 0.6, yt: R.yt - r * c * 0.8, t: R.t, bon: R.bon });
    }
    return out;
  };
  const front = round(rings[0], 1).reverse(), rear = round(rings[rings.length - 1], -1);
  rings.unshift(...front); rings.push(...rear);
  const RN = rings.length;
  // Wheel arches rolled out of the panels: the side swells over each wheel (between sill and shoulder),
  // more on wide-body cars. Replaces bolt-on flares.
  const flareW = [0.016, 0.04, 0.07][B.flares || 0];
  const swell = z => {
    let m = 0;
    for (const za of [zF, zR]) { const dz = Math.abs(z - za), span = archR * 1.7; if (dz < span) m = Math.max(m, 0.5 + 0.5 * Math.cos(Math.PI * dz / span)); }
    return m;
  };
  for (const R of rings) {
    for (let k = 0; k <= M; k++) {
      const left = k <= M / 2, q = left ? k : M - k, bn = R.bon || 0;
      const fx = lerp(half[q][0], halfB[q][0], bn), fy = lerp(half[q][1], halfB[q][1], bn);
      const roll = flareW * swell(R.z) * smoothstep(0.02, 0.18, fy) * (1 - smoothstep(0.7, 0.93, fy));
      pos.push((left ? 1 : -1) * (fx * R.hw + roll), R.yb + fy * (R.yt - R.yb), R.z);
      uv.push(R.t, k / M);
    }
  }
  for (let j = 0; j < RN - 1; j++) for (let k = 0; k < M; k++) {
    const a = j * (M + 1) + k, b = a + 1, c = a + M + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // Nose and tail caps. The ring runs counter-clockwise seen from the front, so the front fan is (centre, k, k+1).
  // They render in plain body colour (group 1): the livery can't map cleanly onto a fan.
  const bodyCount = idx.length;
  for (const [j, front] of [[0, true], [RN - 1, false]]) {
    const R = rings[j], ci = pos.length / 3;
    pos.push(0, (R.yb + R.yt) / 2, R.z); uv.push(R.t, 0.25);
    for (let k = 0; k < M; k++) {
      const a = j * (M + 1) + k, b = a + 1;
      if (front) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.addGroup(0, bodyCount, 0);
  g.addGroup(bodyCount, idx.length - bodyCount, 1);
  g.computeVertexNormals();
  return { geo: g, rings, zF, zR, swell, flareW };
}

// Cabin stations along the car and what each band between them is.
function cabinStations(C) {
  const span = C.r1 - C.r0, mid = lerp(C.r0, C.r1, C.bPos || 0.46);
  const dA = Math.min(C.aPil || 0.028, span * 0.08), dB = Math.min(C.bPil || 0.014, span * 0.04), dC = Math.min(C.cPil || 0.045, span * 0.22);
  return {
    mid,
    st: [[C.t0, 0], [C.r0, 1], [C.r0 + dA, 1], [mid - dB, 1], [mid + dB, 1], [C.r1 - dC, 1], [C.r1, 1], [C.t1, 0]],
    band: ["screen", "pillar", "window", "pillar", "window", "pillar", "screen"]
  };
}
const CAB_PROF = [[1, 0], [0.995, 0.07], [0.97, 0.45], [0.935, 0.82], [0.9, 0.93], [0.8, 0.985], [0.6, 1.01], [0.3, 1.025], [0, 1.03]];
const ROOF_FROM = 4; // first cross-section point of the roof panel

// Cross-section of the cabin at station t as 3D points, left belt -> over the roof -> right belt.
function cabinRing(car, t, full) {
  const B = car.body, C = B.cab, hwMax = B.W / 2;
  const [hwF, , yt] = sampleProfile(profileOf(B), t);
  const belt = yt - 0.02, hwB = hwF * hwMax * C.hwBot, hwT = hwF * hwMax * C.hwTop;
  const top = full ? C.roofY - (C.roofDrop || 0) * clamp((t - C.r0) / (C.r1 - C.r0), 0, 1) : belt + 0.005;
  const pts = CAB_PROF.map(([fx, fy]) => [lerp(hwB, hwT, fy) * fx, belt + (top - belt) * fy]);
  const z = zOf(t, B.L, endR(B));
  return pts.concat(pts.slice(0, -1).reverse().map(([x, y]) => [-x, y])).map(([x, y]) => new THREE.Vector3(x, y, z));
}

// Outlines of every window opening (for chrome or rubber surrounds) and the two roof drip rails.
function windowOutlines(car) {
  const C = car.body.cab, { st } = cabinStations(C), per = CAB_PROF.length * 2 - 1;
  const R = st.map(([t, full]) => cabinRing(car, t, full));
  const loops = [];
  // side windows: between stations 2-3 and 4-5, glass from point 1 up to the roof seal
  for (const sd of [1, -1]) for (const [a, b] of [[2, 3], [4, 5]]) {
    const ks = sd > 0 ? [1, ROOF_FROM - 1] : [per - 2, per - ROOF_FROM];
    loops.push([R[a][ks[0]], R[b][ks[0]], R[b][ks[1]], R[a][ks[1]]]);
  }
  // windscreen and rear screen: the full roof ring plus the belt line
  loops.push(R[1].slice(0, per).concat([R[0][per - 1], R[0][0]]));
  loops.push(R[6].slice(0, per).concat([R[7][per - 1], R[7][0]]));
  const rails = [1, -1].map(sd => [1, 3, 4, 6].map(i => R[i][sd > 0 ? ROOF_FROM : per - 1 - ROOF_FROM].clone().add(new THREE.Vector3(sd * 0.008, 0.004, 0))));
  // sliding-window divider: middle of the front side window
  const slide = [1, -1].map(sd => { const k = sd > 0 ? [1, ROOF_FROM - 1] : [per - 2, per - ROOF_FROM]; return [R[2][k[0]].clone().lerp(R[3][k[0]], 0.5), R[2][k[1]].clone().lerp(R[3][k[1]], 0.5)]; });
  return { loops, rails, slide };
}

// Sun-strip: the top band of the windscreen, from 82% of the way up the screen to the roof edge.
function buildSunstrip(car) {
  const B = car.body, C = B.cab, L = B.L, hwMax = B.W / 2;
  const er = endR(B);
  const edge = (t, full, frac) => {
    const [hwF, , yt] = sampleProfile(profileOf(B), t);
    const belt = yt - 0.02, hwB = hwF * hwMax * C.hwBot, hwT = hwF * hwMax * C.hwTop, top = full ? C.roofY : belt + 0.005;
    return CAB_PROF.map(([fx, fy]) => [lerp(hwB, hwT, fy) * fx, belt + (top - belt) * fy]);
  };
  const lo = edge(C.t0, false), hi = edge(C.r0, true), zLo = zOf(C.t0, L, er), zHi = zOf(C.r0, L, er);
  const f = 0.8, pos = [], uv = [], idx = [];
  const side = hi.concat(hi.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  const sideLo = lo.concat(lo.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  const n = side.length;
  for (let k = 0; k < n; k++) {
    const a = sideLo[k], b = side[k];
    const p0 = [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(zLo, zHi, f)], p1 = [b[0], b[1], zHi];
    pos.push(...p0, ...p1);
    uv.push(1 - k / (n - 1), 0, 1 - k / (n - 1), 1); // reads left-to-right, upright, from the front
    if (k) { const i = (k - 1) * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // nudge outwards slightly so it sits on the glass
  g.translate(0, 0.003, 0.004);
  return g;
}

// Cabin shell: group 0 = glass, group 1 = painted frame (pillars, roof, window surrounds).
function buildCabinGeometry(car) {
  const B = car.body, C = B.cab, L = B.L, hwMax = B.W / 2;
  const { st, band } = cabinStations(C);
  const pos = [], uv = [], glass = [], paint = [], trim = [], pillar = [];
  const blackB = car.cls !== "H" && car.cls !== "G4";
  const ring = (t, full) => {
    const [hwF, , yt] = sampleProfile(profileOf(B), t);
    const belt = yt - 0.02, hwB = hwF * hwMax * C.hwBot, hwT = hwF * hwMax * C.hwTop;
    const top = full ? C.roofY - (C.roofDrop || 0) * clamp((t - C.r0) / (C.r1 - C.r0), 0, 1) : belt + 0.005;
    const pts = CAB_PROF.map(([fx, fy]) => [lerp(hwB, hwT, fy) * fx, belt + (top - belt) * fy]);
    return pts.concat(pts.slice(0, -1).reverse().map(([x, y]) => [-x, y]));
  };
  const rows = st.map(([t, full]) => ({ t, z: zOf(t, L, endR(B)), pts: ring(t, full) }));
  const per = rows[0].pts.length, roofFrom = 4, roofTo = per - 1 - 4;
  rows.forEach(rw => rw.pts.forEach(([x, y], k) => { pos.push(x, y, rw.z); uv.push(clamp((rw.t - C.r0) / (C.r1 - C.r0), 0, 1), k / (per - 1)); }));
  for (let j = 0; j < rows.length - 1; j++) for (let k = 0; k < per - 1; k++) {
    const a = j * per + k, b = a + 1, c = a + per, d = c + 1;
    const roofCol = k >= roofFrom && k < roofTo, frameCol = k === 0 || k === per - 2, sealCol = k === roofFrom - 1 || k === roofTo;
    let dst = glass;
    // pillars are body colour (group 3) below the roof edge; black on "floating roof" cars and later B-pillars
    if (band[j] === "pillar") dst = roofCol ? paint : (B.blackPillars || (j === 3 && blackB)) ? trim : pillar;
    else if (band[j] === "window") dst = roofCol ? paint : frameCol || sealCol ? trim : glass;
    else if (band[j] === "screen" && (roofCol && (j === 0 ? false : false))) dst = paint;
    dst.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(glass.concat(paint, trim, pillar));
  g.addGroup(0, glass.length, 0);
  g.addGroup(glass.length, paint.length, 1);
  g.addGroup(glass.length + paint.length, trim.length, 2);
  g.addGroup(glass.length + paint.length + trim.length, pillar.length, 3);
  g.computeVertexNormals();
  return g;
}

const RIM_RATIO = { H: 0.6, G4: 0.63, GB: 0.66, WRC: 0.68, R1: 0.72 };
function tireGeometry(R, W, ratio = 0.64) {
  const pts = [], ri = R * (ratio + 0.02), hw = W / 2, rr = Math.min(W * 0.28, R * 0.18);
  pts.push(new THREE.Vector2(ri, -hw * 0.92));
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(R - rr + Math.cos(a) * rr, -hw + rr + Math.sin(a) * rr)); }
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(R - rr + Math.cos(a) * rr, hw - rr + Math.sin(a) * rr)); }
  pts.push(new THREE.Vector2(ri, hw * 0.92));
  const g = new THREE.LatheGeometry(pts, 40);
  g.rotateZ(Math.PI / 2); // lathe axis Y -> X
  return g;
}

// ---------- small canvas textures (cached) ----------
const texCache = {};
function canvasTexture(key, w, h, draw, srgb = true) {
  if (texCache[key]) return texCache[key];
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  draw(cv.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache[key] = t;
  return t;
}
// Tyre looks by upgrade level (Stock -> Legend): tread pattern, sidewall lettering, a coloured
// sidewall ring on the top compounds, deeper bump and a slightly wider section.
export const TYRE_LOOK = [
  { name: "SUMMIT  TOURING", tread: "road", letter: "#38383a", ring: null, bump: 1.0, width: 1.0 },
  { name: "SUMMIT  STREET", tread: "sport", letter: "#444447", ring: null, bump: 1.5, width: 1.025 },
  { name: "SUMMIT  SPORT  GRAVEL", tread: "gravel", letter: "#56565a", ring: null, bump: 2.2, width: 1.05 },
  { name: "SUMMIT  RALLY  GRAVEL", tread: "block", letter: "#77777c", ring: null, bump: 2.8, width: 1.075 },
  { name: "SUMMIT  PRO", tread: "block", letter: "#e2e2e2", ring: null, bump: 3.3, width: 1.1 },
  { name: "SUMMIT  WORKS", tread: "knobby", letter: "#f4f4f4", ring: "#e8e8e8", bump: 3.8, width: 1.125 },
  { name: "SUMMIT  LEGEND", tread: "knobby", letter: "#e3b23c", ring: "#e3b23c", bump: 4.4, width: 1.15 },
];
// u = around the tyre, v = across the profile (sidewall at the top and bottom, tread in the middle).
function tireTexture(level = 3) {
  const look = TYRE_LOOK[Math.max(0, Math.min(TYRE_LOOK.length - 1, level))];
  return canvasTexture("tire" + level, 1024, 128, (x, w, h) => {
    x.fillStyle = "#1b1b1c"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#0a0a0b";
    const t = look.tread;
    if (t === "road" || t === "sport") {
      for (const y of [48, 63, 78]) x.fillRect(0, y, w, 3); // circumferential grooves
      const n = t === "road" ? 96 : 72;
      for (let i = 0; i < n; i++) {
        const bx = i * w / n;
        if (t === "road") { x.fillRect(bx, 40, 1.5, 8); x.fillRect(bx + 4, 81, 1.5, 8); }
        else { x.save(); x.translate(bx, 64); x.rotate(0.5); x.fillRect(-1, -24, 3, 48); x.restore(); }
      }
    } else {
      const blocks = t === "gravel" ? 48 : t === "block" ? 40 : 32;
      const rows = t === "knobby" ? [[36, 54, 0], [58, 70, 0.5], [74, 92, 0]] : t === "block" ? [[38, 56, 0], [58, 70, 0.5], [72, 90, 0]] : [[40, 56, 0], [58, 70, 0.5], [72, 88, 0]];
      const frac = t === "knobby" ? 0.52 : t === "block" ? 0.48 : 0.42;
      x.fillStyle = "#0a0a0b"; x.fillRect(0, rows[0][0], w, rows[2][1] - rows[0][0]);
      x.fillStyle = "#1d1d1f";
      for (let i = 0; i < blocks; i++) {
        const bx = i * w / blocks;
        for (const [y0, y1, off] of rows) x.fillRect(bx + off * w / blocks + 2, y0, w / blocks * frac, y1 - y0);
      }
    }
    if (look.ring) { x.fillStyle = look.ring; x.fillRect(0, 27, w, 3); x.fillRect(0, 98, w, 3); }
    x.fillStyle = look.letter; x.font = "bold 13px Arial, sans-serif"; x.textBaseline = "middle";
    for (let i = 0; i < 4; i++) { x.fillText(look.name, i * w / 4 + 20, 16); x.fillText(look.name, i * w / 4 + 120, 112); }
  });
}
// Brake looks by upgrade level (Stock -> Legend): bigger discs, then slotted and drilled faces,
// and larger, brighter callipers.
export const BRAKE_LOOK = [
  { name: "Stock", face: "plain", disc: 1.0, cal: 1.0, color: null },
  { name: "Street", face: "plain", disc: 1.03, cal: 1.06, color: "#2a2a2c" },
  { name: "Sport", face: "vented", disc: 1.06, cal: 1.12, color: "#c8141c" },
  { name: "Rally", face: "slotted", disc: 1.09, cal: 1.2, color: "#c8141c" },
  { name: "Pro", face: "drilled", disc: 1.12, cal: 1.28, color: "#e0b11c" },
  { name: "Works", face: "drilled", disc: 1.14, cal: 1.36, color: "#ff6a00" },
  { name: "Legend", face: "drilled", disc: 1.16, cal: 1.44, color: "#d9a93a", legend: true },
];
function discTexture(face) {
  return canvasTexture("disc_" + face, 256, 256, (x, w) => {
    const c = w / 2, R = w / 2;
    const g = x.createRadialGradient(c, c, R * 0.3, c, c, R);
    g.addColorStop(0, "#6b6e73"); g.addColorStop(0.5, "#a3a6ab"); g.addColorStop(0.85, "#8b8e93"); g.addColorStop(1, "#5d6065");
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    x.strokeStyle = "rgba(255,255,255,0.06)"; for (let r = R * 0.5; r < R; r += 3) { x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = "#3a3c40"; x.beginPath(); x.arc(c, c, R * 0.46, 0, Math.PI * 2); x.fill(); // hat
    x.fillStyle = "#222326"; for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; x.beginPath(); x.arc(c + Math.cos(a) * R * 0.28, c + Math.sin(a) * R * 0.28, R * 0.05, 0, Math.PI * 2); x.fill(); }
    if (face === "vented") { x.strokeStyle = "rgba(20,20,22,0.5)"; x.lineWidth = 2; for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2; x.beginPath(); x.moveTo(c + Math.cos(a) * R * 0.95, c + Math.sin(a) * R * 0.95); x.lineTo(c + Math.cos(a) * R * 0.99, c + Math.sin(a) * R * 0.99); x.stroke(); } }
    if (face === "slotted" || face === "drilled") {
      x.strokeStyle = "#3c3e42"; x.lineWidth = 4;
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; x.beginPath(); x.arc(c, c, R * 0.78, a, a + 0.42); x.stroke(); }
    }
    if (face === "drilled") {
      x.fillStyle = "#1c1d20";
      for (let i = 0; i < 24; i++) for (const rr of [0.6, 0.72, 0.86]) { const a = i / 24 * Math.PI * 2 + rr * 2.1; x.beginPath(); x.arc(c + Math.cos(a) * R * rr, c + Math.sin(a) * R * rr, R * 0.025, 0, Math.PI * 2); x.fill(); }
    }
  });
}
const discMats = {};
function discMaterial(face) {
  // Lower metalness than real steel so the disc still reads in the shadow inside the wheel.
  return (discMats[face] ||= new THREE.MeshStandardMaterial({ map: discTexture(face), roughness: 0.42, metalness: 0.45, emissive: 0x2a2b2e, emissiveIntensity: 0.6 }));
}
const tyreMats = {};
function tyreMaterial(level) {
  if (tyreMats[level]) return tyreMats[level];
  const tt = tireTexture(level);
  return (tyreMats[level] = new THREE.MeshStandardMaterial({ map: tt, bumpMap: tt, bumpScale: TYRE_LOOK[level].bump, roughness: 0.9 }));
}
function lensTexture() {
  return canvasTexture("lens", 128, 128, (x, w) => {
    const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.18, "#fdfbf2"); g.addColorStop(0.3, "#b9bec6"); g.addColorStop(0.7, "#e8ebef"); g.addColorStop(1, "#8d939b");
    x.fillStyle = g; x.fillRect(0, 0, w, w);
    x.strokeStyle = "rgba(90,96,104,0.55)"; x.lineWidth = 2;
    for (let r = 26; r < 64; r += 9) { x.beginPath(); x.arc(64, 64, r, 0, Math.PI * 2); x.stroke(); }
    x.strokeStyle = "rgba(255,255,255,0.35)"; x.lineWidth = 1;
    for (let k = -64; k < 64; k += 8) { x.beginPath(); x.moveTo(0, 64 + k); x.lineTo(128, 64 + k); x.stroke(); }
  });
}
function grilleTexture() {
  return canvasTexture("grille", 128, 64, (x, w, h) => {
    x.fillStyle = "#050506"; x.fillRect(0, 0, w, h);
    x.strokeStyle = "#2a2b2e"; x.lineWidth = 2;
    for (let i = -h; i < w; i += 7) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + h, h); x.stroke(); x.beginPath(); x.moveTo(i + h, 0); x.lineTo(i, h); x.stroke(); }
  });
}
function plateTexture(number) {
  return canvasTexture("plate" + number, 512, 112, (x, w, h) => {
    x.fillStyle = "#f7f7f3"; x.fillRect(0, 0, w, h);
    x.fillStyle = "#c8141c"; x.fillRect(w - 120, 0, 120, h);
    x.strokeStyle = "#151515"; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
    x.fillStyle = "#fff"; x.font = "bold 66px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(number), w - 60, h / 2 + 3);
    x.fillStyle = "#151515"; x.font = "italic 900 54px Arial, sans-serif";
    const label = "RALLY LEGENDS", room = w - 150, tw = x.measureText(label).width;
    x.save(); x.translate((w - 120) / 2, h / 2 + 3); x.scale(Math.min(1, room / tw), 1); x.fillText(label, 0, 0); x.restore();
  });
}

// Headlamp lens artwork: colour map and a glow map (LED signature full, projector cores half).
const lampCache = {};
function lampTextures(kind) {
  if (lampCache[kind]) return lampCache[kind];
  const W = 512, H = kind === "slim" ? 160 : 200;
  const mk = () => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; return cv; };
  const cv = mk(), gv = mk(), x = cv.getContext("2d"), gx = gv.getContext("2d");
  gx.fillStyle = "#000"; gx.fillRect(0, 0, W, H);
  const outline = c => {
    c.beginPath();
    if (kind === "slim") { c.moveTo(6, H * 0.88); c.lineTo(22, H * 0.1); c.lineTo(W - 10, H * 0.04); c.quadraticCurveTo(W - 2, H * 0.4, W - 30, H * 0.9); c.closePath(); }
    else c.roundRect(4, 4, W - 8, H - 8, 18);
  };
  const glossyLens = (cx, cy, r) => {
    const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
    g.addColorStop(0, "#5a6470"); g.addColorStop(0.35, "#141920"); g.addColorStop(1, "#020304");
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "#c9ced4"; x.lineWidth = r * 0.16; x.stroke();
    x.fillStyle = "rgba(255,255,255,0.85)"; x.beginPath(); x.ellipse(cx - r * 0.35, cy - r * 0.38, r * 0.22, r * 0.12, -0.5, 0, Math.PI * 2); x.fill();
    gx.fillStyle = "#777"; gx.beginPath(); gx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); gx.fill();
  };
  const reflector = (cx, cy, r) => {
    const g = x.createRadialGradient(cx, cy, r * 0.05, cx, cy, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.18, "#e9edf1"); g.addColorStop(0.5, "#9aa2ac"); g.addColorStop(0.85, "#d7dce1"); g.addColorStop(1, "#7d858f");
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, r * 1.25, r, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = "rgba(80,88,98,0.5)"; x.lineWidth = 2; for (let k = 0.3; k < 1.25; k += 0.18) { x.beginPath(); x.ellipse(cx, cy, r * k * 1.25, r * k, 0, 0, Math.PI * 2); x.stroke(); }
    x.fillStyle = "#fffbe8"; x.beginPath(); x.arc(cx, cy, r * 0.12, 0, Math.PI * 2); x.fill();
    gx.fillStyle = "#999"; gx.beginPath(); gx.ellipse(cx, cy, r * 1.0, r * 0.8, 0, 0, Math.PI * 2); gx.fill();
  };
  x.save(); outline(x); x.clip();
  if (kind === "slim") {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#1c2128"); g.addColorStop(1, "#07090c");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // chrome inner trim along the bottom and a smoked reflector bed
    x.fillStyle = "#4a525c"; x.fillRect(0, H * 0.72, W, H * 0.08);
    glossyLens(W * 0.3, H * 0.5, H * 0.26); glossyLens(W * 0.55, H * 0.46, H * 0.22);
    reflector(W * 0.78, H * 0.42, H * 0.16);
    // LED daytime signature along the top and hooking down at the inner end
    for (const c of [x, gx]) { c.strokeStyle = "#ffffff"; c.lineWidth = 7; c.lineCap = "round"; c.beginPath(); c.moveTo(W * 0.1, H * 0.62); c.lineTo(W * 0.08, H * 0.22); c.lineTo(W * 0.92, H * 0.14); c.stroke(); }
    x.shadowColor = "#bfe4ff"; x.shadowBlur = 14; x.stroke(); x.shadowBlur = 0;
    // amber indicator strip at the outer end
    x.fillStyle = "#d98a1a"; x.fillRect(W * 0.86, H * 0.5, W * 0.1, H * 0.12);
  } else {
    x.fillStyle = "#c5cad0"; x.fillRect(0, 0, W, H); // chrome surround
    x.fillStyle = "#20252b"; x.beginPath(); x.roundRect(16, 16, W - 32, H - 32, 12); x.fill();
    reflector(W * 0.3, H * 0.5, H * 0.34); reflector(W * 0.72, H * 0.5, H * 0.28);
    // prismatic glass: fine vertical flutes over everything inside the surround
    x.fillStyle = "rgba(255,255,255,0.08)"; for (let i = 20; i < W - 20; i += 9) x.fillRect(i, 18, 3, H - 36);
  }
  x.restore();
  x.strokeStyle = "#0b0c0e"; x.lineWidth = 6; outline(x); x.stroke(); // rubber seal round the edge
  const map = new THREE.CanvasTexture(cv), glow = new THREE.CanvasTexture(gv);
  map.colorSpace = THREE.SRGBColorSpace; glow.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  return (lampCache[kind] = { map, glow });
}

// ---------- materials shared per car ----------
const shared = {};
function sharedMats() {
  if (shared.tire) return shared;
  const tt = tireTexture();
  shared.tire = new THREE.MeshStandardMaterial({ map: tt, bumpMap: tt, bumpScale: 2.5, roughness: 0.9 });
  shared.dark = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.65, metalness: 0.2 });
  shared.plastic = new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.75 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xdadde2, roughness: 0.12, metalness: 1 });
  shared.glass = new THREE.MeshPhysicalMaterial({ color: 0x15202b, roughness: 0.02, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2.4,
    transparent: true, opacity: 0.74, depthWrite: false, side: THREE.DoubleSide });
  shared.lens = new THREE.MeshStandardMaterial({ map: lensTexture(), roughness: 0.08, metalness: 0.4, emissive: 0xfff2cc, emissiveMap: lensTexture(), emissiveIntensity: 0 });
  const tailTex = canvasTexture("taillens", 128, 64, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#ff5a4a"); g.addColorStop(1, "#8a0a06");
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.strokeStyle = "rgba(60,0,0,0.6)"; x.lineWidth = 2;
    for (let i = 8; i < w; i += 10) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
    for (let j = 8; j < h; j += 10) { x.beginPath(); x.moveTo(0, j); x.lineTo(w, j); x.stroke(); }
  });
  shared.tail = new THREE.MeshStandardMaterial({ map: tailTex, color: 0xffffff, roughness: 0.15, emissive: 0xff1a10, emissiveMap: tailTex, emissiveIntensity: 0.35 });
  shared.amber = new THREE.MeshStandardMaterial({ color: 0xe08a12, roughness: 0.15, emissive: 0x7a3a00, emissiveIntensity: 0.3 });
  shared.towStrap = new THREE.MeshStandardMaterial({ color: 0xd8141c, roughness: 0.7 });
  shared.soot = new THREE.MeshBasicMaterial({ color: 0x050505 });
  shared.flap = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8, side: THREE.DoubleSide });
  const flute = canvasTexture("flute", 64, 64, (x, w, h) => {
    x.fillStyle = "#ffffff"; x.fillRect(0, 0, w, h);
    x.fillStyle = "rgba(170,185,200,0.55)"; for (let i = 0; i < w; i += 6) x.fillRect(i, 0, 2, h);
    x.fillStyle = "rgba(200,210,220,0.4)"; for (let j = 0; j < h; j += 16) x.fillRect(0, j, w, 1);
  });
  shared.reflector = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 0.85, roughness: 0.16, emissive: 0xfff0d2, emissiveIntensity: 0.06, envMapIntensity: 1.6 });
  shared.bulb = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, emissive: 0xfff3dd, emissiveIntensity: 0.15 });
  shared.lensGlass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: flute, transparent: true, opacity: 0.32, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 2, depthWrite: false });
  shared.projector = new THREE.MeshPhysicalMaterial({ color: 0x0b0d10, roughness: 0.02, metalness: 0.3, clearcoat: 1, envMapIntensity: 2.2 });
  shared.drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe4f3ff, emissiveIntensity: 1.8 });
  shared.grille = new THREE.MeshStandardMaterial({ map: grilleTexture(), roughness: 0.6, metalness: 0.3 });
  shared.alloy = new THREE.MeshStandardMaterial({ color: 0x8d9095, roughness: 0.5, metalness: 0.8 });
  shared.rimDark = new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, metalness: 0.6 });
  shared.disc = new THREE.MeshStandardMaterial({ color: 0x77797d, roughness: 0.35, metalness: 0.9 });
  shared.cage = new THREE.MeshStandardMaterial({ color: 0x34373c, roughness: 0.5, metalness: 0.5 });
  shared.trim = new THREE.MeshStandardMaterial({ color: 0x232427, roughness: 0.85 });
  shared.rubber = new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.6, side: THREE.DoubleSide });
  shared.suit = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.85 });
  shared.visor = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.05, metalness: 0.6 });
  return shared;
}

// ---------- the car ----------
export class CarModel {
  constructor(car, livery, rimId, opts = {}) {
    this.car = car;
    this.opts = opts;
    const B = car.body, M = sharedMats();
    this.root = new THREE.Group();
    this.chassis = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.chassis);
    this.chassis.add(this.body);
    this.dirt = { uDirt: { value: 0 }, uDirtCol: { value: new THREE.Color(0x6b5a45) } };
    this.plateNo = livery.number;

    this.paint = new THREE.MeshPhysicalMaterial({ roughness: 0.3, metalness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2 });
    this.roofMat = new THREE.MeshPhysicalMaterial({ roughness: 0.32, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1, side: THREE.DoubleSide });
    this.solid = new THREE.MeshPhysicalMaterial({ roughness: 0.34, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.accent = new THREE.MeshPhysicalMaterial({ roughness: 0.4, metalness: 0.1, clearcoat: 0.6 });
    this.rimMat = new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.85 });
    addDirt(this.paint, this.dirt); addDirt(this.roofMat, this.dirt, 0.4); addDirt(this.solid, this.dirt, 1.2); addDirt(this.accent, this.dirt, 1.2);
    addDirt(this.rimMat, this.dirt, 1.6);

    // Body: a modelled one from a kit when this car has one loaded, otherwise lofted from the stations in data.js.
    const kit = this.kit = kitFor(car);
    const { zF, zR } = kit ? kit.meta : this.buildLofted(car);
    // Visible wheel size and track (the physics keeps its own numbers in data.js).
    const V = this.vis = kit ? { wheelR: kit.meta.wheelR, wheelW: kit.meta.wheelW, track: kit.meta.track } : { wheelR: B.wheelR, wheelW: B.wheelW, track: car.track };
    this.zF = zF; this.zR = zR;
    if (!kit) {
      const ao = { zF, zR, r: B.wheelR, low: Math.min(...B.low.map(l => l[2])) };
      addDirt(this.paint, this.dirt, 1, ao); addDirt(this.solid, this.dirt, 1.2, ao);
    }

    // Origin at the centre of gravity: front axle sits `a` ahead of it.
    const b = car.cgFront * car.wheelbase, a = car.wheelbase - b;
    this.offset = a - zF;
    this.body.position.z = this.offset;
    if (kit) this.buildKit(kit);
    // nose position and the bonnet camera eye, body-local
    this.noseZ = kit ? kit.meta.nose : B.L / 2;
    this.eyeBonnet = kit ? [0, kit.meta.hoodY + 0.42, kit.meta.screenBase + 0.15] : [0, profileOf(B)[12][3] + 0.42, B.L / 2 - B.cab.t0 * B.L + 0.15];

    // Wheels
    this.wheels = []; this.tires = []; this.discs = []; this.calipers = [];
    this.classCaliper = { H: 0x8a8d92, G4: 0x2a2a2a, GB: 0xc8141c, WRC: 0xd4a017, R1: 0xd8141c }[car.cls] || 0xc8141c;
    const ratio = RIM_RATIO[car.cls] || 0.64;
    const tireG = tireGeometry(V.wheelR, V.wheelW, ratio);
    const rimG = this.rimGeometry(V.wheelR * ratio, V.wheelW);
    const discG = new THREE.CylinderGeometry(V.wheelR * 0.5, V.wheelR * 0.5, 0.024, 28); discG.rotateZ(Math.PI / 2); discG.translate(-V.wheelW * 0.02, 0, 0);
    const calG = new THREE.BoxGeometry(0.06, V.wheelR * 0.26, V.wheelR * 0.34);
    this.caliperMat = new THREE.MeshStandardMaterial({ color: this.classCaliper, roughness: 0.4, metalness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const pivot = new THREE.Group(), spinner = new THREE.Group(), inner = new THREE.Group();
      const tire = new THREE.Mesh(tireG, M.tire), rim = new THREE.Mesh(rimG.face, this.rimMat), rimDark = new THREE.Mesh(rimG.dark, M.rimDark), rimBright = new THREE.Mesh(rimG.bright, M.chrome);
      const disc = new THREE.Mesh(discG, M.disc);
      inner.add(tire, rim, rimDark, rimBright, disc);
      if (!left) inner.rotation.y = Math.PI;
      spinner.add(inner); pivot.add(spinner);
      // the calliper doesn't rotate with the wheel
      const cal = new THREE.Mesh(calG, this.caliperMat);
      cal.position.set((left ? 1 : -1) * V.wheelW * 0.08, V.wheelR * 0.3, (front ? -1 : 1) * V.wheelR * 0.22);
      cal.userData.base = cal.position.clone();
      pivot.add(cal);
      this.discs.push(disc); this.calipers.push(cal);
      pivot.position.set((left ? 1 : -1) * V.track / 2, V.wheelR, (front ? zF : zR) + this.offset);
      this.chassis.add(pivot);
      this.wheels.push({ pivot, spinner, front, left, baseY: V.wheelR });
      tire.castShadow = true;
      this.tires.push(tire);
    }
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    // Soft contact shadow under the car (helps when shadow maps are off or low-res)
    const blobW = kit ? kit.meta.hw * 2 : B.W, blobL = kit ? kit.meta.nose - kit.meta.tail : B.L;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(blobW * 1.35, blobL * 1.2), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.75 }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; blob.position.z = this.offset + (zF + zR) / 2;
    blob.renderOrder = 1;
    this.chassis.add(blob);
    this.blob = blob;

    this.setLivery(livery, rimId);
    this.setTyres(opts.tyres || 0);
    this.setBrakes(opts.brakes || 0);
    if (opts.ghost) this.makeGhost();
    this.lightsOn = false;
  }

  // The lofted body: shell, glass cabin, window frames, sun strip and all the procedural details.
  buildLofted(car) {
    const B = car.body, M = sharedMats();
    const { geo, zF, zR, swell, flareW } = buildBodyGeometry(car);
    this.swell = swell; this.flareW = flareW;
    this.zF = zF; this.zR = zR;
    const bodyMesh = new THREE.Mesh(geo, [this.paint, this.solid]);
    this.bodyMesh = bodyMesh;
    const retroTrim = car.cls === "H" || car.cls === "G4";
    const cabin = new THREE.Mesh(buildCabinGeometry(car), [M.glass, this.roofMat, retroTrim ? M.chrome : M.rubber, this.solid]);
    this.body.add(bodyMesh, cabin);
    // window surrounds (chrome on classics, black rubber later), drip rails and the sliding-window divider
    {
      const { loops, rails, slide } = windowOutlines(car);
      const frameMat = retroTrim ? M.chrome : M.rubber;
      for (const loop of loops) {
        const curve = new THREE.CatmullRomCurve3(loop, true, "catmullrom", 0.05);
        this.body.add(new THREE.Mesh(new THREE.TubeGeometry(curve, loop.length * 10, retroTrim ? 0.007 : 0.009, 6, true), frameMat));
      }
      this.gutterMat = new THREE.MeshPhysicalMaterial({ roughness: 0.3, clearcoat: 1, metalness: 0.1 });
      for (const r of rails) this.body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r), 24, 0.009, 6, false), this.gutterMat));
      if (B.sliding) for (const [a, b] of slide) this.body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 2, 0.006, 6, false), M.chrome));
    }
    const stripTex = canvasTexture("sunstrip" + car.cls, 1024, 64, (x, w, h) => {
      x.fillStyle = car.cls === "R1" ? "#0d1014" : car.cls === "H" ? "#e9e4d2" : "#13161b"; x.fillRect(0, 0, w, h);
      x.fillStyle = car.cls === "H" ? "#151515" : "#ffffff"; x.font = "italic 900 34px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText(car.cls === "H" ? "RALLY LEGENDS" : "RALLY LEGENDS  ·  " + SPONSORS[hashStr(car.id) % SPONSORS.length], w / 2, h / 2 + 2);
    });
    this.body.add(new THREE.Mesh(buildSunstrip(car), new THREE.MeshStandardMaterial({ map: stripTex, roughness: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })));
    this.addDetails(car, zF, zR);
    return { zF, zR };
  }

  // A modelled body from a kit. Geometry and textures are shared with the kit; the paint becomes this car's livery
  // material (livery on the second UV set, the model's baked occlusion kept), and the lamps get per-car copies.
  buildKit(kit) {
    const m = kit.meta, M = sharedMats(), scene = kit.scene.clone(true), lamp = new Map();
    this.paintMeshes = []; this.headKit = []; this.brakeKit = [];
    scene.traverse(o => {
      if (!o.isMesh) return;
      const mat = o.material;
      if (mat.name === "paint") {
        if (mat.aoMap) { this.paint.aoMap = mat.aoMap; this.paint.aoMapIntensity = 1; }
        this.paint.side = mat.side;
        o.material = this.paint; this.paintMeshes.push(o);
      } else if (mat.name === "lamp_head" || mat.name === "lamp_brake") {
        let c = lamp.get(mat);
        if (!c) {
          const head = mat.name === "lamp_head";
          c = mat.clone(); c.emissive = new THREE.Color(head ? 0xfff3dd : 0xff2a18); c.emissiveMap = mat.map; c.emissiveIntensity = 0;
          lamp.set(mat, c); (head ? this.headKit : this.brakeKit).push(c);
        }
        o.material = c;
      }
    });
    this.body.add(scene);
    const add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); this.body.add(o); return o; };
    // mud flaps behind each wheel
    for (const z of [m.zF, m.zR]) for (const s of [1, -1]) add(new THREE.BoxGeometry(m.wheelW + 0.05, 0.28, 0.012), M.flap, s * m.track / 2, 0.22, z - m.wheelR - 0.1);
    this.exhaustLocal = new THREE.Vector3(-m.hw * 0.45, 0.24, m.tail - 0.12);
    // crew in helmets: driver behind the model's steering wheel, co-driver beside
    const helmR = 0.12, zSeat = m.rearTop + (m.screenTop - m.rearTop) * 0.5, yHead = m.roofY - 0.1 - helmR;
    this.helmetMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.1 });
    for (const side of [1, -1]) {
      const x = side * Math.max(0.3, Math.abs(m.steerX));
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.22, 4, 10), M.suit);
      torso.position.set(x, yHead - helmR - 0.27, zSeat - 0.06); torso.rotation.x = 0.16; this.body.add(torso);
      const head = add(new THREE.SphereGeometry(helmR, 16, 12), this.helmetMat, x, yHead, zSeat);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(helmR * 1.02, 16, 8, -0.9, 1.8, 1.1, 0.7), M.visor);
      visor.position.copy(head.position); this.body.add(visor);
    }
  }

  // First hit on the painted shell along a body-local ray: { p, n } in body space, or null.
  kitHit(o, d) {
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    this.body.updateMatrixWorld(true);
    ray.set(this.body.localToWorld(o.clone()), d.clone().transformDirection(this.body.matrixWorld));
    const hit = ray.intersectObjects(this.paintMeshes, false)[0];
    if (!hit) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).transformDirection(this.body.matrixWorld.clone().invert());
    return { p: this.body.worldToLocal(hit.point.clone()), n };
  }
  // A decal shrink-wrapped onto the kit's shell: on a side (sd = ±1, centred at z, y) or on the roof (sd = 0, centred at z, x).
  // Grid points are found by raycasting, so the geometry is cached on the kit per placement.
  kitDecal(tex, sd, zc, c2, wM, hM) {
    const key = [sd, zc, c2, wM, hM].map(v => v.toFixed(3)).join(":"), cache = this.kit.decals;
    let g = cache.get(key);
    if (!g) {
      const nx = 14, ny = 6, pos = [], uv = [], ok = [], idx = [];
      for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
        const u = ix / nx, v = iy / ny;
        let hit;
        if (sd) {
          const z = zc + (sd > 0 ? 0.5 - u : u - 0.5) * wM, y = c2 + (v - 0.5) * hM;
          hit = this.kitHit(new THREE.Vector3(sd * 3, y, z), new THREE.Vector3(-sd, 0, 0));
        } else { // reads from the left side: across the canvas runs nose -> tail, up runs away across the roof
          const z = zc + (0.5 - u) * wM, x = c2 + (0.5 - v) * hM;
          hit = this.kitHit(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
        }
        if (hit) { pos.push(hit.p.x + hit.n.x * 0.004, hit.p.y + hit.n.y * 0.004, hit.p.z + hit.n.z * 0.004); ok.push(1); } else { pos.push(0, 0, 0); ok.push(0); }
        uv.push(u, v);
      }
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        const a = iy * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
        if (ok[a] && ok[b] && ok[c] && ok[d]) idx.push(a, b, c, b, d, c);
      }
      g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      cache.set(key, g);
    }
    const mat = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.08, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    addDirt(mat, this.dirt, 0.9);
    const mesh = new THREE.Mesh(g, mat);
    mesh.userData.shared = true;
    this.decals.add(mesh);
    return mesh;
  }
  // Door number board, sponsor across the doors, event sticker on the rear quarter and the roof number.
  buildKitDecals(livery) {
    const m = this.kit.meta, car = this.car, num = String(livery.number), design = LIVERY_BY_ID[livery.design] || LIVERY_BY_ID.solid;
    const sponsorA = SPONSORS[hashStr(car.id) % SPONSORS.length];
    const tex = (key, wM, hM, draw) => { const W = 512, H = Math.max(24, Math.round(512 * hM / wM)); return canvasTexture("dec:" + key + ":" + H, W, H, draw); };
    const fitText = (x, txt, w, h, maxH, font) => {
      x.font = font.replace("#", Math.round(maxH)); const tw = x.measureText(txt).width;
      x.save(); x.translate(w / 2, h / 2 + maxH * 0.04); x.scale(Math.min(1, w * 0.88 / tw), 1); x.fillText(txt, 0, 0); x.restore();
    };
    const both = (t, wM, hM, z, y) => { for (const sd of [1, -1]) this.kitDecal(t, sd, z, y, wM, hM); };
    const zDoor = Math.min(m.zF - m.wheelR - 0.1, m.screenBase), zB = m.screenTop - (m.screenTop - m.rearTop) * 0.42, zArchR = m.zR + m.wheelR + 0.1;
    // number board on the front door, just under the window
    const w = Math.min(0.3, (zDoor - zB) * 0.4), h = w * 0.72;
    const board = (key) => tex(key + num, w, h, (x, W, H) => {
      x.fillStyle = "#151515"; x.beginPath(); x.roundRect(0, 0, W, H, H * 0.08); x.fill();
      x.fillStyle = "#f7f7f2"; x.beginPath(); x.roundRect(W * 0.03, H * 0.04, W * 0.94, H * 0.92, H * 0.06); x.fill();
      x.fillStyle = "#121212"; x.textAlign = "center"; x.textBaseline = "middle";
      fitText(x, num, W, H, H * 0.74, "bold #px Arial, sans-serif");
    });
    both(board("board"), w, h, (zDoor + zB) / 2, m.belt - h / 2 - 0.05);
    // sponsor along the lower doors, outlined so it reads on any paint
    const sw = Math.min(1.1, (zDoor - zArchR) * 0.72), sh = Math.min(0.13, (m.belt - m.sill) * 0.24);
    const dark = design.dark || isDark(design.id === "split" || design.id === "diagonal" ? livery.colors[1] : livery.colors[0]);
    const ts = tex("spon" + sponsorA + (dark ? "w" : "b"), sw, sh, (x, W, H) => {
      x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
      x.font = "italic 900 " + Math.round(H * 0.78) + "px Arial, sans-serif";
      const tw = x.measureText(sponsorA).width; x.save(); x.translate(W / 2, H / 2 + H * 0.04); x.scale(Math.min(1, W * 0.94 / tw), 1);
      x.lineWidth = H * 0.1; x.strokeStyle = dark ? "#111" : "#fff"; x.strokeText(sponsorA, 0, 0);
      x.fillStyle = dark ? "#fff" : "#141414"; x.fillText(sponsorA, 0, 0); x.restore();
    });
    both(ts, sw, sh, (zDoor + zArchR) / 2, m.sill + (m.belt - m.sill) * 0.3);
    // event sticker over the rear arch
    const qw = 0.26, qh = qw * 0.2;
    const s3 = tex("stk3", qw, qh, (x, W, H) => {
      x.fillStyle = "#121418"; x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, H * 0.2); x.fill();
      x.fillStyle = "#f2f2f2"; x.textAlign = "center"; x.textBaseline = "middle"; fitText(x, "RALLY LEGENDS", W, H, H * 0.58, "italic 900 #px Arial, sans-serif");
    });
    both(s3, qw, qh, m.zR, m.belt - 0.09);
    // roof number, read from the side the car comes past
    const rw = 0.4, rh = 0.32;
    const rt = tex("roof" + num, rw, rh, (x, W, H) => {
      x.fillStyle = "#f7f7f2"; x.beginPath(); x.roundRect(2, 2, W - 4, H - 4, H * 0.06); x.fill();
      x.fillStyle = "#111"; x.textAlign = "center"; x.textBaseline = "middle"; fitText(x, num, W, H, H * 0.8, "bold #px Arial, sans-serif");
    });
    this.kitDecal(rt, 0, (m.screenTop + m.rearTop) / 2, 0, rw, rh);
  }

  // Alloy wheel by era: Minilite-style 8-spoke (60s/70s), turbine (80s), cross-spoke mesh (90s), twin 5-spoke (modern).
  // Returns three geometries: face (rim colour), dark (barrel, recesses, centre cap), bright (lip, lug nuts).
  rimGeometry(R, W) {
    const face = [], dark = [], bright = [], X = W * 0.34, style = this.car.body.rim || "minilite";
    const barrel = new THREE.CylinderGeometry(R, R, W * 0.86, 28, 1, true); barrel.rotateZ(Math.PI / 2); dark.push(barrel);
    const back = new THREE.CircleGeometry(R * 0.97, 28); back.rotateY(Math.PI / 2); back.translate(-W * 0.2, 0, 0); dark.push(back);
    const lip = new THREE.TorusGeometry(R * 0.975, R * 0.035, 6, 32); lip.rotateY(Math.PI / 2); lip.translate(X + 0.01, 0, 0); bright.push(lip);
    const spoke = (len, w, depth, r0, ang, twist = 0, dst = face) => {
      const g = new THREE.BoxGeometry(depth, len, w);
      g.translate(X, r0 + len / 2, 0);
      if (twist) g.rotateY(0), g.rotateX(twist);
      g.rotateX(ang);
      dst.push(g);
    };
    const hubR = R * 0.24;
    if (style === "minilite") {
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; spoke(R * 0.72, R * 0.17, 0.035, hubR, a); }
      const ring = new THREE.TorusGeometry(R * 0.9, R * 0.06, 6, 32); ring.rotateY(Math.PI / 2); ring.translate(X, 0, 0); face.push(ring);
    } else if (style === "turbine") {
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; spoke(R * 0.72, R * 0.07, 0.03, hubR, a, 0.18); }
    } else if (style === "mesh") {
      for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; spoke(R * 0.74, R * 0.06, 0.03, hubR, a, 0.22); spoke(R * 0.74, R * 0.06, 0.028, hubR, a, -0.22); }
      const ring = new THREE.TorusGeometry(R * 0.92, R * 0.04, 6, 32); ring.rotateY(Math.PI / 2); ring.translate(X, 0, 0); face.push(ring);
    } else { // twin
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; spoke(R * 0.74, R * 0.08, 0.035, hubR, a - 0.12); spoke(R * 0.74, R * 0.08, 0.035, hubR, a + 0.12); spoke(R * 0.7, R * 0.1, 0.02, hubR, a, 0, dark); }
    }
    // hub, centre cap and lug nuts
    const hub = new THREE.CylinderGeometry(hubR, hubR * 1.1, 0.04, 20); hub.rotateZ(Math.PI / 2); hub.translate(X, 0, 0); face.push(hub);
    const cap = new THREE.CylinderGeometry(hubR * 0.55, hubR * 0.55, 0.012, 18); cap.rotateZ(Math.PI / 2); cap.translate(X + 0.024, 0, 0); dark.push(cap);
    const nuts = this.car.cls === "H" || this.car.cls === "G4" ? 4 : 5;
    for (let i = 0; i < nuts; i++) {
      const a = i / nuts * Math.PI * 2, n = new THREE.CylinderGeometry(0.009, 0.009, 0.02, 6);
      n.rotateZ(Math.PI / 2); n.translate(X + 0.02, Math.cos(a) * hubR * 0.78, Math.sin(a) * hubR * 0.78); bright.push(n);
    }
    return { face: mergeGeos(face), dark: mergeGeos(dark), bright: mergeGeos(bright) };
  }


  addDetails(car, zF, zR) {
    const B = car.body, M = sharedMats(), L = B.L, hw = B.W / 2;
    const at = t => { const [hwF, yb, yt] = sampleProfile(profileOf(B), t); return { hw: hwF * hw, yb, yt, z: zOf(t, L, endR(B)) }; };
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); this.body.add(m); return m; };
    this.headMats = [];
    // dark wheel-well liners so the arches read as openings
    const well = new THREE.CylinderGeometry(B.wheelR + 0.06, B.wheelR + 0.06, B.W * 0.86, 20, 1, true, 0, Math.PI);
    well.rotateZ(Math.PI / 2); // upper half-tube along x
    const wellMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9, side: THREE.BackSide });
    for (const z of [zF, zR]) add(well, wellMat, 0, B.wheelR, z);
    // ---- front fascia ----
    const FZ = L / 2, RZ = -L / 2, f = at(0), era = car.cls, retro = era === "H" || era === "G4";
    const fh = f.yt - f.yb, fy = y => f.yb + fh * y;              // height on the nose, 0 = bottom, 1 = top
    const faceHW = Math.max(0.2, f.hw - endR(B) * 1.1);           // flat part of the end face
    // Low noses (Alpine, Stratos) have no room on the face: lamps go up on the front lid instead,
    // and the grille shrinks to a slot above the plate.
    const lowNose = fh < 0.34, lid = at(0.035);
    // grille between the lamps, trimmed with a chrome strip on its top edge
    const gH = lowNose ? fh * 0.14 : fh * 0.26, gY = lowNose ? fy(0.8) : fy(0.55);
    if (B.grille !== false) {
      add(new THREE.BoxGeometry(faceHW * 0.9, gH, 0.04), [M.dark, M.dark, M.dark, M.dark, M.grille, M.dark], 0, gY, FZ - 0.012);
      add(new THREE.BoxGeometry(faceHW * 0.94, 0.012, 0.03), M.chrome, 0, gY + gH / 2 + 0.008, FZ - 0.004);
    }
    // headlamps, kept inside the flat part of the nose
    const hy = fy(0.6);
    if (B.lights === "round") {
      const r = Math.min(0.09, faceHW * 0.24);
      if (lowNose) for (const sd of [1, -1]) this.roundLamp(r, sd * Math.min(lid.hw * 0.66, lid.hw - r * 1.3), lid.yt + r * 0.35, lid.z + 0.05);
      else for (const sd of [1, -1]) this.roundLamp(r, sd * (faceHW - r * 1.15), hy, FZ + 0.004);
    } else if (B.lights === "rect") {
      const w = Math.min(0.32, faceHW * 0.52), h = Math.min(0.13, fh * 0.27);
      for (const sd of [1, -1]) this.conformLamp("rect", sd, faceHW - w - 0.01, faceHW - 0.01, hy, hy, h, h);
    } else if (B.lights === "oval") {
      // Oval lamps set into the top of each raised front wing, facing forward and up, with a four-dot LED signature.
      const p = at(0.075), p2 = at(0.035), slope = Math.atan2(p.yt - p2.yt, p2.z - p.z), r = Math.min(0.105, p.hw * 0.16);
      for (const sd of [1, -1]) {
        const g = this.roundLamp(r, sd * p.hw * 0.66, p.yt + r * 0.05, p.z + 0.07, { depth: r * 0.8, bezel: M.dark });
        g.scale.set(1, 0.82, 1); g.rotation.x = -0.42 - slope * 0.3;
        for (const [dx, dy] of [[-0.42, 0.34], [0.42, 0.34], [-0.42, -0.34], [0.42, -0.34]]) {
          const dot = new THREE.Mesh(new THREE.SphereGeometry(r * 0.11, 8, 6), M.drl); dot.position.set(dx * r, dy * r, -r * 0.05); g.add(dot);
        }
        const proj = new THREE.Mesh(new THREE.SphereGeometry(r * 0.3, 16, 10), M.projector); proj.position.set(0, 0, -r * 0.12); g.add(proj);
      }
    } else if (B.lights === "slim") {
      // swept units running from beside the grille round onto the corner of the wing
      const h = Math.min(0.12, fh * 0.24);
      for (const sd of [1, -1]) this.conformLamp("slim", sd, faceHW * 0.36, f.hw - 0.03, fy(0.72), fy(0.86), h, h * 0.62);
    }
    if (retro) {
      // chrome blade bumper with overriders
      const bg = new THREE.CapsuleGeometry(0.03, faceHW * 2 + 0.1, 4, 10); bg.rotateZ(Math.PI / 2);
      add(bg, M.chrome, 0, fy(0.12), FZ + 0.03);
      for (const sd of [1, -1]) {
        add(new THREE.BoxGeometry(0.04, 0.12, 0.05), M.chrome, sd * faceHW * 0.55, fy(0.14), FZ + 0.045);
        add(new THREE.BoxGeometry(0.03, 0.025, 0.06), M.dark, sd * faceHW * 0.85, fy(0.12), FZ + 0.0); // bracket
      }
    } else {
      // body-colour bumper: dark lower lip, mesh intakes either side with fog lamps
      add(new THREE.BoxGeometry(faceHW * 2, 0.035, 0.08), M.plastic, 0, f.yb + 0.035, FZ - 0.07);
      if (B.intake === "gt") {
        // one wide black intake across the lower bumper with blade dividers, plus slim outer ducts
        add(new THREE.BoxGeometry(faceHW * 1.25, fh * 0.34, 0.03), [M.dark, M.dark, M.dark, M.dark, M.grille, M.dark], 0, fy(0.27), FZ - 0.006);
        add(new THREE.BoxGeometry(faceHW * 1.29, 0.02, 0.04), M.plastic, 0, fy(0.27) + fh * 0.17, FZ - 0.002);
        for (const sd of [1, -1]) {
          add(new THREE.BoxGeometry(0.018, fh * 0.34, 0.035), M.plastic, sd * faceHW * 0.26, fy(0.27), FZ - 0.002);
          add(new THREE.BoxGeometry(faceHW * 0.22, fh * 0.26, 0.03), [M.dark, M.dark, M.dark, M.dark, M.grille, M.dark], sd * faceHW * 0.86, fy(0.26), FZ - 0.012);
        }
      } else for (const sd of [1, -1]) {
        add(new THREE.BoxGeometry(faceHW * 0.5, fh * 0.17, 0.03), [M.dark, M.dark, M.dark, M.dark, M.grille, M.dark], sd * faceHW * 0.66, fy(0.24), FZ - 0.008);
        this.roundLamp(0.04, sd * faceHW * 0.78, fy(0.24), FZ + 0.004, { depth: 0.03, bezel: M.dark });
      }
    }
    // tow strap and the front plate on its own clear space below the grille
    add(new THREE.BoxGeometry(0.05, 0.1, 0.02), M.towStrap, -faceHW * 0.62, fy(0.08), FZ + 0.025, 0.3);
    const plateG = new THREE.PlaneGeometry(0.46, 0.1);
    const plateY = retro ? (lowNose ? fy(0.12) + 0.03 + 0.065 : fy(0.29)) : Math.max(f.yb + 0.11, fy(0.24));
    add(new THREE.BoxGeometry(0.48, 0.115, 0.012), M.plastic, 0, plateY, FZ + 0.004);
    add(plateG, new THREE.MeshStandardMaterial({ map: plateTexture(this.plateNo), roughness: 0.45 }), 0, plateY, FZ + 0.011);

    // rally spot lamps: four on a bar across the bonnet, or two in the nose between the headlamps
    if (B.lamps === "pod4" || B.lamps === "pod2") {
      const four = B.lamps === "pod4";
      if (four) {
        const p = at(0.05), y = p.yt + 0.1, zz = p.z + 0.02, span = p.hw * 1.5, r = Math.min(0.088, span / 4 / 2.3);
        add(new THREE.BoxGeometry(span + 0.1, 0.03, 0.04), M.dark, 0, y - r - 0.03, zz - 0.06);
        for (let i = 0; i < 4; i++) {
          const x = (i - 1.5) * (span / 4) * 1.06;
          this.roundLamp(r, x, y, zz, { depth: 0.11, housing: M.dark, bezel: M.chrome });
          add(new THREE.BoxGeometry(0.02, 0.06, 0.02), M.dark, x, y - r - 0.02, zz - 0.05);
        }
      } else if (lowNose) {
        // pair of spots standing on the front lid between the headlamps
        const r = Math.min(0.075, lid.hw * 0.18);
        for (const sd of [1, -1]) this.roundLamp(r, sd * lid.hw * 0.24, lid.yt + r + 0.02, lid.z + 0.03, { depth: 0.1, housing: M.dark, bezel: M.chrome });
      } else {
        // pair of spots set into the grille
        const r = Math.min(0.07, fh * 0.12, faceHW * 0.15);
        for (const sd of [1, -1]) this.roundLamp(r, sd * faceHW * 0.3, fy(0.55), FZ + 0.03, { depth: 0.09, housing: M.dark, bezel: M.chrome });
      }
    }
    // ---- rear fascia ----
    const rr = at(1), rh = rr.yt - rr.yb, ry = y => rr.yb + rh * y, backHW = Math.max(0.2, rr.hw - endR(B) * 1.1);
    add(new THREE.BoxGeometry(backHW * 2, rh * 0.22, 0.02), retro ? this.solid : M.plastic, 0, ry(0.62), RZ + 0.004);
    const tailFace = [M.dark, M.dark, M.dark, M.dark, M.dark, M.tail]; // box -z face is index 5
    const amberFace = [M.dark, M.dark, M.dark, M.dark, M.dark, M.amber];
    if (era === "H") for (const sd of [1, -1]) {
      for (const dy of [0, 1]) { const g = new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16); g.rotateX(Math.PI / 2); add(g, [M.chrome, M.dark, dy ? M.amber : M.tail], sd * backHW * 0.78, ry(0.6) + dy * 0.1, RZ - 0.008); }
    } else if (era === "R1") {
      add(new THREE.BoxGeometry(backHW * 1.7, 0.035, 0.025), tailFace, 0, ry(0.74), RZ - 0.006);
      for (const sd of [1, -1]) add(new THREE.BoxGeometry(0.26, 0.09, 0.03), tailFace, sd * backHW * 0.8, ry(0.66), RZ - 0.008);
    } else for (const sd of [1, -1]) {
      const w = era === "G4" ? 0.22 : 0.32;
      add(new THREE.BoxGeometry(w, 0.11, 0.03), tailFace, sd * backHW * 0.74, ry(0.62), RZ - 0.008);
      add(new THREE.BoxGeometry(0.08, 0.11, 0.03), amberFace, sd * (backHW * 0.74 - w / 2 - 0.045), ry(0.62), RZ - 0.008);
    }
    if (retro) {
      const bg = new THREE.CapsuleGeometry(0.03, backHW * 2 + 0.1, 4, 10); bg.rotateZ(Math.PI / 2); add(bg, M.chrome, 0, ry(0.12), RZ - 0.03);
      for (const sd of [1, -1]) add(new THREE.BoxGeometry(0.03, 0.025, 0.06), M.dark, sd * backHW * 0.85, ry(0.12), RZ);
    }
    else add(new THREE.BoxGeometry(backHW * 2 + 0.1, 0.06, 0.12), M.plastic, 0, rr.yb + 0.04, RZ + 0.02);
    add(new THREE.BoxGeometry(0.05, 0.1, 0.02), M.towStrap, backHW * 0.5, ry(0.12), RZ - 0.025, -0.3);
    add(new THREE.BoxGeometry(0.48, 0.115, 0.012), M.plastic, 0, ry(0.36), RZ - 0.004);
    add(plateG, new THREE.MeshStandardMaterial({ map: plateTexture(this.plateNo), roughness: 0.45 }), 0, ry(0.36), RZ - 0.011, 0, Math.PI, 0);
    // mirrors
    // Door mirrors: chrome bullets on the classics, body-colour teardrops on later cars, on a short stalk.
    const mc = at(car.body.cab.t0 + 0.07), mx = mc.hw * car.body.cab.hwBot, classic = car.cls === "H" || car.cls === "G4";
    for (const s of [1, -1]) {
      const stalk = new THREE.CylinderGeometry(0.008, 0.012, 0.09, 6); stalk.rotateZ(s * Math.PI / 2.6);
      add(stalk, classic ? M.chrome : M.plastic, s * (mx + 0.035), mc.yt + 0.05, mc.z);
      const hg = new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62);
      hg.rotateX(Math.PI / 2); // dome faces forwards, open side (with the glass) backwards
      const hx = s * (mx + 0.09), hy = mc.yt + 0.085;
      const house = add(hg, classic ? M.chrome : this.solid, hx, hy, mc.z);
      house.scale.set(classic ? 0.05 : 0.075, classic ? 0.045 : 0.05, classic ? 0.06 : 0.07);
      const glassM = add(new THREE.CircleGeometry(1, 18), M.chrome, hx, hy, mc.z - (classic ? 0.022 : 0.028), 0, Math.PI, 0);
      glassM.scale.set(classic ? 0.045 : 0.068, classic ? 0.04 : 0.044, 1);
    }
    this.addInterior(car);
    this.addSmallDetails(car, zF, zR);
    // exhaust
    const ex = at(1);
    const eg = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 12, 1, true); eg.rotateX(Math.PI / 2);
    const exX = B.exhaust === "center" ? [-0.075, 0.075] : [-ex.hw * 0.5];
    for (const xx of exX) {
      add(eg, M.chrome, xx, ex.yb + 0.07, -L / 2 - 0.02);
      add(new THREE.CircleGeometry(0.036, 12), M.soot, xx, ex.yb + 0.07, -L / 2 + 0.02, 0, Math.PI, 0);
    }
    this.exhaustLocal = new THREE.Vector3(exX[0], ex.yb + 0.07, -L / 2 - 0.15);
    // sills: black skirts on later cars, a chrome strip on classics
    {
      const mid = at(0.5), len = (zF - zR) - 2 * (B.wheelR + 0.12), zc = (zF + zR) / 2;
      for (const sd of [1, -1]) {
        if (car.cls === "H" || car.cls === "G4") add(new THREE.BoxGeometry(0.012, 0.018, len), M.chrome, sd * (mid.hw + 0.004), mid.yb + 0.09, zc);
        else add(new THREE.BoxGeometry(0.05, 0.09, len + 0.1), M.plastic, sd * (mid.hw - 0.005), mid.yb + 0.035, zc);
      }
    }
    // mud flaps behind each wheel
    for (const z of [zF, zR]) for (const s of [1, -1]) {
      add(new THREE.BoxGeometry(B.wheelW + 0.05, 0.3, 0.012), M.flap, s * car.track / 2, 0.24, z - B.wheelR - 0.1);
    }
    // wings and scoops
    const C = B.cab, rear = at(0.94), roofZ = zOf(C.r1, L, endR(B));
    const wingMat = this.accent;
    // Airfoil-section wing element spanning x, leading edge forward.
    const plank = (w, chord, thick, x, y, z, tilt) => {
      const sh = new THREE.Shape(), N = 14;
      // shape x runs trailing edge -> leading edge so that after rotateY the leading edge faces +z
      for (let k = 0; k <= N; k++) { const u = k / N, yy = thick * 0.75 * Math.pow(Math.sin(Math.PI * u), 0.6) * (1 - 0.35 * u); const xx = u * chord - chord / 2; k ? sh.lineTo(xx, yy) : sh.moveTo(xx, yy); }
      for (let k = N - 1; k >= 1; k--) { const u = k / N, yy = -thick * 0.25 * Math.sin(Math.PI * u); sh.lineTo(u * chord - chord / 2, yy); }
      const g = new THREE.ExtrudeGeometry(sh, { depth: w, bevelEnabled: false });
      g.translate(0, 0, -w / 2); g.rotateY(-Math.PI / 2);
      return add(g, wingMat, x, y, z, tilt);
    };
    // Shaped endplate (thin extruded trapezoid in the side view).
    const endplate = (h, len, x, y, z) => {
      const sh = new THREE.Shape();
      sh.moveTo(len / 2, -h / 2); sh.lineTo(len / 2 - len * 0.15, h / 2); sh.lineTo(-len / 2, h / 2); sh.lineTo(-len / 2, -h / 2 + h * 0.25); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false });
      g.translate(0, 0, -0.006); g.rotateY(Math.PI / 2);
      return add(g, wingMat, x, y, z);
    };
    if (B.wing === "duck") plank(rear.hw * 1.7, 0.16, 0.04, 0, rear.yt + 0.03, rear.z - 0.05, -0.25);
    if (B.wing === "roof") plank(hw * 1.5, 0.3, 0.035, 0, C.roofY - (C.roofDrop || 0) - 0.02, roofZ - 0.12, -0.12);
    if (B.wing === "tall" || B.wing === "twin") {
      const w = at(0.95);
      for (const s of [1, -1]) add(new THREE.BoxGeometry(0.04, 0.26, 0.12), M.dark, s * w.hw * 0.7, w.yt + 0.13, w.z);
      plank(w.hw * 1.85, 0.3, 0.035, 0, w.yt + 0.27, w.z - 0.03, -0.1);
      for (const s of [1, -1]) endplate(0.14, 0.34, s * w.hw * 0.93, w.yt + 0.25, w.z - 0.03);
      if (B.wing === "twin") plank(w.hw * 1.6, 0.18, 0.03, 0, w.yt + 0.14, w.z - 0.02, -0.15);
    }
    if (B.wing === "gb") {
      const w = at(0.96);
      for (const s of [1, -1]) endplate(0.24, 0.42, s * w.hw * 0.98, w.yt + 0.12, w.z - 0.1);
      plank(w.hw * 1.96, 0.42, 0.04, 0, w.yt + 0.19, w.z - 0.1, -0.08);
      add(new THREE.BoxGeometry(hw * 1.7, 0.04, 0.16), M.dark, 0, at(0).yb + 0.01, L / 2 - 0.03);
    }
    if (B.wing === "r1") {
      const w = at(0.97);
      for (const s of [1, -1]) {
        endplate(0.4, 0.56, s * w.hw * 1.0, w.yt + 0.25, w.z - 0.13);
        // swan-neck mounts
        const neck = new THREE.Shape(); neck.moveTo(0.04, 0); neck.quadraticCurveTo(0.1, 0.2, -0.02, 0.36); neck.lineTo(-0.08, 0.36); neck.quadraticCurveTo(0.03, 0.2, -0.03, 0); neck.closePath();
        const ng = new THREE.ExtrudeGeometry(neck, { depth: 0.02, bevelEnabled: false }); ng.translate(0, 0, -0.01); ng.rotateY(Math.PI / 2);
        add(ng, M.dark, s * w.hw * 0.42, w.yt, w.z - 0.04);
      }
      plank(w.hw * 2.0, 0.42, 0.04, 0, w.yt + 0.38, w.z - 0.14, -0.12);
      plank(w.hw * 1.9, 0.2, 0.03, 0, w.yt + 0.26, w.z - 0.1, -0.3);
      // front splitter and dive planes
      const fr = at(0.01);
      add(new THREE.BoxGeometry(hw * 1.9, 0.03, 0.22), M.dark, 0, fr.yb + 0.0, L / 2 - 0.02);
      for (const s of [1, -1]) add(new THREE.BoxGeometry(0.16, 0.02, 0.18), M.dark, s * (fr.hw - 0.05), fr.yb + 0.16, L / 2 - 0.08, 0, s * 0.3, s * 0.25);
      // diffuser
      add(new THREE.BoxGeometry(hw * 1.5, 0.12, 0.25), M.dark, 0, w.yb + 0.08, w.z - 0.05);
    }
    // louvred bonnet vents (Group B onwards)
    if ((car.cls === "GB" || car.cls === "WRC" || car.cls === "R1") && B.lamps !== "pod4") {
      const ventTex = canvasTexture("louvre2", 64, 64, (x, w, h) => { x.fillStyle = "#030304"; x.fillRect(0, 0, w, h); x.fillStyle = "#16181b"; for (let j = 5; j < h - 3; j += 8) x.fillRect(5, j, w - 10, 3); x.strokeStyle = "#0c0d0f"; x.lineWidth = 4; x.strokeRect(2, 2, w - 4, h - 4); });
      const vm = new THREE.MeshStandardMaterial({ map: ventTex, roughness: 0.85, metalness: 0, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -3 });
      const v = at(Math.max(0.05, B.cab.t0 - 0.09)), v0 = at(Math.max(0.02, B.cab.t0 - 0.15)), sl = Math.atan2(v.yt - v0.yt, v0.z - v.z);
      for (const sd of [1, -1]) {
        const m = add(new THREE.PlaneGeometry(0.2, 0.22), vm, sd * v.hw * 0.48, v.yt + 0.006, v.z, -Math.PI / 2 + sl);
      }
    }
    if (B.scoop) {
      if (car.cls === "R1") add(new THREE.BoxGeometry(0.3, 0.05, 0.34), this.solid, 0, C.roofY + 0.02, L / 2 - (C.r0 + 0.06) * L, 0.06);
      else {
        // tapered bonnet intake: tall open mouth at the front, fairing back into the bonnet
        const h = at(0.15), h2 = at(0.08), slope = Math.atan2(h.yt - h2.yt, h2.z - h.z);
        const sh = new THREE.Shape(); sh.moveTo(0.19, 0); sh.lineTo(0.19, 0.065); sh.quadraticCurveTo(0.0, 0.07, -0.19, 0.0); sh.closePath();
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.4, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
        g.translate(0, 0, -0.2); g.rotateY(-Math.PI / 2);
        const m = add(g, this.solid, 0, h.yt - 0.012, h.z, slope);
        add(new THREE.BoxGeometry(0.36, 0.045, 0.01), M.dark, 0, h.yt + 0.03, h.z + 0.192, slope);
      }
    }
  }

  // x of the body side at station t and height y (includes the rolled-out arches).
  sideX(t, y) {
    const B = this.car.body, [hwF, yb, yt] = sampleProfile(profileOf(B), t), z = zOf(t, B.L, endR(B));
    const fy = clamp((y - yb) / (yt - yb), 0, 1);
    return hwF * B.W / 2 * 0.997 + this.flareW * this.swell(z) * smoothstep(0.02, 0.18, fy) * (1 - smoothstep(0.7, 0.93, fy));
  }

  // A decal that follows the body side: real size in metres, its own canvas at the same aspect, so nothing stretches.
  sideDecal(tex, sd, tC, yC, wM, hM) {
    const B = this.car.body, L = B.L, er = endR(B), zc = zOf(tC, L, er), nx = 14, ny = 6, pos = [], uv = [], idx = [];
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const u = ix / nx, v = iy / ny, z = zc + (sd > 0 ? 0.5 - u : u - 0.5) * wM, y = yC + (v - 0.5) * hM;
      const t = ((L / 2 - er) - z) / (L - 2 * er);
      pos.push(sd * (this.sideX(t, y) + 0.003), y, z); uv.push(u, v);
    }
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) { const a = iy * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, alphaTest: 0.35, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.08, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    addDirt(m, this.dirt, 0.9);
    const mesh = new THREE.Mesh(g, m);
    this.decals.add(mesh);
    return mesh;
  }

  // Door number, sponsor lettering and stickers placed in defined zones (door, front wing, rear quarter).
  buildDecals(livery) {
    if (this.decals) { this.decals.traverse(o => { if (o.isMesh) { if (!o.userData.shared) o.geometry.dispose(); o.material.dispose(); } }); this.body.remove(this.decals); }
    this.decals = new THREE.Group();
    this.body.add(this.decals);
    if (this.kit) return this.buildKitDecals(livery);
    const car = this.car, B = car.body, C = B.cab, L = B.L, er = endR(B), len = L - 2 * er;
    const classic = car.cls === "H" || car.cls === "G4", num = String(livery.number);
    const sponsorA = SPONSORS[hashStr(car.id) % SPONSORS.length], sponsorB = SPONSORS[(hashStr(car.id) >>> 3) % SPONSORS.length];
    const st = t => { const [hwF, yb, yt] = sampleProfile(profileOf(B), t); return { yb, yt }; };
    const mid = cabinStations(C).mid, tD0 = C.t0 + 0.035, tD1 = mid + 0.02, tDc = (tD0 + tD1) / 2, doorLen = (tD1 - tD0) * len;
    const pc = st(tDc), ySill = pc.yb + (pc.yt - pc.yb) * 0.16, yBelt = pc.yt - 0.05, avail = yBelt - ySill;
    const archTop = B.wheelR * 2 + 0.07;
    const design = LIVERY_BY_ID[livery.design] || LIVERY_BY_ID.solid;
    const tex = (key, wM, hM, draw) => { const W = 512, H = Math.max(24, Math.round(512 * hM / wM)); return canvasTexture("dec:" + key + ":" + H, W, H, draw); };
    const fitText = (x, txt, w, h, maxH, font) => {
      x.font = font.replace("#", Math.round(maxH)); const tw = x.measureText(txt).width;
      x.save(); x.translate(w / 2, h / 2 + maxH * 0.04); x.scale(Math.min(1, w * 0.88 / tw), 1); x.fillText(txt, 0, 0); x.restore();
    };
    const both = (t, wM, hM, tC, yC) => { for (const sd of [1, -1]) this.sideDecal(t, sd, tC, yC, wM, hM); };
    // door number
    if (classic) {
      const w = Math.min(0.5, doorLen * 0.62), h = Math.min(0.38, avail * 0.84);
      const t = tex("panel" + num, w, h, (x, W, H) => {
        x.fillStyle = "#f3efe2"; x.beginPath(); x.roundRect(2, 2, W - 4, H - 4, H * 0.05); x.fill();
        x.fillStyle = "#1b1b1b"; x.textAlign = "center"; x.textBaseline = "middle";
        fitText(x, num, W, H, H * 0.8, "bold #px 'Arial Narrow', Arial, sans-serif");
      });
      both(t, w, h, tDc, (ySill + yBelt) / 2 + 0.005);
    } else {
      const w = Math.min(0.3, doorLen * 0.4), h = w * 0.72;
      const t = tex("board" + num, w, h, (x, W, H) => {
        x.fillStyle = "#151515"; x.beginPath(); x.roundRect(0, 0, W, H, H * 0.08); x.fill();
        x.fillStyle = "#f7f7f2"; x.beginPath(); x.roundRect(W * 0.03, H * 0.04, W * 0.94, H * 0.92, H * 0.06); x.fill();
        x.fillStyle = "#121212"; x.textAlign = "center"; x.textBaseline = "middle";
        fitText(x, num, W, H, H * 0.74, "bold #px Arial, sans-serif");
      });
      both(t, w, h, tDc, yBelt - h / 2 - 0.03);
      // sponsor lettering along the lower door, with an outline so it reads on any paint
      const sw = Math.min(0.72, doorLen * 0.84), sh = Math.min(0.12, avail * 0.3);
      const dark = design.dark || isDark(design.id === "split" || design.id === "diagonal" ? livery.colors[1] : livery.colors[0]);
      const ts = tex("spon" + sponsorA + (dark ? "w" : "b"), sw, sh, (x, W, H) => {
        x.textAlign = "center"; x.textBaseline = "middle"; x.lineJoin = "round";
        x.font = "italic 900 " + Math.round(H * 0.78) + "px Arial, sans-serif";
        const tw = x.measureText(sponsorA).width; x.save(); x.translate(W / 2, H / 2 + H * 0.04); x.scale(Math.min(1, W * 0.94 / tw), 1);
        x.lineWidth = H * 0.1; x.strokeStyle = dark ? "#111" : "#fff"; x.strokeText(sponsorA, 0, 0);
        x.fillStyle = dark ? "#fff" : "#141414"; x.fillText(sponsorA, 0, 0); x.restore();
      });
      both(ts, sw, sh, tDc, ySill + sh / 2 + 0.03);
    }
    // stickers on the front wing, behind the front arch
    const tW0 = (B.axF + B.wheelR + 0.07) / L, tW1 = tD0 - 0.012, wingLen = (tW1 - tW0) * len;
    if (wingLen > 0.12) {
      const pw = st((tW0 + tW1) / 2), yTop = pw.yt - 0.07, w = Math.min(0.24, wingLen * 0.88), h = w * 0.27;
      const s1 = tex("stk1" + sponsorB, w, h, (x, W, H) => {
        x.fillStyle = "#f4f4f0"; x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, H * 0.18); x.fill();
        x.strokeStyle = "#c8141c"; x.lineWidth = H * 0.08; x.stroke();
        x.fillStyle = "#c8141c"; x.textAlign = "center"; x.textBaseline = "middle"; fitText(x, sponsorB, W, H, H * 0.58, "bold #px Arial, sans-serif");
      });
      both(s1, w, h, (tW0 + tW1) / 2, yTop - h / 2);
      const w2 = w * 0.86, h2 = w2 * 0.26, y2 = yTop - h - 0.015 - h2 / 2;
      if (y2 - h2 / 2 > archTop + 0.01) {
        const s2 = tex("stk2", w2, h2, (x, W, H) => {
          x.fillStyle = "#f2c418"; x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, H * 0.2); x.fill();
          x.fillStyle = "#151515"; x.textAlign = "center"; x.textBaseline = "middle"; fitText(x, "SUMMIT TYRES", W, H, H * 0.56, "bold #px Arial, sans-serif");
        });
        both(s2, w2, h2, (tW0 + tW1) / 2, y2);
      }
    }
    // flag sticker on classics, top front corner of the door
    if (classic) {
      const fw = 0.09, fh = 0.06, tf = tD0 + (fw / 2 + 0.03) / len;
      const tf2 = tex("flag", fw, fh, (x, W, H) => { const c = ["#1d3f9c", "#f4f4f0", "#c8141c"]; c.forEach((col, i) => { x.fillStyle = col; x.fillRect(i * W / 3, 0, W / 3 + 1, H); }); x.strokeStyle = "#222"; x.lineWidth = 3; x.strokeRect(1, 1, W - 2, H - 2); });
      both(tf2, fw, fh, tf, yBelt - fh / 2 - 0.02);
    }
    // rear quarter: event sticker
    const tQ0 = tD1 + 0.015, tQ1 = (B.axF + car.wheelbase - B.wheelR - 0.07) / L, qLen = (tQ1 - tQ0) * len;
    if (qLen > 0.14) {
      const pq = st((tQ0 + tQ1) / 2), w = Math.min(0.26, qLen * 0.85), h = w * 0.2;
      const s3 = tex("stk3", w, h, (x, W, H) => {
        x.fillStyle = "#121418"; x.beginPath(); x.roundRect(1, 1, W - 2, H - 2, H * 0.2); x.fill();
        x.fillStyle = "#f2f2f2"; x.textAlign = "center"; x.textBaseline = "middle"; fitText(x, "RALLY LEGENDS", W, H, H * 0.58, "italic 900 #px Arial, sans-serif");
      });
      both(s3, w, h, (tQ0 + tQ1) / 2, pq.yt - 0.07 - h / 2);
    }
  }

  // The little things that make it read as a real car: door handles in recessed dishes, wipers, antenna,
  // side repeaters, fuel cap, rear reflectors, arch mouldings, roof lip.
  addSmallDetails(car, zF, zR) {
    const B = car.body, C = B.cab, L = B.L, M = sharedMats(), er = endR(B), classic = car.cls === "H" || car.cls === "G4";
    const prof = profileOf(B);
    const st = t => { const [hwF, yb, yt] = sampleProfile(prof, t); return { hw: hwF * B.W / 2, yb, yt, z: zOf(t, L, er) }; };
    // x of the body side at station t and height y (includes the rolled-out arches)
    const sideX = (t, y) => this.sideX(t, y);
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); this.body.add(m); return m; };
    const mid = cabinStations(C).mid;
    // door handles
    const tH = mid - 0.035, pH = st(tH), yH = pH.yt - 0.1;
    for (const sd of [1, -1]) {
      const x = sd * sideX(tH, yH);
      const dish = add(new THREE.CircleGeometry(1, 20), M.rimDark, x + sd * 0.001, yH, pH.z, 0, sd * Math.PI / 2, 0); dish.scale.set(0.055, 0.03, 1);
      const hg = new THREE.CapsuleGeometry(0.009, 0.1, 4, 8); hg.rotateX(Math.PI / 2);
      add(hg, classic ? M.chrome : this.solid, x + sd * 0.012, yH + 0.004, pH.z);
      // key lock on classics
      if (classic) add(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10), M.chrome, x + sd * 0.004, yH, pH.z + 0.075, 0, 0, Math.PI / 2);
    }
    // side repeaters on the front wings
    const tR = clamp(B.axF / L + 0.1, 0.08, C.t0 - 0.01), pR = st(tR), yR = pR.yt - 0.09;
    for (const sd of [1, -1]) { const m = add(new THREE.SphereGeometry(1, 12, 8), M.amber, sd * sideX(tR, yR), yR, pR.z); m.scale.set(0.012, 0.016, 0.035); }
    // fuel filler (right rear quarter)
    const tF = Math.min(0.9, (C.t1 + 1) / 2 - 0.04), pF = st(tF), yF = pF.yt - 0.08;
    add(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 20), classic ? M.chrome : this.solid, -sideX(tF, yF) - 0.003, yF, pF.z, 0, 0, Math.PI / 2);
    // rear reflectors at the bumper corners
    const pB = st(1);
    for (const sd of [1, -1]) add(new THREE.BoxGeometry(0.06, 0.025, 0.01), M.tail, sd * (pB.hw - er * 1.1 - 0.05), pB.yb + 0.09, -L / 2 - 0.004);
    // windscreen wipers resting at the base of the screen
    const p0 = st(C.t0), p1 = st(C.r0), slope = Math.atan2(C.roofY - p0.yt, p0.z - p1.z);
    for (const xo of [0.22, -0.32]) {
      const arm = new THREE.BoxGeometry(0.5, 0.008, 0.012);
      add(arm, M.rimDark, xo * p0.hw, p0.yt + 0.035, p0.z - 0.04, 0, 0, 0.06).rotation.x = -slope * 0.15;
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.02, 8), M.rimDark, xo * p0.hw + 0.24, p0.yt + 0.02, p0.z - 0.02);
    }
    // whip antenna at the back of the roof
    const zA = zOf(Math.max(C.r0, C.r1 - 0.06), L, er), yA = C.roofY - (C.roofDrop || 0) * 0.9;
    add(new THREE.BoxGeometry(0.03, 0.02, 0.06), M.rimDark, -0.12, yA + 0.01, zA);
    const ant = new THREE.CylinderGeometry(0.002, 0.004, 0.5, 5); ant.translate(0, 0.25, 0);
    add(ant, M.rimDark, -0.12, yA + 0.015, zA, -0.25);
    // roof lip spoiler
    if (B.roofLip) {
      const zr = zOf(C.r1, L, er), yr = C.roofY - (C.roofDrop || 0);
      const sh = new THREE.Shape(); sh.moveTo(0.05, 0); sh.lineTo(-0.09, 0.012); sh.lineTo(-0.1, -0.006); sh.lineTo(0.05, -0.018); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: st(C.r1).hw * 2 * C.hwTop * 0.98, bevelEnabled: false });
      g.translate(0, 0, -st(C.r1).hw * C.hwTop * 0.98); g.rotateY(-Math.PI / 2);
      add(g, M.rimDark, 0, yr + 0.005, zr - 0.03);
    }
    // black wheel-arch mouldings that run into the sill
    if (B.archTrim) {
      const R = B.wheelR, ri = R + 0.055, ro = ri + 0.05;
      const sh = new THREE.Shape();
      sh.moveTo(ro, -0.04); sh.absarc(0, 0, ro, -0.04, Math.PI + 0.04, false); sh.lineTo(-ri, -0.03);
      sh.absarc(0, 0, ri, Math.PI, 0, true); sh.closePath();
      for (const z of [zF, zR]) for (const sd of [1, -1]) {
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 28 });
        g.rotateY(sd * Math.PI / 2);
        const t = clamp((L / 2 - er - z) / (L - 2 * er), 0, 1);
        add(g, classic ? M.chrome : M.plastic, sd * (sideX(t, R + ri) - 0.004), R, z);
      }
    }
    // classic rally kit: bonnet rally plate, sump guard, indicators under the headlamps
    if (classic) {
      // plate goes behind a bonnet lamp bar if there is one
      const tp = B.lamps === "pod4" ? Math.max(0.1, C.t0 * 0.72) : Math.max(0.04, C.t0 * 0.35);
      const pb = st(tp), pb0 = st(tp - 0.03), sl = Math.atan2(pb.yt - pb0.yt, pb0.z - pb.z);
      const tex = canvasTexture("bonnetplate" + this.plateNo, 256, 112, (x, w, h) => {
        x.fillStyle = "#101010"; x.fillRect(0, 0, w, h); x.strokeStyle = "#f2f2f2"; x.lineWidth = 4; x.strokeRect(4, 4, w - 8, h - 8);
        x.fillStyle = "#f2f2f2"; x.font = "bold 40px Arial, sans-serif"; x.textAlign = "center"; x.textBaseline = "middle";
        x.fillText("RL " + String(this.plateNo).padStart(2, "0"), w / 2, 36); x.fillText(String(1960 + (this.plateNo % 9)) + "M", w / 2, 80);
      });
      add(new THREE.PlaneGeometry(0.26, 0.16), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -3 }), 0, pb.yt + 0.012, pb.z, -Math.PI / 2 + sl);
      const f = st(0), faceHW = Math.max(0.2, f.hw - er * 1.1);
      const guard = add(new THREE.BoxGeometry(faceHW * 1.3, 0.005, 0.22), M.chrome, 0, f.yb - 0.05, L / 2 - 0.16, 0.32);
      guard.material = M.alloy;
      if (B.lights === "round") for (const sd of [1, -1]) {
        const m = add(new THREE.SphereGeometry(1, 14, 10), M.amber, sd * (faceHW - 0.12), f.yb + (f.yt - f.yb) * 0.32, L / 2 + 0.005);
        m.scale.set(0.028, 0.02, 0.012);
      }
    }
    // roof rack with a spare wheel (Monte Carlo classic)
    if (B.roofRack) {
      const r0 = C.r0 + 0.02, r1 = C.r1 - 0.03, y = C.roofY + 0.09, hw = st((r0 + r1) / 2).hw * C.hwTop * 0.92;
      const zA = zOf(r0, L, er), zB = zOf(r1, L, er);
      const rackMat = new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.35, metalness: 0.3 });
      const tube = (a, b, rad = 0.011) => {
        const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 8), rackMat);
        m.position.copy(va).add(vb).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
        this.body.add(m);
      };
      for (const sd of [1, -1]) { tube([sd * hw, y, zA], [sd * hw, y, zB]); tube([sd * hw, y, zA], [sd * (hw + 0.02), C.roofY - 0.01, zA + 0.03]); tube([sd * hw, y, zB], [sd * (hw + 0.02), C.roofY - 0.01, zB - 0.03]); }
      for (let i = 0; i <= 4; i++) { const z = lerp(zA, zB, i / 4); tube([hw, y, z], [-hw, y, z]); }
      // front hoop
      tube([hw, y, zA], [hw * 0.7, y + 0.12, zA + 0.02]); tube([-hw, y, zA], [-hw * 0.7, y + 0.12, zA + 0.02]); tube([hw * 0.7, y + 0.12, zA + 0.02], [-hw * 0.7, y + 0.12, zA + 0.02]);
      const spare = new THREE.Mesh(tireGeometry(B.wheelR, B.wheelW, RIM_RATIO[car.cls]), M.tire);
      spare.rotation.z = Math.PI / 2; spare.position.set(0, y + B.wheelW / 2 + 0.012, lerp(zA, zB, 0.62));
      this.body.add(spare); this.spare = spare;
      const hubc = new THREE.Mesh(new THREE.CylinderGeometry(B.wheelR * 0.55, B.wheelR * 0.55, B.wheelW * 0.8, 20), this.rimMat);
      hubc.position.copy(spare.position); this.body.add(hubc);
    }
  }

  // Dashboard, bucket seats, roll cage and the crew (driver on the left, co-driver with pace notes).
  addInterior(car) {
    const B = car.body, C = B.cab, L = B.L, hwMax = B.W / 2, M = sharedMats();
    const zAt = t => zOf(t, L, endR(B));
    const { mid } = cabinStations(C);
    const [hwF, , yt] = sampleProfile(profileOf(B), mid);
    const belt = yt - 0.02, inner = hwF * hwMax * C.hwBot - 0.07, innerTop = hwF * hwMax * C.hwTop - 0.07;
    const g = new THREE.Group();
    const box = (w, h, d, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.x = rx; g.add(m); return m; };
    const bar = (a, b, r = 0.022) => {
      const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), len = va.distanceTo(vb);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), M.cage);
      m.position.copy(va).add(vb).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
      g.add(m);
    };
    // dashboard under the screen
    const zDash = zAt(C.r0) + 0.02;
    box(inner * 2, 0.14, 0.32, M.trim, 0, belt + 0.02, zDash - 0.06);
    // crew
    const zSeat = zAt(mid) - 0.02;
    const helmR = 0.12;
    const hip = Math.min(belt - 0.22, C.roofY - 0.06 - helmR * 2 - 0.06 - 0.32);
    const torso = clamp(C.roofY - 0.06 - helmR * 2 - 0.05 - hip, 0.3, 0.52);
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.3, metalness: 0.1 });
    this.helmetMat = helmetMat;
    for (const side of [1, -1]) {
      const x = side * inner * 0.5;
      box(0.44, torso + 0.25, 0.07, M.trim, x, hip + (torso + 0.25) / 2 - 0.05, zSeat - 0.2, 0.18);
      box(0.08, torso * 0.8, 0.3, M.trim, x - 0.2, hip + torso * 0.35, zSeat - 0.08);
      box(0.08, torso * 0.8, 0.3, M.trim, x + 0.2, hip + torso * 0.35, zSeat - 0.08);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, Math.max(0.05, torso - 0.3), 4, 10), M.suit);
      body.position.set(x, hip + torso / 2, zSeat - 0.1); body.rotation.x = 0.16; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(helmR, 16, 12), helmetMat);
      head.position.set(x, hip + torso + helmR * 0.85, zSeat - 0.05); g.add(head);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(helmR * 1.02, 16, 8, -0.9, 1.8, 1.1, 0.7), M.visor);
      visor.position.copy(head.position); g.add(visor);
      if (side > 0) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 20), M.trim);
        wheel.position.set(x, hip + torso * 0.72, zSeat + 0.36); wheel.rotation.x = -0.35; g.add(wheel);
        bar([x - 0.14, hip + torso * 0.8, zSeat - 0.02], [x - 0.12, hip + torso * 0.7, zSeat + 0.33], 0.04);
        bar([x + 0.14, hip + torso * 0.8, zSeat - 0.02], [x + 0.12, hip + torso * 0.7, zSeat + 0.33], 0.04);
      } else {
        box(0.2, 0.02, 0.15, new THREE.MeshStandardMaterial({ color: 0xf4f1e6, roughness: 0.9 }), x, hip + torso * 0.45, zSeat + 0.22, -0.6);
      }
    }
    // roll cage: main hoop, A-pillar bars, roof bars, door bars
    const top = C.roofY - 0.05, zA = zAt(C.r0) - 0.06, zM = zAt(mid) - 0.28, zR = zAt(C.r1) + 0.05;
    for (const sd of [1, -1]) {
      bar([sd * inner, belt - 0.05, zM], [sd * innerTop, top, zM]);
      bar([sd * inner, belt - 0.05, zA + 0.15], [sd * innerTop, top, zA]);
      bar([sd * innerTop, top, zA], [sd * innerTop, top, zR]);
      bar([sd * inner, belt - 0.05, zM], [sd * inner, belt + 0.02, zA + 0.15]);
    }
    bar([innerTop, top, zM], [-innerTop, top, zM]);
    bar([innerTop, top, zA], [-innerTop, top, zA]);
    bar([innerTop, top, zM], [-innerTop, belt - 0.05, zR]);
    g.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this.body.add(g);
    this.interior = g;
  }

  // Tyre upgrade level 0-6 (Stock..Legend).
  setTyres(level = 0) {
    const l = Math.max(0, Math.min(TYRE_LOOK.length - 1, level | 0));
    if (this.tyreLevel === l) return;
    this.tyreLevel = l;
    const mat = tyreMaterial(l);
    for (const t of this.tires) { t.material = mat; t.scale.x = TYRE_LOOK[l].width; }
    if (this.spare) this.spare.material = mat;
  }
  // Brake upgrade level 0-6 (Stock..Legend).
  setBrakes(level = 0) {
    const l = Math.max(0, Math.min(BRAKE_LOOK.length - 1, level | 0));
    if (this.brakeLevel === l) return;
    this.brakeLevel = l;
    const look = BRAKE_LOOK[l], mat = discMaterial(look.face);
    for (const d of this.discs) { d.material = mat; d.scale.set(1, look.disc, look.disc); }
    for (const c of this.calipers) { c.scale.set(1, look.cal, look.cal); c.position.copy(c.userData.base).multiply(new THREE.Vector3(1, look.disc, look.disc)); }
    this.caliperMat.color.set(look.color || this.classCaliper);
    this.caliperMat.emissive.set(look.color || this.classCaliper); this.caliperMat.emissiveIntensity = 0.22; // visible through the spokes
    this.caliperMat.metalness = look.legend ? 0.55 : 0.2; this.caliperMat.roughness = look.legend ? 0.3 : 0.4;
  }
  setLivery(livery, rimId) {
    if (this.liv) { this.liv.tex.dispose(); this.liv.roofTex.dispose(); }
    this.liv = paintLivery(livery, this.car, this.kit);
    if (this.kit) this.liv.tex.channel = 1; // kit shells carry the livery mapping in their second UV set
    this.paint.map = this.liv.tex; this.paint.needsUpdate = true;
    this.roofMat.map = this.liv.roofTex; this.roofMat.needsUpdate = true;
    const design = LIVERY_BY_ID[livery.design] || LIVERY_BY_ID.solid;
    this.solid.color.set(design.id === "carbon" ? "#1d1d20" : livery.colors[0]);
    this.accent.color.set(design.id === "solid" ? "#1a1a1a" : livery.colors[design.id === "roof" ? 2 : 1]);
    this.rimMat.color.set((RIM_BY_ID[rimId] || RIM_BY_ID.silver).color);
    this.buildDecals(livery);
    if (this.helmetMat) this.helmetMat.color.set(design.id === "solid" ? "#f2f2f2" : livery.colors[1]);
    if (this.gutterMat) this.gutterMat.color.set(livery.colors[design.roof || 0]);
    this.livery = livery;
  }

  makeGhost() {
    const gm = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.28, depthWrite: false });
    this.root.traverse(o => { if (o.isMesh) { o.material = gm; o.castShadow = false; o.receiveShadow = false; } });
    this.blob.visible = false;
  }

  setLights(on) {
    this.lightsOn = on;
    const M = sharedMats();
    M.lens.emissiveIntensity = on ? 3.2 : 0;
    M.reflector.emissiveIntensity = on ? 1.6 : 0.06;
    M.bulb.emissiveIntensity = on ? 8 : 0.15;
    for (const m of this.lampMats || []) m.emissiveIntensity = on ? 3 : m.userData.drl ? 1 : 0;
    for (const m of this.headKit || []) m.emissiveIntensity = on ? 2.4 : 0;
    this.setBrake(0);
  }

  // ---------- lamps (body-local, facing +z) ----------
  // Classic round lamp: housing bucket, chrome parabolic reflector, bulb, domed fluted glass, bezel ring.
  roundLamp(r, x, y, z, opts = {}) {
    const M = sharedMats(), g = new THREE.Group(), depth = opts.depth || r * 0.9;
    const bucket = new THREE.CylinderGeometry(r * 1.06, r * 0.92, depth, 28, 1, true); bucket.rotateX(Math.PI / 2); bucket.translate(0, 0, -depth / 2);
    g.add(new THREE.Mesh(bucket, opts.housing || M.dark));
    const prof = [];
    for (let i = 0; i <= 10; i++) { const rr = r * (0.14 + 0.86 * i / 10); prof.push(new THREE.Vector2(rr, -depth * 0.85 * (1 - (rr / r) ** 2))); }
    const bowl = new THREE.LatheGeometry(prof, 28); bowl.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(bowl, M.reflector));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 12, 8), M.bulb); bulb.position.z = -depth * 0.45; g.add(bulb);
    const shield = new THREE.Mesh(new THREE.CircleGeometry(r * 0.17, 16), M.reflector); shield.position.z = -depth * 0.3; g.add(shield);
    const lens = new THREE.SphereGeometry(r * 1.6, 28, 6, 0, Math.PI * 2, 0, Math.asin(1 / 1.6)); lens.rotateX(Math.PI / 2); lens.translate(0, 0, -r * 1.6 * Math.cos(Math.asin(1 / 1.6)));
    g.add(new THREE.Mesh(lens, M.lensGlass));
    const bez = new THREE.TorusGeometry(r * 1.02, r * 0.09, 8, 28); g.add(new THREE.Mesh(bez, opts.bezel || M.chrome));
    g.position.set(x, y, z);
    if (opts.ry) g.rotation.y = opts.ry;
    this.body.add(g);
    return g;
  }
  // 80s/90s rectangular unit: recessed housing, twin reflectors (main + high beam), clear prismatic cover, chrome trim.
  rectLamp(w, h, x, y, z) {
    const M = sharedMats(), g = new THREE.Group(), d = 0.06;
    const box = new THREE.BoxGeometry(w, h, d); box.translate(0, 0, -d / 2);
    g.add(new THREE.Mesh(box, [M.dark, M.dark, M.dark, M.dark, M.reflector, M.dark]));
    for (const [cx, rr] of [[-w * 0.24, h * 0.42], [w * 0.26, h * 0.36]]) {
      const prof = [];
      for (let i = 0; i <= 8; i++) { const q = rr * (0.15 + 0.85 * i / 8); prof.push(new THREE.Vector2(q, -d * 0.6 * (1 - (q / rr) ** 2))); }
      const bowl = new THREE.LatheGeometry(prof, 20); bowl.rotateX(Math.PI / 2); bowl.translate(cx, 0, 0.002);
      g.add(new THREE.Mesh(bowl, M.reflector));
      const b = new THREE.Mesh(new THREE.SphereGeometry(rr * 0.16, 10, 6), M.bulb); b.position.set(cx, 0, -d * 0.25); g.add(b);
    }
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.lensGlass); cover.position.z = 0.006; g.add(cover);
    for (const [bw, bh, bx, by] of [[w + 0.02, 0.012, 0, h / 2 + 0.006], [w + 0.02, 0.012, 0, -h / 2 - 0.006], [0.012, h, -w / 2 - 0.006, 0], [0.012, h, w / 2 + 0.006, 0]]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), M.chrome); t.position.set(bx, by, 0.0); g.add(t);
    }
    g.position.set(x, y, z);
    this.body.add(g);
    return g;
  }
  // Flush headlamp unit projected onto the body surface (follows the nose and wraps the corner).
  // kind "slim": modern swept unit with projectors, LED signature and indicator; "rect": 80s/90s twin-reflector unit.
  conformLamp(kind, sd, x0, x1, yIn, yOut, hIn, hOut) {
    const L = this.car.body.L, nx = 18, ny = 6, ray = new THREE.Raycaster(), dir = new THREE.Vector3(0, 0, -1);
    this.bodyMesh.updateMatrixWorld(true);
    const pos = [], uv = [], ok = [];
    for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) {
      const u = ix / nx, v = iy / ny, x = sd * lerp(x0, x1, u), y = lerp(yIn, yOut, u) + (v - 0.5) * lerp(hIn, hOut, u);
      ray.set(new THREE.Vector3(x, y, L / 2 + 1), dir);
      const hit = ray.intersectObject(this.bodyMesh, false)[0];
      if (hit) { const n = hit.face.normal; pos.push(hit.point.x + n.x * 0.004, hit.point.y + n.y * 0.004, hit.point.z + n.z * 0.004); ok.push(1); }
      else { pos.push(x, y, L / 2 - 0.2); ok.push(0); }
      uv.push(u, v);
    }
    const idx = [];
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
      const a = iy * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1;
      if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;
      if (sd > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const { map, glow } = lampTextures(kind);
    const m = new THREE.MeshPhysicalMaterial({ map, emissive: 0xffffff, emissiveMap: glow, emissiveIntensity: kind === "slim" ? 1 : 0, transparent: true, alphaTest: 0.4,
      roughness: 0.05, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    m.userData.drl = kind === "slim";
    (this.lampMats || (this.lampMats = [])).push(m);
    const mesh = new THREE.Mesh(g, m);
    this.body.add(mesh);
    return mesh;
  }

  // Modern unit: dark housing, projector lens with chrome ring, LED daytime-running light, clear cover.
  slimLamp(w, h, x, y, z, side) {
    const M = sharedMats(), g = new THREE.Group(), d = 0.07;
    const box = new THREE.BoxGeometry(w, h, d); box.translate(0, 0, -d / 2);
    g.add(new THREE.Mesh(box, [M.dark, M.dark, M.dark, M.dark, M.dark, M.dark]));
    const proj = new THREE.Mesh(new THREE.SphereGeometry(h * 0.32, 18, 12), M.projector); proj.position.set(-side * w * 0.22, -h * 0.05, -0.01); g.add(proj);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(h * 0.34, h * 0.05, 6, 20), M.chrome); ring.position.set(-side * w * 0.22, -h * 0.05, 0.0); g.add(ring);
    const hi = new THREE.Mesh(new THREE.CircleGeometry(h * 0.24, 18), M.reflector); hi.position.set(side * w * 0.12, -h * 0.05, -0.012); g.add(hi);
    const drl1 = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.09, 0.01), M.drl); drl1.position.set(0, h * 0.36, 0.002); g.add(drl1);
    const drl2 = new THREE.Mesh(new THREE.BoxGeometry(h * 0.09, h * 0.55, 0.01), M.drl); drl2.position.set(side * w * 0.41, h * 0.1, 0.002); g.add(drl2);
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(w, h), M.lensGlass); cover.position.z = 0.008; g.add(cover);
    g.position.set(x, y, z);
    g.rotation.set(0, side * 0.12, side * -0.05);
    this.body.add(g);
    return g;
  }

  // Pose from the vehicle simulation.
  update(veh, dt) {
    this.root.position.set(veh.x, veh.y, veh.z);
    this.root.rotation.set(0, veh.heading, 0);
    if (!veh.airborne) { this.gp = veh.groundPitch; this.gr = veh.groundRoll; }
    this.chassis.rotation.set(-(this.gp || 0) - veh.airPitch, 0, this.gr || 0, "YXZ");
    this.body.rotation.set(veh.pitchV, 0, veh.rollV);
    this.body.position.y = veh.airborne ? 0.04 : -Math.abs(veh.pitchV) * 0.4;
    const V = this.vis;
    // Wheels follow the ground under each one, drooping in the air.
    const cp = Math.cos(this.gp || 0), baseY = veh.y;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], vw = veh.wheels[i];
      const target = veh.airborne ? V.wheelR - 0.1 : V.wheelR + clamp((vw.gy - baseY) * cp - this.planeOffset(i, veh), -0.1, 0.12);
      w.pivot.position.y = lerp(w.pivot.position.y, target, Math.min(1, dt * 25));
      w.pivot.rotation.y = w.front ? veh.delta || 0 : 0;
      w.spinner.rotation.x = vw.rot;
    }
    this.setBrake(veh.brake);
    this.blob.visible = !veh.airborne;
  }
  planeOffset(i, veh) {
    // height of the chassis plane at wheel i relative to the car origin
    const sp = veh.spec, along = i < 2 ? sp.a : -sp.b, side = i % 2 === 0 ? sp.track / 2 : -sp.track / 2;
    return along * Math.sin(this.gp || 0) + side * Math.sin(this.gr || 0);
  }
  setBrake(b) {
    sharedMats().tail.emissiveIntensity = 0.35 + b * 2.5 + (this.lightsOn ? 0.6 : 0);
    for (const m of this.brakeKit || []) m.emissiveIntensity = 0.15 + b * 2.2 + (this.lightsOn ? 0.5 : 0);
  }
  setDirt(amount, color) { this.dirt.uDirt.value = amount; if (color) this.dirt.uDirtCol.value.set(color); }

  exhaustWorld(out) {
    return this.body.localToWorld(out.copy(this.exhaustLocal));
  }
  dispose() {
    this.root.traverse(o => { if (o.isMesh && !o.userData.shared) o.geometry.dispose(); });
    if (this.liv) { this.liv.tex.dispose(); this.liv.roofTex.dispose(); }
    [this.paint, this.roofMat, this.solid, this.accent, this.rimMat, ...(this.headKit || []), ...(this.brakeKit || [])].forEach(m => m.dispose());
  }
}

let _blob = null;
function blobTexture() {
  if (_blob) return _blob;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, "rgba(0,0,0,0.75)"); g.addColorStop(0.6, "rgba(0,0,0,0.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}

// Minimal geometry merge (positions, normals, uvs; all inputs indexed or not).
export function mergeGeos(geos) {
  let total = 0;
  const parts = geos.map(g => { const gg = g.index ? g.toNonIndexed() : g; total += gg.attributes.position.count; return gg; });
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}
