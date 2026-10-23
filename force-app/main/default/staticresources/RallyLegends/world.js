// Stage scenery: sky, lighting, terrain, road, roadside walls, vegetation, crowds and props.
import * as THREE from "./three.module.min.js";
import { makeRng, makeNoise, clamp, lerp, smoothstep, TAU } from "./util.js";
import { STEP, TUNNEL_APPROACH, tunnelCutHeight } from "./track.js";

export const QUALITY = {
  low: { pr: 0.75, shadow: 0, cell: 9, trees: 0.3, grass: 0, draw: 650, aa: false, far: 1 },
  medium: { pr: 1, shadow: 1024, cell: 7, trees: 0.55, grass: 0.5, draw: 950, aa: true, far: 1 },
  high: { pr: 1.5, shadow: 2048, cell: 5.5, trees: 1, grass: 1, draw: 1300, aa: true, far: 1 },
  ultra: { pr: 2, shadow: 4096, cell: 4.5, trees: 1.4, grass: 1.6, draw: 1800, aa: true, far: 1 }
};

const C = h => new THREE.Color(h);

// ---------- conditions (time of day + weather) ----------
export function conditions(loc, def) {
  const P = loc.pal;
  const k = {
    zenith: C(P.zenith), horizon: C(P.horizon), sun: C(P.sun), sunElev: P.sunElev, sunAz: P.sunAz, fog: P.fog,
    exposure: P.exposure, sunI: 3.0, hemiI: 0.75, envI: 0.9, clouds: 0.32, cloudCol: C("#ffffff"), night: false,
    wet: def.weather === "rain", rain: def.weather === "rain", snowfall: def.weather === "snow", time: def.time, weather: def.weather
  };
  if (def.time === "dusk") {
    k.zenith = C("#33467c"); k.horizon = C("#f2a66c").lerp(C(P.horizon), 0.2); k.sun = C("#ffae6b"); k.sunElev = 5;
    k.sunI = 2.3; k.hemiI = 0.5; k.envI = 0.7; k.clouds = 0.45; k.cloudCol = C("#ffc59f");
  } else if (def.time === "dawn") {
    k.zenith = C("#62749e"); k.horizon = C("#f1c6a8"); k.sun = C("#ffd6aa"); k.sunElev = 4; k.sunI = 1.9; k.hemiI = 0.55; k.envI = 0.7; k.cloudCol = C("#ffe0c8");
  } else if (def.time === "night") {
    k.zenith = C("#03060e"); k.horizon = C("#0f1b2e"); k.sun = C("#a9c0ff"); k.sunElev = 38; k.sunI = 0.32; k.hemiI = 0.16; k.envI = 0.18;
    k.night = true; k.fog = Math.max(k.fog, 0.0016); k.clouds = 0.2; k.cloudCol = C("#3a4660");
  }
  if (def.weather === "overcast") {
    k.zenith.lerp(C("#8a95a2"), 0.65); k.horizon.lerp(C("#c4c9ce"), 0.6); k.sunI *= 0.42; k.hemiI *= 1.25; k.clouds = 0.9; k.fog *= 1.4; k.cloudCol = C("#d6dadf");
  } else if (def.weather === "rain") {
    k.zenith = C("#59636f"); k.horizon = C("#a3abb3"); k.sunI *= 0.28; k.hemiI *= 1.2; k.clouds = 1; k.fog *= 2.3; k.cloudCol = C("#8f979f"); k.envI *= 0.8;
  } else if (def.weather === "fog") {
    k.zenith = C("#a9b2bb"); k.horizon = C("#c9ced3"); k.sunI *= 0.4; k.clouds = 1; k.fog = 0.0075; k.cloudCol = C("#c9ced3");
  } else if (def.weather === "snow") {
    k.zenith = C("#8e9aa9"); k.horizon = C("#d4dae1"); k.sunI *= 0.45; k.clouds = 0.95; k.fog *= 2.6; k.cloudCol = C("#dfe4ea");
  }
  const el = k.sunElev * Math.PI / 180, az = k.sunAz * Math.PI / 180;
  k.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  k.fogColor = k.horizon.clone().lerp(k.zenith, 0.12);
  return k;
}

// ---------- procedural textures ----------
function tileNoise(size, octaves, seed) {
  const r = makeRng(seed), out = new Float32Array(size * size);
  let amp = 1, norm = 0;
  for (const cells of octaves) {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const fx = x / size * cells, fy = y / size * cells, ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = g[iy % cells * cells + ix % cells], b = g[iy % cells * cells + (ix + 1) % cells];
      const c = g[(iy + 1) % cells * cells + ix % cells], d = g[(iy + 1) % cells * cells + (ix + 1) % cells];
      out[y * size + x] += lerp(lerp(a, b, sx), lerp(c, d, sx), sy) * amp;
    }
    norm += amp; amp *= 0.55;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
function canvasTex(size, fill, srgb = true, repeat = true) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(size, size);
  fill(img.data, size);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function normalFromHeight(h, size, strength) {
  return canvasTex(size, (d, s) => {
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const l = h[y * s + (x - 1 + s) % s], rr = h[y * s + (x + 1) % s], u = h[((y - 1 + s) % s) * s + x], dn = h[((y + 1) % s) * s + x];
      let nx = (l - rr) * strength, ny = (u - dn) * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      const i = (y * s + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }, false);
}
let detailCache = null;
function terrainDetail() {
  if (detailCache) return detailCache;
  const h = tileNoise(256, [8, 16, 32, 64, 128], 7);
  const map = canvasTex(256, (d, s) => { for (let i = 0; i < s * s; i++) { const v = 200 + h[i] * 55; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } });
  detailCache = { map, normal: normalFromHeight(h, 256, 6) };
  return detailCache;
}

// Road textures, one set per surface: colour (with alpha fading the shoulders), roughness and a normal
// map derived from the same detail so stones, joints and ruts line up. u = across, v = along (one tile).
const ROAD_COLORS = {
  tarmac: { base: "#46484b", lane: "#3a3c3f", ridge: "#4e5053" },
  concrete: { base: "#9a9a94", lane: "#84847f", ridge: "#a4a49e" },
  snow: { base: "#e3eaf3", lane: "#b8c6d6", ridge: "#f5f8fc" }
};
function roadTexture(surface, pal, wet, hw) {
  const W = 256, H = 512, total = hw + 1.4;
  const uOf = d => (d / total * 0.5 + 0.5) * W;
  const r = makeRng(surface.length * 31 + 7 + (wet ? 1 : 0));
  const dirt = C(pal.dirt), grass = C(pal.grass[0]);
  let base, lane, ridge, edge;
  if (ROAD_COLORS[surface]) { const rc = ROAD_COLORS[surface]; base = C(rc.base); lane = C(rc.lane); ridge = C(rc.ridge); }
  else if (surface === "mud") { base = dirt.clone().multiplyScalar(0.62); lane = dirt.clone().multiplyScalar(0.4); ridge = dirt.clone().multiplyScalar(0.78); }
  else if (surface === "sand") { base = dirt.clone().lerp(C("#e0b080"), 0.18); lane = dirt.clone().multiplyScalar(0.85); ridge = dirt.clone().lerp(C("#f3d2a8"), 0.3); }
  else { base = dirt.clone().lerp(C("#ffffff"), 0.06); lane = dirt.clone().multiplyScalar(0.8); ridge = dirt.clone().lerp(C("#ffffff"), 0.2); }
  edge = surface === "snow" ? C("#f2f5f9") : surface === "tarmac" || surface === "concrete" ? dirt.clone().lerp(grass, 0.25) : grass.clone().lerp(dirt, 0.55);
  if (wet) { const k = surface === "snow" ? 0.95 : 0.74; base.multiplyScalar(k); lane.multiplyScalar(k * 0.92); ridge.multiplyScalar(k); edge.multiplyScalar(0.8); }
  const col = new Float32Array(W * H * 3), rough = new Float32Array(W * H), hgt = new Float32Array(W * H), alpha = new Float32Array(W * H);
  const n1 = tileNoise(128, [8, 16, 32], 3), n2 = tileNoise(128, [32, 64], 13);
  const nAt = (arr, x, y) => arr[(y % 128) * 128 + (x % 128)];
  const baseRough = { tarmac: wet ? 0.32 : 0.86, concrete: wet ? 0.34 : 0.8, snow: 0.55, mud: wet ? 0.5 : 0.72, sand: 0.98, gravel: 0.95 }[surface] || 0.92;
  const lanes = [-hw * 0.55, -hw * 0.22, hw * 0.22, hw * 0.55];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = (x / W * 2 - 1) * total, ad = Math.abs(d);
    let laneK = 0;
    for (const L of lanes) laneK = Math.max(laneK, 1 - smoothstep(0.12, 0.42, Math.abs(d - L)));
    const ridgeK = surface === "tarmac" || surface === "concrete" ? 0 : Math.max(1 - smoothstep(0.1, 0.45, ad), 1 - smoothstep(0.1, 0.5, Math.abs(ad - hw * 0.9)));
    const nv = nAt(n1, x, y), nv2 = nAt(n2, x, y);
    const c = base.clone().lerp(lane, laneK * 0.85).lerp(ridge, ridgeK * 0.7);
    let k = 0.88 + nv * 0.24, h = nv * 0.4 - laneK * 0.25 + ridgeK * 0.3, ro = baseRough - laneK * (surface === "snow" ? 0.3 : 0.12);
    const rnd = r();
    if (surface === "gravel" || surface === "sand") {
      if (rnd > 0.965 - ridgeK * 0.05) { const st = r(); k *= st > 0.5 ? 1.35 : 0.7; h += 0.6; }
    } else if (surface === "tarmac") { if (rnd > 0.92) { k *= rnd > 0.985 ? 1.4 : 0.85; h += 0.15; } }
    else if (surface === "concrete") { if (rnd > 0.96) k *= 0.92; }
    if (surface === "sand") h += Math.sin(y * 0.35 + nv * 6) * 0.15;
    c.multiplyScalar(k);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    rough[i] = ro; hgt[i] = h;
    alpha[i] = 1 - smoothstep(hw + 0.5, total, ad + (nv2 - 0.5) * 0.9);
    // shoulders blend into the verge colour
    const sh = smoothstep(hw - 0.2, hw + 0.7, ad + (nv - 0.5) * 0.5);
    if (sh > 0) { col[i * 3] = lerp(col[i * 3], edge.r * k, sh); col[i * 3 + 1] = lerp(col[i * 3 + 1], edge.g * k, sh); col[i * 3 + 2] = lerp(col[i * 3 + 2], edge.b * k, sh); rough[i] = lerp(ro, 0.95, sh); }
  }
  const set = (x, y, rr, gg, bb, h, ro) => { const i = y * W + x; col[i * 3] = rr; col[i * 3 + 1] = gg; col[i * 3 + 2] = bb; if (h != null) hgt[i] = h; if (ro != null) rough[i] = ro; };
  if (surface === "tarmac") {
    // painted edge lines, patch repairs and a few cracks
    const lc = wet ? 0.62 : 0.86;
    for (const side of [-1, 1]) { const ux = Math.round(uOf(side * (hw - 0.25))); for (let y = 0; y < H; y++) for (let x = ux - 2; x <= ux + 2; x++) set(x, y, lc, lc, lc * 0.97, 0.45, 0.6); }
    for (let p = 0; p < 4; p++) { const px = Math.round(uOf(r.range(-hw * 0.8, hw * 0.4))), py = r.int(0, H - 80), pw = r.int(18, 50), ph = r.int(30, 80); for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw && x < W; x++) { const i = y * W + x; col[i * 3] *= 0.78; col[i * 3 + 1] *= 0.78; col[i * 3 + 2] *= 0.8; } }
    for (let cr = 0; cr < 6; cr++) { let x = r.int(30, W - 30), y = r.int(0, H); for (let st = 0; st < 60; st++) { x = clamp(x + r.int(-1, 1), 0, W - 1); y = (y + 1) % H; set(x, y, col[(y * W + x) * 3] * 0.5, col[(y * W + x) * 3 + 1] * 0.5, col[(y * W + x) * 3 + 2] * 0.5, -0.3); } }
  } else if (surface === "concrete") {
    // slabs: transverse joints every ~5 m, a centre joint, and per-slab tone
    for (let y = 0; y < H; y++) {
      const slab = Math.floor(y / 128), tone = 0.93 + ((slab * 7919) % 13) / 100;
      for (let x = 0; x < W; x++) { const i = y * W + x; col[i * 3] *= tone; col[i * 3 + 1] *= tone; col[i * 3 + 2] *= tone; }
      if (y % 128 < 2) for (let x = 0; x < W; x++) set(x, y, 0.22, 0.22, 0.21, -0.6);
    }
    for (let y = 0; y < H; y++) for (let x = W / 2 - 1; x <= W / 2; x++) set(x, y, 0.25, 0.25, 0.24, -0.6);
  } else if (surface === "mud") {
    // puddles in the ruts: dark, glossy, flat
    for (let p = 0; p < (wet ? 9 : 5); p++) {
      const cx = uOf(lanes[r.int(0, 3)] + r.range(-0.2, 0.2)), cy = r.int(0, H), rx = r.range(5, 12), ry = r.range(14, 40);
      for (let y = Math.floor(cy - ry); y < cy + ry; y++) for (let x = Math.floor(cx - rx); x < cx + rx; x++) {
        if (x < 0 || x >= W) continue;
        const yy = (y + H) % H, e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (e < 1) { const i = yy * W + x, f = smoothstep(1, 0.6, e); col[i * 3] = lerp(col[i * 3], 0.09, f); col[i * 3 + 1] = lerp(col[i * 3 + 1], 0.08, f); col[i * 3 + 2] = lerp(col[i * 3 + 2], 0.07, f); rough[i] = lerp(rough[i], 0.06, f); hgt[i] = lerp(hgt[i], -0.3, f); }
      }
    }
  }
  // write colour + alpha, roughness (green channel) and a normal map from the height field
  const toCanvas = fill => { const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const x = cv.getContext("2d"); const img = x.createImageData(W, H); fill(img.data); x.putImageData(img, 0, 0); return cv; };
  const lin2s = v => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
  const map = new THREE.CanvasTexture(toCanvas(d => { for (let i = 0; i < W * H; i++) { d[i * 4] = lin2s(clamp(col[i * 3], 0, 1)); d[i * 4 + 1] = lin2s(clamp(col[i * 3 + 1], 0, 1)); d[i * 4 + 2] = lin2s(clamp(col[i * 3 + 2], 0, 1)); d[i * 4 + 3] = alpha[i] * 255; } }));
  map.colorSpace = THREE.SRGBColorSpace;
  const roughMap = new THREE.CanvasTexture(toCanvas(d => { for (let i = 0; i < W * H; i++) { const v = clamp(rough[i], 0, 1) * 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }));
  const strength = { tarmac: 1.6, concrete: 1.2, gravel: 3.2, mud: 2.6, sand: 2.2, snow: 2 }[surface] || 2;
  const normal = new THREE.CanvasTexture(toCanvas(d => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const l = hgt[y * W + Math.max(0, x - 1)], rr = hgt[y * W + Math.min(W - 1, x + 1)], u = hgt[((y - 1 + H) % H) * W + x], dn = hgt[((y + 1) % H) * W + x];
      let nx = (l - rr) * strength, ny = (u - dn) * strength, nz = 1; const len = Math.hypot(nx, ny, nz);
      const i = (y * W + x) * 4; d[i] = (nx / len * 0.5 + 0.5) * 255; d[i + 1] = (ny / len * 0.5 + 0.5) * 255; d[i + 2] = (nz / len * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
  }));
  for (const t of [map, roughMap, normal]) { t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, roughMap, normal };
}

// ---------- sky ----------
const SKY_VS = `varying vec3 vDir;
void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = `uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uCloudCol;
uniform float uClouds; uniform float uTime; uniform float uNight;
varying vec3 vDir;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += n2(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunCol * (pow(sd, 5.0) * 0.16 + pow(sd, 48.0) * 0.3) * (1.0 - uNight * 0.6);
  float cov = 0.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.1) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(uv * 1.7);
    cov = smoothstep(1.02 - uClouds, 1.02 - uClouds + 0.32, n) * smoothstep(0.0, 0.18, h);
    vec3 cc = uCloudCol * (0.72 + 0.4 * n) + uSunCol * pow(sd, 6.0) * 0.35;
    col = mix(col, cc, cov * 0.92);
  }
  float disk = smoothstep(0.9993, 0.99965, sd);
  col += uSunCol * disk * (uNight > 0.5 ? 1.2 : 8.0) * (1.0 - cov);
  if (uNight > 0.5 && h > 0.0) { vec3 p = floor(d * 420.0); float st = step(0.9982, fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453)); col += vec3(st) * 0.8 * smoothstep(0.02, 0.3, h) * (1.0 - cov); }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export function makeSky(k) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: k.zenith }, uHorizon: { value: k.horizon }, uGround: { value: k.fogColor.clone().multiplyScalar(0.85) },
      uSunDir: { value: k.sunDir }, uSunCol: { value: k.sun }, uCloudCol: { value: k.cloudCol }, uClouds: { value: k.clouds },
      uTime: { value: 0 }, uNight: { value: k.night ? 1 : 0 }
    }
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  return sky;
}

// ---------- vegetation and prop geometry ----------
function colored(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(col), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}
function merge(list) {
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
function jitterGeo(geo, amt, seed) {
  const r = makeRng(seed), p = geo.attributes.position, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + "," + p.getY(i).toFixed(3) + "," + p.getZ(i).toFixed(3);
    let o = map.get(key);
    if (!o) { o = [(r() - 0.5) * amt, (r() - 0.5) * amt, (r() - 0.5) * amt]; map.set(key, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return geo;
}
function tr(g, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) { g.scale(sx, sy, sz); if (ry) g.rotateY(ry); g.translate(x, y, z); return g; }

function treeGeometry(type, snowy, pal) {
  const trunk = "#5a4330", parts = [];
  const snowTip = (g, h0, h1) => {
    const p = g.attributes.position, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); const t = smoothstep(h0, h1, y); if (snowy && (i % 3 === 0 || t > 0.4)) { c.setXYZ(i, lerp(c.getX(i), 0.93, t * 0.85), lerp(c.getY(i), 0.95, t * 0.85), lerp(c.getZ(i), 0.98, t * 0.85)); } }
    return g;
  };
  if (type === "pine" || type === "spruce") {
    const H = type === "pine" ? 14 : 16, layers = type === "pine" ? 4 : 6, green = type === "pine" ? "#2f4a26" : "#26402a";
    parts.push(colored(tr(new THREE.CylinderGeometry(0.16, 0.3, H * 0.55, 6), 0, H * 0.27, 0), trunk));
    for (let i = 0; i < layers; i++) {
      const f = i / layers, rad = (type === "pine" ? 2.6 : 2.4) * (1 - f * 0.75), y0 = H * (type === "pine" ? 0.38 : 0.18) + f * H * (type === "pine" ? 0.5 : 0.7);
      const g = colored(jitterGeo(new THREE.ConeGeometry(rad, H * 0.32, 7, 1), 0.35, i * 13 + H), new THREE.Color(green).multiplyScalar(0.85 + f * 0.3));
      parts.push(snowTip(tr(g, 0, y0, 0, 1, 1, 1, i * 0.7), y0 - 1, y0 + 2));
    }
  } else if (type === "birch") {
    parts.push(colored(tr(new THREE.CylinderGeometry(0.12, 0.2, 9, 6), 0, 4.5, 0), "#e7e3d8"));
    for (let i = 0; i < 4; i++) parts.push(colored(jitterGeo(tr(new THREE.IcosahedronGeometry(1.7 - i * 0.2, 1), Math.sin(i * 2.1) * 0.9, 7.2 + i * 1.3, Math.cos(i * 2.1) * 0.9, 1, 1.3, 1), 0.5, i + 3), snowy ? "#9aa58f" : "#6e8f3a"));
  } else if (type === "broadleaf") {
    parts.push(colored(tr(new THREE.CylinderGeometry(0.25, 0.4, 5, 6), 0, 2.5, 0), trunk));
    for (let i = 0; i < 5; i++) parts.push(colored(jitterGeo(tr(new THREE.IcosahedronGeometry(2.4, 1), Math.sin(i * 1.7) * 1.6, 6 + (i % 2) * 1.4, Math.cos(i * 1.7) * 1.6), 0.6, i + 9), "#3f5e2a"));
  } else if (type === "olive") {
    parts.push(colored(tr(new THREE.CylinderGeometry(0.2, 0.35, 2.2, 6), 0, 1.1, 0, 1, 1, 1, 0.3), "#6b5a48"));
    for (let i = 0; i < 4; i++) parts.push(colored(jitterGeo(tr(new THREE.IcosahedronGeometry(1.5, 1), Math.sin(i * 1.9) * 1.1, 2.9 + (i % 2) * 0.5, Math.cos(i * 1.9) * 1.1, 1, 0.75, 1), 0.4, i + 21), "#7b8a5c"));
  } else if (type === "acacia") {
    parts.push(colored(tr(new THREE.CylinderGeometry(0.14, 0.24, 5, 5), 0, 2.5, 0), "#5b4636"));
    for (const s of [-1, 1]) parts.push(colored(tr(new THREE.CylinderGeometry(0.08, 0.12, 2.4, 5).rotateZ(s * 0.7), s * 0.8, 5.2, 0), "#5b4636"));
    parts.push(colored(jitterGeo(tr(new THREE.CylinderGeometry(4.2, 3.6, 0.9, 10), 0, 6.6, 0), 0.5, 4), "#556b2f"));
  } else if (type === "eucalyptus") {
    parts.push(colored(tr(new THREE.CylinderGeometry(0.16, 0.3, 15, 6), 0, 7.5, 0), "#bfb3a2"));
    for (let i = 0; i < 4; i++) parts.push(colored(jitterGeo(tr(new THREE.IcosahedronGeometry(1.8, 1), Math.sin(i * 2.3) * 1.3, 12 + i * 1.5, Math.cos(i * 2.3) * 1.3, 1, 1.4, 1), 0.6, i + 31), "#55704a"));
  } else if (type === "bush") {
    for (let i = 0; i < 3; i++) parts.push(colored(jitterGeo(tr(new THREE.IcosahedronGeometry(0.9 - i * 0.15, 1), Math.sin(i * 2.4) * 0.6, 0.55, Math.cos(i * 2.4) * 0.6, 1, 0.8, 1), 0.3, i + 41), snowy ? "#c9d1d8" : "#4f5f2c"));
  } else if (type === "rock") {
    parts.push(colored(jitterGeo(tr(new THREE.DodecahedronGeometry(1, 1), 0, 0.35, 0, 1.2, 0.75, 1), 0.45, 51), pal.rock));
  } else if (type === "cactus") {
    parts.push(colored(tr(new THREE.CylinderGeometry(0.28, 0.32, 3.6, 8), 0, 1.8, 0), "#4d6b3a"));
    for (const s of [-1, 1]) {
      parts.push(colored(tr(new THREE.CylinderGeometry(0.16, 0.16, 0.8, 6).rotateZ(Math.PI / 2), s * 0.6, 1.6 + s * 0.3, 0), "#4d6b3a"));
      parts.push(colored(tr(new THREE.CylinderGeometry(0.16, 0.16, 1.2, 6), s * 0.95, 2.1 + s * 0.3, 0), "#4d6b3a"));
    }
  }
  return merge(parts);
}

function swayMaterial(timeU, opts = {}) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.92, flatShading: true }, opts));
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = timeU;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.17;
        #else
          float ph = 0.0;
        #endif
        float sw = max(position.y - 1.5, 0.0) * 0.014;
        transformed.x += sin(uTime * 1.4 + ph) * sw; transformed.z += cos(uTime * 1.1 + ph) * sw * 0.7;`);
  };
  m.customProgramCacheKey = () => "rl-sway";
  return m;
}

function textCanvasTex(lines, w, h, bg, fg) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const x = cv.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle";
  lines.forEach(([txt, size, y]) => { x.font = "italic 900 " + size + "px Arial, sans-serif"; x.fillText(txt, w / 2, y); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------- the world ----------
export class World {
  constructor(renderer, stage, quality) {
    this.renderer = renderer;
    this.stage = stage;
    this.Q = QUALITY[quality] || QUALITY.high;
    this.loc = stage.loc;
    this.k = conditions(stage.loc, stage.def);
    this.scene = new THREE.Scene();
    this.time = { value: 0 };
    this.chunks = [];
    this.disposables = [];
    const k = this.k, scene = this.scene;

    scene.fog = new THREE.FogExp2(k.fogColor, k.fog);
    scene.background = k.fogColor;
    this.sky = makeSky(k);
    scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(k.sun, k.sunI);
    this.sun.position.copy(k.sunDir).multiplyScalar(200);
    if (this.Q.shadow) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(this.Q.shadow, this.Q.shadow);
      s.camera.left = -70; s.camera.right = 70; s.camera.top = 70; s.camera.bottom = -70; s.camera.near = 10; s.camera.far = 500;
      s.bias = -0.0004; s.normalBias = 0.04;
    }
    scene.add(this.sun, this.sun.target);
    const hemiGround = C(this.loc.pal.grass[0]).multiplyScalar(0.6);
    this.hemi = new THREE.HemisphereLight(k.zenith.clone().lerp(C("#ffffff"), 0.35), hemiGround, k.hemiI);
    scene.add(this.hemi);

    this.buildEnvironment();
    this.buildTerrain();
    this.buildFarTerrain();
    this.buildRoad();
    this.buildWalls();
    this.buildVegetation();
    this.buildProps();
    this.buildCrowd();
    this.buildWater();
    this.buildFeatures();
    this.buildMountains();
    this.dark = 0; this._camHint = null;
  }

  buildEnvironment() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(makeSky(this.k));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 24), new THREE.MeshBasicMaterial({ color: C(this.loc.pal.grass[0]).multiplyScalar(0.5) }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -3;
    envScene.add(ground);
    this.envRT = pm.fromScene(envScene, 0.03);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = this.k.envI;
    pm.dispose();
  }

  // Terrain colour: grass/dry/rock/snow by slope, noise and distance to the road.
  terrainColor(x, z, h, ny, dRoad, out) {
    const P = this.loc.pal, nz = this.stage.noise;
    const n1 = nz.fbm(x * 0.012, z * 0.012, 3) * 0.5 + 0.5, n2 = nz.noise(x * 0.06 + 100, z * 0.06) * 0.5 + 0.5;
    out.set(P.grass[0]).lerp(this._c1.set(P.grass[1]), n1);
    out.lerp(this._c1.set(P.dry), smoothstep(0.55, 0.85, n2) * 0.6);
    const slope = 1 - ny;
    out.lerp(this._c1.set(P.rock), smoothstep(0.12, 0.3, slope) * (this.loc.offroad === "deepsnow" ? 0.4 : 1));
    if (this.loc.id === "monte" && this.stage.def.time === "night") out.lerp(this._c1.set(P.snow), smoothstep(0.35, 0.8, n1) * (1 - smoothstep(0.15, 0.3, slope)) * 0.7);
    if (dRoad < this.stage.w + 4) out.lerp(this._c1.set(this.stage.surface === "snow" ? P.snow : P.dirt), 1 - smoothstep(this.stage.w + 1, this.stage.w + 4, dRoad));
    if (this.k.wet) out.multiplyScalar(0.78);
    return out;
  }

  buildTerrain() {
    const g = this.stage.grid, CH = 64;
    this._c1 = new THREE.Color();
    const det = terrainDetail();
    const snowy = this.loc.surface === "snow";
    this.terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: det.map, normalMap: det.normal, normalScale: new THREE.Vector2(0.7, 0.7), roughness: snowy ? 0.75 : 0.96 });
    const col = new THREE.Color();
    // normals for the whole grid
    const nx = g.nx, nzc = g.nz, H = g.h;
    const hAt = (ix, iz) => H[clamp(iz, 0, nzc - 1) * nx + clamp(ix, 0, nx - 1)];
    for (let cz = 0; cz < nzc - 1; cz += CH) for (let cx = 0; cx < nx - 1; cx += CH) {
      const w = Math.min(CH, nx - 1 - cx), h = Math.min(CH, nzc - 1 - cz);
      const vcount = (w + 1) * (h + 1);
      const pos = new Float32Array(vcount * 3), nor = new Float32Array(vcount * 3), clr = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2);
      let v = 0;
      for (let iz = 0; iz <= h; iz++) for (let ix = 0; ix <= w; ix++, v++) {
        const gx = cx + ix, gz = cz + iz, x = g.x0 + gx * g.cell, z = g.z0 + gz * g.cell, y = hAt(gx, gz);
        const dx = (hAt(gx + 1, gz) - hAt(gx - 1, gz)) / (2 * g.cell), dz = (hAt(gx, gz + 1) - hAt(gx, gz - 1)) / (2 * g.cell);
        const l = Math.hypot(dx, 1, dz);
        pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
        nor[v * 3] = -dx / l; nor[v * 3 + 1] = 1 / l; nor[v * 3 + 2] = -dz / l;
        this.terrainColor(x, z, y, 1 / l, g.d[gz * nx + gx], col);
        clr[v * 3] = col.r; clr[v * 3 + 1] = col.g; clr[v * 3 + 2] = col.b;
        uv[v * 2] = x / 7; uv[v * 2 + 1] = z / 7;
      }
      const idx = new Uint32Array(w * h * 6);
      let o = 0;
      const cover = g.cover;
      for (let iz = 0; iz < h; iz++) for (let ix = 0; ix < w; ix++) {
        const a = iz * (w + 1) + ix, b = a + 1, c = a + w + 1, d = c + 1;
        if (cover) { const gv = (cz + iz) * nx + cx + ix; if (cover[gv] || cover[gv + 1] || cover[gv + nx] || cover[gv + nx + 1]) continue; }
        idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(clr, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(new THREE.BufferAttribute(o < idx.length ? idx.slice(0, o) : idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.terrainMat);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.disposables.push(geo);
    }
  }

  // Low-resolution terrain far beyond the detailed grid, slightly lower so the detailed grid wins.
  buildFarTerrain() {
    const g = this.stage.grid, cx = g.x0 + g.nx * g.cell / 2, cz = g.z0 + g.nz * g.cell / 2;
    const S = 9000, N = 150, cell = S / N, col = new THREE.Color();
    const pos = [], clr = [], idx = [];
    for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) {
      const x = cx - S / 2 + ix * cell, z = cz - S / 2 + iz * cell;
      let y = this.stage.baseHeight(x, z) - 2.5;
      const inside = x > g.x0 + 30 && x < g.x0 + (g.nx - 1) * g.cell - 30 && z > g.z0 + 30 && z < g.z0 + (g.nz - 1) * g.cell - 30;
      if (inside) y -= 30;
      pos.push(x, y, z);
      this.terrainColor(x, z, y, 0.95, 1e9, col);
      clr.push(col.r, col.g, col.b);
    }
    for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
      const a = iz * (N + 1) + ix, b = a + 1, c = a + N + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(clr, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    this.scene.add(m);
    this.disposables.push(geo);
  }

  // Road ribbon split by surface section, one material per surface. Each section starts with a short
  // vertex-alpha fade over the end of the previous one so the change of surface blends.
  buildRoad() {
    const st = this.stage, w = st.w, total = w + 1.4, texLen = total * 4;
    this.roadMats = {};
    const matFor = (surf, parity) => {
      const key = surf + parity;
      if (this.roadMats[key]) return this.roadMats[key];
      if (!this.roadTex) this.roadTex = {};
      const tx = this.roadTex[surf] || (this.roadTex[surf] = roadTexture(surf, this.loc.pal, this.k.wet, w));
      if (!parity) this.disposables.push(tx.map, tx.roughMap, tx.normal);
      const m = new THREE.MeshStandardMaterial({ map: tx.map, roughnessMap: tx.roughMap, roughness: 1, normalMap: tx.normal, normalScale: new THREE.Vector2(0.55, 0.55),
        metalness: 0, vertexColors: true, transparent: true, polygonOffset: true, polygonOffsetFactor: parity ? -3 : -2, polygonOffsetUnits: parity ? -6 : -4,
        envMapIntensity: this.k.wet ? 1.3 : 0.8 });
      this.roadMats[key] = m;
      return m;
    };
    const offs = [-total, -w, -w * 0.5, 0, w * 0.5, w, total];
    const SEG = 240, FADE = 4, iceCol = new THREE.Color(0.85, 0.93, 1.08);
    st.sections.forEach((sec, si) => {
      const first = Math.max(0, Math.floor(sec.s0 / STEP) - (si ? FADE : 0));
      const last = Math.min(st.n - 1, Math.ceil(sec.s1 / STEP) + 1);
      const fadeEnd = Math.floor(sec.s0 / STEP);
      for (let i0 = first; i0 < last; i0 += SEG) {
        const i1 = Math.min(last, i0 + SEG);
        const pos = [], uv = [], col = [], idx = [];
        const per = offs.length + 2;
        for (let i = i0; i <= i1; i++) {
          const c = Math.cos(st.h[i]), s = Math.sin(st.h[i]), y0 = st.y[i];
          const tint = st.ice[i] ? iceCol : null;
          const a = si && i < fadeEnd ? (i - first + 1) / (FADE + 1) : 1;
          const row = offs.map((d, j) => {
            const x = st.x[i] + c * d, z = st.z[i] - s * d;
            let y = y0;
            if (j === 0 || j === offs.length - 1) { const gy = st.gridH(x, z); y = Math.min(y0, Math.max(gy, y0 - 0.6)); }
            return [x, y + 0.03, z, (d / total) * 0.5 + 0.5];
          });
          const L0 = row[0], R0 = row[row.length - 1];
          for (const [x, y, z, u] of [[L0[0], L0[1] - 1.4, L0[2], 0], ...row, [R0[0], R0[1] - 1.4, R0[2], 1]]) {
            pos.push(x, y, z); uv.push(u, i * STEP / texLen);
            col.push(tint ? tint.r : 1, tint ? tint.g : 1, tint ? tint.b : 1, a);
          }
        }
        const rows = i1 - i0 + 1;
        for (let rr = 0; rr < rows - 1; rr++) for (let j = 0; j < per - 1; j++) {
          const a = rr * per + j, b = a + 1, cc = a + per, d = cc + 1;
          idx.push(a, cc, b, b, cc, d);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, matFor(sec.surf, si % 2));
        m.receiveShadow = true;
        m.renderOrder = 1 + (si % 2);
        this.scene.add(m);
        this.disposables.push(geo);
      }
    });
    // painted start/finish lines
    for (const s of [st.startS, st.finishS]) {
      const p = st.pointAt(s);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 0.6), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -10 }));
      line.rotation.set(-Math.PI / 2, 0, 0); line.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), p.h);
      line.position.set(p.x, p.y + 0.05, p.z);
      this.scene.add(line);
    }
  }

  // Snow banks, armco and stone walls as ribbons along the road edges.
  buildWalls() {
    const st = this.stage, w = st.w;
    const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.72, map: terrainDetail().map, normalMap: terrainDetail().normal });
    const armMat = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, roughness: 0.35, metalness: 0.85, side: THREE.DoubleSide });
    const stoneTex = canvasTex(128, (d, s) => { const h = tileNoise(s, [4, 8, 16, 32], 5); for (let i = 0; i < s * s; i++) { const y = Math.floor(i / s), x = i % s; const mortar = (y % 32 < 3) || ((x + (Math.floor(y / 32) % 2) * 16) % 32 < 3); const v = mortar ? 120 : 150 + h[i] * 80; d[i * 4] = v; d[i * 4 + 1] = v * 0.96; d[i * 4 + 2] = v * 0.9; d[i * 4 + 3] = 255; } });
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, color: C(this.loc.pal.rock).lerp(C("#ffffff"), 0.3) });
    const profiles = {
      2: { mat: snowMat, pts: [[0.7, -0.2], [1.2, 0.75], [1.9, 1.15], [2.8, 1.0], [3.6, 0.2], [4.2, -0.4]] },
      1: { mat: armMat, pts: [[0.95, 0.42], [0.98, 0.58], [0.95, 0.74]] },
      3: { mat: stoneMat, pts: [[1.0, -0.3], [1.0, 0.95], [1.55, 0.95], [1.55, -0.3]] }
    };
    const posts = [];
    for (const [arr, side] of [[st.wallL, 1], [st.wallR, -1]]) {
      let i = 0;
      while (i < st.n) {
        const kind = arr[i];
        if (!kind) { i++; continue; }
        let j = i;
        while (j < st.n && arr[j] === kind) j++;
        if (!profiles[kind]) { i = j; continue; }
        const prof = profiles[kind], pos = [], uv = [], idx = [], per = prof.pts.length;
        for (let q = i; q < j; q++) {
          const c = Math.cos(st.h[q]), s = Math.sin(st.h[q]);
          for (const [d0, hgt] of prof.pts) {
            const d = side * (w + d0), x = st.x[q] + c * d, z = st.z[q] - s * d;
            pos.push(x, st.y[q] + hgt, z); uv.push(q * STEP / 3, hgt);
          }
          if (kind === 1 && q % 2 === 0) posts.push([st.x[q] + c * side * (w + 1.05), st.y[q], st.z[q] - s * side * (w + 1.05)]);
        }
        for (let r = 0; r < j - i - 1; r++) for (let k = 0; k < per - 1; k++) {
          const a = r * per + k, b = a + 1, cc = a + per, d = cc + 1;
          if (side > 0) idx.push(a, b, cc, b, d, cc); else idx.push(a, cc, b, b, cc, d);
        }
        if (j - i > 1) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
          geo.setIndex(idx); geo.computeVertexNormals();
          const m = new THREE.Mesh(geo, prof.mat);
          m.castShadow = kind !== 2; m.receiveShadow = true;
          this.scene.add(m);
          this.disposables.push(geo);
        }
        i = j;
      }
    }
    if (posts.length) {
      const pg = new THREE.BoxGeometry(0.1, 0.8, 0.1); pg.translate(0, 0.35, 0);
      const im = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x8d9296, metalness: 0.6, roughness: 0.5 }), posts.length);
      const m4 = new THREE.Matrix4();
      posts.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
      im.computeBoundingSphere();
      this.scene.add(im);
    }
  }

  buildVegetation() {
    const st = this.stage, Q = this.Q, pal = this.loc.pal;
    const byType = new Map();
    const r = makeRng(st.seed ^ 77);
    for (const t of st.trees) {
      if (!t.near && r() > Q.trees) continue;
      const key = t.type + (t.snowy ? "*" : "");
      if (!byType.has(key)) byType.set(key, []);
      byType.get(key).push(t);
    }
    const CHUNK = 320, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), tint = new THREE.Color();
    for (const [key, list] of byType) {
      const type = key.replace("*", ""), snowy = key.endsWith("*");
      const geo = treeGeometry(type, snowy, pal);
      this.disposables.push(geo);
      const mat = type === "rock" ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }) : swayMaterial(this.time);
      const chunks = new Map();
      for (const t of list) {
        const ck = Math.floor(t.x / CHUNK) + "," + Math.floor(t.z / CHUNK);
        if (!chunks.has(ck)) chunks.set(ck, []);
        chunks.get(ck).push(t);
      }
      for (const items of chunks.values()) {
        const im = new THREE.InstancedMesh(geo, mat, items.length);
        let cx = 0, cz = 0;
        items.forEach((t, i) => {
          q.setFromAxisAngle(up, t.rot);
          const s = t.scale;
          sc.set(s, type === "rock" ? s * 0.8 : s * (0.85 + t.tint * 0.3), s);
          p.set(t.x, t.y - (type === "rock" ? 0.2 * s : 0.15), t.z);
          im.setMatrixAt(i, m4.compose(p, q, sc));
          tint.setRGB(0.82 + t.tint * 0.3, 0.86 + t.tint * 0.22, 0.82 + t.tint * 0.25);
          im.setColorAt(i, tint);
          cx += t.x; cz += t.z;
        });
        im.computeBoundingSphere();
        im.castShadow = Q.shadow >= 2048 && type !== "bush";
        im.receiveShadow = false;
        this.scene.add(im);
        this.chunks.push({ obj: im, x: cx / items.length, z: cz / items.length, far: type === "rock" || type === "bush" ? 0.6 : 1 });
      }
    }
    // grass tufts near the road
    if (Q.grass > 0 && this.loc.surface !== "snow") {
      const tuft = this.grassGeometry();
      const mat = swayMaterial(this.time, { flatShading: false, side: THREE.DoubleSide, alphaTest: 0.5, map: this.grassTexture() });
      const count = Math.round(st.L / 1000 * 2600 * Q.grass);
      const items = [];
      for (let c = 0; c < count; c++) {
        const i = r.int(0, st.n - 1), side = r() < 0.5 ? 1 : -1, d = st.w + 1.6 + Math.pow(r(), 1.6) * 30;
        const cs = Math.cos(st.h[i]), sn = Math.sin(st.h[i]), along = r.range(-STEP, STEP);
        const x = st.x[i] + cs * side * d + sn * along, z = st.z[i] - sn * side * d + cs * along;
        if (Math.abs(st.locate(x, z, i).d) < st.w + 1.2) continue;
        const y = st.gridH(x, z);
        if (st.waterY != null && y < st.waterY + 0.2) continue;
        items.push([x, y, z, r() * TAU, r.range(0.6, 1.3), r()]);
      }
      const chunks = new Map();
      for (const it of items) { const ck = Math.floor(it[0] / 200) + "," + Math.floor(it[2] / 200); if (!chunks.has(ck)) chunks.set(ck, []); chunks.get(ck).push(it); }
      for (const list of chunks.values()) {
        const im = new THREE.InstancedMesh(tuft, mat, list.length);
        let cx = 0, cz = 0;
        list.forEach(([x, y, z, rot, s, tt], i) => {
          q.setFromAxisAngle(up, rot); sc.set(s, s, s); p.set(x, y - 0.05, z);
          im.setMatrixAt(i, m4.compose(p, q, sc));
          tint.set(pal.grass[1]).lerp(C(pal.dry), tt * 0.7).multiplyScalar(1.25);
          im.setColorAt(i, tint);
          cx += x; cz += z;
        });
        im.computeBoundingSphere();
        this.scene.add(im);
        this.chunks.push({ obj: im, x: cx / list.length, z: cz / list.length, far: 0.25 });
      }
    }
  }
  grassGeometry() {
    const parts = [];
    for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(1.2, 0.7); g.translate(0, 0.35, 0); g.rotateY(i * Math.PI / 3); parts.push(g); }
    let total = 0; parts.forEach(g => total += g.attributes.position.count);
    const geo = new THREE.BufferGeometry(), pos = [], uv = [], nor = [], col = [];
    for (const g of parts) {
      const ng = g.toNonIndexed();
      pos.push(...ng.attributes.position.array); uv.push(...ng.attributes.uv.array);
      for (let i = 0; i < ng.attributes.position.count; i++) { nor.push(0, 1, 0); col.push(1, 1, 1); }
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  grassTexture() {
    if (this._grassTex) return this._grassTex;
    const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64;
    const x = cv.getContext("2d"), r = makeRng(5);
    for (let i = 0; i < 70; i++) {
      const bx = r() * 128, h = r.range(25, 62), lean = r.range(-14, 14), g = Math.round(r.range(150, 230));
      x.strokeStyle = `rgb(${Math.round(g * 0.75)},${g},${Math.round(g * 0.55)})`; x.lineWidth = r.range(1.2, 2.6);
      x.beginPath(); x.moveTo(bx, 64); x.quadraticCurveTo(bx + lean * 0.3, 64 - h * 0.6, bx + lean, 64 - h); x.stroke();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    this._grassTex = t;
    return t;
  }

  buildProps() {
    const st = this.stage, scene = this.scene, w = st.w;
    const props = st.props;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    const inst = (geo, mat, list, fn) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((o, i) => { fn ? fn(o, i, im) : (q.setFromAxisAngle(up, o.rot || 0), im.setMatrixAt(i, m4.compose(p.set(o.x, o.y, o.z), q, one))); });
      im.computeBoundingSphere(); im.castShadow = true; im.receiveShadow = true;
      scene.add(im);
      return im;
    };
    const of = t => props.filter(o => o.type === t);
    // hay bales
    const baleG = new THREE.CylinderGeometry(0.65, 0.65, 1.2, 14); baleG.rotateZ(Math.PI / 2); baleG.translate(0, 0.62, 0);
    inst(baleG, new THREE.MeshStandardMaterial({ color: 0xc9a85a, roughness: 1, map: terrainDetail().map }), of("bale"));
    // chevron boards
    const chevTex = (() => {
      const cv = document.createElement("canvas"); cv.width = 128; cv.height = 64; const x = cv.getContext("2d");
      x.fillStyle = "#111"; x.fillRect(0, 0, 128, 64); x.fillStyle = "#f5c400";
      for (let i = 0; i < 3; i++) { const o = 14 + i * 38; x.beginPath(); x.moveTo(o, 6); x.lineTo(o + 22, 32); x.lineTo(o, 58); x.lineTo(o + 12, 58); x.lineTo(o + 34, 32); x.lineTo(o + 12, 6); x.fill(); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const chev = of("chevron");
    for (const dir of ["L", "R"]) {
      const list = chev.filter(c => c.dir === dir);
      const bg = new THREE.PlaneGeometry(1.1, 0.55); bg.translate(0, 1.0, 0);
      if (dir === "L") bg.scale(-1, 1, 1);
      inst(bg, new THREE.MeshStandardMaterial({ map: chevTex, side: THREE.DoubleSide, roughness: 0.6 }), list);
    }
    // tape lines on posts
    const posts = of("tapepost");
    const postG = new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5); postG.translate(0, 0.55, 0);
    inst(postG, new THREE.MeshStandardMaterial({ color: 0xdddddd }), posts);
    const tapeTex = (() => { const cv = document.createElement("canvas"); cv.width = 64; cv.height = 8; const x = cv.getContext("2d"); for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? "#f4f4f4" : "#d4141c"; x.fillRect(i * 16, 0, 16, 8); } const t = new THREE.CanvasTexture(cv); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const tapeMat = new THREE.MeshStandardMaterial({ map: tapeTex, side: THREE.DoubleSide, roughness: 0.5 });
    const groups = new Map();
    for (const o of posts) { const k = o.zone + ":" + o.side; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(o); }
    for (const list of groups.values()) {
      list.sort((a, b) => a.s - b.s);
      const pos = [], uv = [], idx = [];
      list.forEach((o, i) => { pos.push(o.x, o.y + 0.95, o.z, o.x, o.y + 0.85, o.z); uv.push(i * 1.5, 0, i * 1.5, 1); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
      if (list.length < 2) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, tapeMat));
    }
    // houses
    const wallTex = canvasTex(128, (d, s) => { const h = tileNoise(s, [8, 32], 9); for (let i = 0; i < s * s; i++) { const v = 205 + h[i] * 45; d[i * 4] = v; d[i * 4 + 1] = v * 0.97; d[i * 4 + 2] = v * 0.92; d[i * 4 + 3] = 255; } });
    const roofCol = this.loc.id === "sweden" || this.loc.id === "finland" ? ["#7a2b22", "#3b3f45", "#8a3a2a"] : this.loc.id === "wales" ? ["#3b3f45", "#4a4e55"] : ["#a4532f", "#b8643a", "#8e4a30"];
    const wallCol = this.loc.id === "sweden" || this.loc.id === "finland" ? ["#8e2b22", "#e4dccb", "#c9a75b"] : ["#efe6d6", "#dccfb7", "#c9b89a", "#f3eee4"];
    for (const h of of("house")) {
      const grp = new THREE.Group();
      const wallsM = new THREE.MeshStandardMaterial({ map: wallTex, color: wallCol[Math.floor(h.tint * wallCol.length)], roughness: 0.9 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(h.w * 2, h.ht, h.d * 2), wallsM); body.position.y = h.ht / 2 - 0.4;
      const roofG = new THREE.CylinderGeometry(0.01, h.w * 1.25, h.ht * 0.55, 4, 1); roofG.rotateY(Math.PI / 4); roofG.scale(1, 1, h.d / h.w);
      const roof = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: roofCol[Math.floor(h.tint * 7) % roofCol.length], roughness: 0.8 }));
      roof.position.y = h.ht - 0.4 + h.ht * 0.27;
      const winM = new THREE.MeshStandardMaterial({ color: 0x1b2229, roughness: 0.2, emissive: this.k.night ? 0xffc06a : 0x000000, emissiveIntensity: this.k.night ? 1.4 : 0 });
      for (const sx of [-0.5, 0.5]) { const wdw = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.9), winM); wdw.position.set(sx * h.w, h.ht * 0.55, h.d + 0.01); grp.add(wdw); }
      grp.add(body, roof);
      grp.position.set(h.x, h.y, h.z); grp.rotation.y = h.rot;
      grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      scene.add(grp);
    }
    // telegraph poles and wires
    const poles = of("pole");
    const poleG = new THREE.CylinderGeometry(0.12, 0.16, 8, 6); poleG.translate(0, 4, 0);
    const armG = new THREE.BoxGeometry(1.4, 0.1, 0.1); armG.translate(0, 7.3, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x5b4632, roughness: 0.95 });
    inst(poleG, poleMat, poles); inst(armG, poleMat, poles);
    const wirePts = [];
    for (const o of of("wire")) for (let i = 0; i < o.pts.length - 1; i++) {
      const a = o.pts[i], b = o.pts[i + 1];
      for (let k = 0; k < 8; k++) {
        const t0 = k / 8, t1 = (k + 1) / 8, sag = t => Math.sin(t * Math.PI) * 0.7;
        wirePts.push(lerp(a[0], b[0], t0), lerp(a[1], b[1], t0) - sag(t0), lerp(a[2], b[2], t0), lerp(a[0], b[0], t1), lerp(a[1], b[1], t1) - sag(t1), lerp(a[2], b[2], t1));
      }
    }
    if (wirePts.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(wirePts, 3));
      scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x222222 })));
    }
    // warning signs before slow corners: red-bordered triangle with a bend arrow
    const signTex = {};
    const warnTex = (dir, hp) => signTex[dir + hp] || (signTex[dir + hp] = (() => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 128; const x = cv.getContext("2d");
      x.fillStyle = "#c8141c"; x.beginPath(); x.moveTo(64, 6); x.lineTo(124, 116); x.lineTo(4, 116); x.closePath(); x.fill();
      x.fillStyle = "#f6f4ee"; x.beginPath(); x.moveTo(64, 26); x.lineTo(108, 106); x.lineTo(20, 106); x.closePath(); x.fill();
      x.strokeStyle = "#111"; x.lineWidth = 7; x.lineCap = "round"; x.beginPath();
      const m = dir === "L" ? -1 : 1;
      if (hp) { x.moveTo(64 - m * 12, 98); x.lineTo(64 - m * 12, 62); x.arc(64, 62, 12, Math.PI, 0, dir === "L"); x.lineTo(64 + m * 12, 78); }
      else { x.moveTo(64 - m * 10, 98); x.quadraticCurveTo(64 - m * 10, 60, 64 + m * 14, 54); }
      x.stroke();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })());
    const sPole = new THREE.CylinderGeometry(0.04, 0.04, 2.0, 6); sPole.translate(0, 1.0, 0);
    const signG = new THREE.PlaneGeometry(0.95, 0.95); signG.translate(0, 2.25, 0); signG.rotateY(Math.PI);
    const greyPole = new THREE.MeshStandardMaterial({ color: 0x9a9ea3, metalness: 0.5, roughness: 0.5 });
    const signs = of("warnsign");
    inst(sPole, greyPole, signs);
    for (const key of ["L0", "R0", "L1", "R1"]) {
      const list = signs.filter(o => o.dir === key[0] && (o.hairpin ? 1 : 0) === +key[1]);
      inst(signG, new THREE.MeshStandardMaterial({ map: warnTex(key[0], +key[1]), roughness: 0.5, side: THREE.DoubleSide, alphaTest: 0.5, transparent: false }), list);
    }
    // yellow time-control board 100 m before the finish
    const yb = of("yellowboard");
    if (yb.length) {
      const ybTex = textCanvasTex([["⏱", 70, 66]], 128, 128, "#f2c400", "#111111");
      const ybG = new THREE.PlaneGeometry(0.9, 0.9); ybG.translate(0, 1.9, 0); ybG.rotateY(Math.PI);
      inst(sPole, greyPole, yb); inst(ybG, new THREE.MeshStandardMaterial({ map: ybTex, side: THREE.DoubleSide, roughness: 0.6 }), yb);
    }
    // post-and-rail fences
    const fences = of("fence");
    if (fences.length) {
      const woodC = this.loc.id === "kenya" ? 0x6b5338 : 0x7a6449;
      const woodM = new THREE.MeshStandardMaterial({ color: woodC, roughness: 0.95, map: terrainDetail().map });
      const allPosts = [];
      const rails = [], ridx = [];
      for (const f of fences) {
        allPosts.push(...f.posts.map(([x, y, z, h]) => ({ x, y, z, rot: h })));
        for (const ry of [0.55, 1.0]) {
          const base = rails.length / 3;
          f.posts.forEach(([x, y, z, h], i) => {
            const nx = Math.cos(h) * 0.025, nz = -Math.sin(h) * 0.025;
            rails.push(x - nx, y + ry - 0.06, z - nz, x + nx, y + ry + 0.06, z + nz);
            if (i) { const a = base + (i - 1) * 2; ridx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
          });
        }
      }
      const fp = new THREE.BoxGeometry(0.11, 1.25, 0.11); fp.translate(0, 0.55, 0);
      inst(fp, woodM, allPosts);
      const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(rails, 3)); rg.setIndex(ridx); rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: woodC, roughness: 0.95, side: THREE.DoubleSide })); rm.castShadow = true;
      scene.add(rm);
    }
    // log piles: a pyramid of cut trunks with pale end grain
    const logPiles = of("logs");
    if (logPiles.length) {
      const logs = [];
      for (const o of logPiles) {
        const rows = [[4, 0], [3, 1], [2, 2]];
        for (const [count, row] of rows) for (let k = 0; k < count; k++) {
          const off = (k - (count - 1) / 2) * 0.42, yy = 0.21 + row * 0.36;
          logs.push({ x: o.x + Math.cos(o.rot) * off, y: o.y + yy, z: o.z - Math.sin(o.rot) * off, rot: o.rot, len: o.len });
        }
      }
      const lg = new THREE.CylinderGeometry(0.2, 0.2, 1, 10); lg.rotateX(Math.PI / 2);
      const ends = new THREE.MeshStandardMaterial({ color: 0xd9b98a, roughness: 0.9 }), bark = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1, map: terrainDetail().map });
      const im = new THREE.InstancedMesh(lg, [bark, ends, ends], logs.length);
      logs.forEach((o, i) => { q.setFromAxisAngle(up, o.rot); im.setMatrixAt(i, m4.compose(p.set(o.x, o.y, o.z), q, new THREE.Vector3(1, 1, o.len))); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      scene.add(im);
    }
    // start / finish arches and the stop board
    const rallyName = this.loc.name.toUpperCase();
    for (const o of props.filter(o => o.type === "startArch" || o.type === "finishArch" || o.type === "stopBoard")) {
      const grp = new THREE.Group();
      if (o.type === "stopBoard") {
        const tex = textCanvasTex([["STOP", 64, 48]], 256, 96, "#c8141c", "#ffffff");
        const board = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
        board.position.set(w + 1.8, 1.6, 0); grp.add(board);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), poleMat); pole.position.set(w + 1.8, 0.8, 0); grp.add(pole);
      } else {
        const start = o.type === "startArch";
        const col = start ? "#13294b" : "#b3121b";
        const tex = textCanvasTex([[start ? "START" : "FINISH", 92, 70], [rallyName + " · " + this.stage.name.toUpperCase(), 26, 138]], 512, 170, col, "#ffffff");
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 });
        for (const s of [1, -1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.4, 0.7), mat); leg.position.set(s * (w + 1.6), 2.7, 0); grp.add(leg); }
        const beam = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 4, 1.5, 0.6), [mat, mat, mat, mat, new THREE.MeshStandardMaterial({ map: tex }), new THREE.MeshStandardMaterial({ map: tex })]);
        beam.position.y = 5.4; grp.add(beam);
        if (!start) {
          // chequered flags on the legs
          const ct = canvasTex(64, (d, s) => { for (let i = 0; i < s * s; i++) { const v = ((Math.floor((i % s) / 16) + Math.floor(i / s / 16)) % 2) ? 245 : 20; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = 255; } }, true, false);
          for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ map: ct, side: THREE.DoubleSide })); f.position.set(s * (w + 2.6), 4.2, 0); grp.add(f); }
        }
      }
      grp.position.set(o.x, o.y, o.z); grp.rotation.y = o.rot;
      grp.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
      scene.add(grp);
    }
  }

  buildCrowd() {
    const list = this.stage.crowds;
    if (!list.length) return;
    const body = new THREE.CapsuleGeometry(0.22, 0.75, 3, 8); body.translate(0, 0.8, 0);
    const legs = new THREE.BoxGeometry(0.34, 0.5, 0.2); legs.translate(0, 0.25, 0);
    const head = new THREE.SphereGeometry(0.13, 10, 8); head.translate(0, 1.52, 0);
    this.crowdBody = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), list.length);
    this.crowdLegs = new THREE.InstancedMesh(legs, new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 }), list.length);
    this.crowdHead = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ roughness: 0.8 }), list.length);
    const shirts = ["#d62828", "#f77f00", "#fcbf49", "#2a9d8f", "#264653", "#e9edf2", "#1d3557", "#6a4c93", "#3a86ff", "#8ac926", "#ff006e", "#222"];
    const skins = ["#f1c7a1", "#d9a07a", "#a46b4a", "#6e4630", "#e8b996"];
    const c = new THREE.Color(), r = makeRng(9);
    list.forEach((o, i) => {
      this.crowdBody.setColorAt(i, c.set(this.k.night ? new THREE.Color(shirts[o.shirt]).multiplyScalar(0.6) : shirts[o.shirt]));
      this.crowdHead.setColorAt(i, c.set(skins[r.int(0, skins.length - 1)]));
    });
    this.crowdFlags = list.filter(o => o.flag);
    const flagG = new THREE.PlaneGeometry(0.7, 0.45); flagG.translate(0.35, 2.15, 0);
    const flagCols = ["#c8102e", "#003893", "#ffcc00", "#009639", "#ffffff"];
    this.flagMesh = this.crowdFlags.length ? new THREE.InstancedMesh(flagG, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), this.crowdFlags.length) : null;
    if (this.flagMesh) this.crowdFlags.forEach((o, i) => this.flagMesh.setColorAt(i, c.set(flagCols[i % flagCols.length])));
    this.flares = this.k.night ? list.filter(o => o.flare) : [];
    if (this.flares.length) {
      const sp = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3b1f, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.flareSprites = this.flares.map(o => { const s = new THREE.Sprite(sp); s.position.set(o.x + 0.3, o.y + 1.7, o.z); s.scale.setScalar(1.6); this.scene.add(s); return s; });
    }
    for (const m of [this.crowdBody, this.crowdLegs, this.crowdHead, this.flagMesh]) if (m) { m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
    this.poseCrowd(null, 0, true);
    for (const m of [this.crowdBody, this.crowdLegs, this.crowdHead, this.flagMesh]) if (m) m.computeBoundingSphere();
  }

  // Spectators near the car jump and wave; the rest stand still.
  poseCrowd(car, t, all) {
    if (!this.crowdBody) return;
    const list = this.stage.crowds, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), s = new THREE.Vector3();
    let fi = 0;
    const flagIdx = new Map(this.crowdFlags.map((o, i) => [o, i]));
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const d = car ? Math.hypot(o.x - car.x, o.z - car.z) : 1e9;
      if (!all && d > 120) continue;
      const excite = car ? clamp(1 - d / 90, 0, 1) : 0;
      const hop = excite > 0 ? Math.max(0, Math.sin(t * 9 + o.ph)) * 0.25 * excite : 0;
      q.setFromAxisAngle(up, o.rot + (car && excite > 0 ? Math.sin(t * 2 + o.ph) * 0.2 : 0));
      s.set(1, o.h, 1);
      m4.compose(p.set(o.x, o.y + hop, o.z), q, s);
      this.crowdBody.setMatrixAt(i, m4); this.crowdLegs.setMatrixAt(i, m4); this.crowdHead.setMatrixAt(i, m4);
      if (this.flagMesh && flagIdx.has(o)) {
        const fq = new THREE.Quaternion().setFromAxisAngle(up, o.rot + Math.sin(t * 6 + o.ph) * 0.6 * (0.3 + excite));
        this.flagMesh.setMatrixAt(flagIdx.get(o), new THREE.Matrix4().compose(p, fq, s));
      }
    }
    this.crowdBody.instanceMatrix.needsUpdate = true; this.crowdLegs.instanceMatrix.needsUpdate = true; this.crowdHead.instanceMatrix.needsUpdate = true;
    if (this.flagMesh) this.flagMesh.instanceMatrix.needsUpdate = true;
  }

  buildWater() {
    const st = this.stage;
    if (st.waterY == null) return;
    const nrm = normalFromHeight(tileNoise(128, [8, 16, 32], 21), 128, 3);
    nrm.repeat.set(220, 220);
    this.waterNormal = nrm;
    const frozen = this.loc.surface === "snow";
    const mat = new THREE.MeshStandardMaterial({ color: frozen ? 0xdfe8f2 : C(this.k.zenith).lerp(C("#0c2a3a"), 0.75), roughness: frozen ? 0.35 : 0.06, metalness: frozen ? 0 : 0.2, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.4 });
    const g = this.stage.grid;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), mat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(g.x0 + g.nx * g.cell / 2, st.waterY, g.z0 + g.nz * g.cell / 2);
    water.receiveShadow = true;
    this.scene.add(water);
  }

  // Tunnels, bridges and rivers placed by the stage generator.
  buildFeatures() {
    const st = this.stage, w = st.w, scene = this.scene;
    // ribbon along the road: cross-section points [d, y] swept from s0 to s1
    const sweep = (s0, s1, profIn, mat, { closed = false, uScale = 3 } = {}) => {
      const i0 = Math.max(0, Math.floor(s0 / STEP)), i1 = Math.min(st.n - 1, Math.ceil(s1 / STEP));
      const profAt = typeof profIn === "function" ? profIn : () => profIn;
      const pos = [], uv = [], idx = [], per = profAt(i0 * STEP).length;
      let along = 0;
      for (let i = i0; i <= i1; i++) {
        const c = Math.cos(st.h[i]), sn = Math.sin(st.h[i]), prof = profAt(i * STEP);
        let acc = 0;
        prof.forEach(([d, y], k) => {
          if (k) acc += Math.hypot(d - prof[k - 1][0], y - prof[k - 1][1]);
          pos.push(st.x[i] + c * d, st.y[i] + y, st.z[i] - sn * d); uv.push(acc / uScale, along / uScale);
        });
        along += STEP;
      }
      for (let r = 0; r < i1 - i0; r++) for (let k = 0; k < per - 1 + (closed ? 1 : 0); k++) {
        const k2 = (k + 1) % per, a = r * per + k, b = r * per + k2, cc = a + per, d = b + per;
        idx.push(a, cc, b, b, cc, d);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true;
      scene.add(m); this.disposables.push(geo);
      return m;
    };
    const rockTex = canvasTex(256, (d, sz) => { const h = tileNoise(sz, [8, 16, 32, 64], 31); for (let i = 0; i < sz * sz; i++) { const v = 95 + h[i] * 110; d[i * 4] = v; d[i * 4 + 1] = v * 0.97; d[i * 4 + 2] = v * 0.93; d[i * 4 + 3] = 255; } });
    const concTex = canvasTex(256, (d, sz) => { const h = tileNoise(sz, [16, 64], 33); for (let i = 0; i < sz * sz; i++) { const y = Math.floor(i / sz), x = i % sz; const seam = (x % 128 < 2) || (y % 64 < 2); const v = seam ? 120 : 175 + h[i] * 40; d[i * 4] = v; d[i * 4 + 1] = v; d[i * 4 + 2] = v * 0.97; d[i * 4 + 3] = 255; } });
    const rockCol = C(this.loc.pal.rock);
    // ---- tunnels ----
    for (const t of st.tunnels) {
      const concrete = t.style === "concrete";
      const R = w + 1.0, wallH = 4.0, archH = 2.6, prof = [];
      prof.push([-R - 0.3, -0.4], [-R, -0.05], [-R, wallH]);
      for (let k = 1; k < 10; k++) { const a = Math.PI - k / 10 * Math.PI; prof.push([Math.cos(a) * R, wallH + Math.sin(a) * archH]); }
      prof.push([R, wallH], [R, -0.05], [R + 0.3, -0.4]);
      const inner = new THREE.MeshStandardMaterial({ map: concrete ? concTex : rockTex, color: concrete ? C("#b9b7b1") : rockCol.clone().lerp(C("#ffffff"), 0.1), roughness: 0.95, side: THREE.DoubleSide });
      sweep(t.s0 - 0.5, t.s1 + 0.5, prof, inner);
      // a painted kerb line along both walls
      sweep(t.s0, t.s1, [[-R + 0.02, 0.0], [-R + 0.02, 0.9]], new THREE.MeshStandardMaterial({ color: 0xf0e9d2, roughness: 0.7, side: THREE.DoubleSide }));
      sweep(t.s0, t.s1, [[R - 0.02, 0.9], [R - 0.02, 0.0]], new THREE.MeshStandardMaterial({ color: 0xf0e9d2, roughness: 0.7, side: THREE.DoubleSide }));
      // rock cutting either side of the road, tallest at the portal and tapering away from it
      const cutMat = new THREE.MeshStandardMaterial({ map: rockTex, color: rockCol, roughness: 0.96, side: THREE.DoubleSide });
      for (const [a, b, portal] of [[t.s0 - TUNNEL_APPROACH, t.s0 + 0.5, t.s0], [t.s1 - 0.5, t.s1 + TUNNEL_APPROACH, t.s1]]) {
        for (const side of [1, -1]) {
          sweep(a, b, sp => {
            const H = tunnelCutHeight(Math.abs(sp - portal));
            const top = R + H * 0.9 + 2;
            const pts = [[R, -0.4], [R, H * 0.55], [R + H * 0.18, H * 0.85], [R + H * 0.35, H], [top, H + 1.5], [top + 1, -6]]; // closed back: solid rock, not a sheet
            return side > 0 ? pts : pts.map(([d, y]) => [-d, y]).reverse();
          }, cutMat);
        }
      }
      // rocky crest over the tube just behind each headwall, where the hillside is left open
      for (const [a, b] of [[t.s0 - 0.5, Math.min(t.s1, t.s0 + 14)], [Math.max(t.s0, t.s1 - 14), t.s1 + 0.5]]) {
        sweep(a, b, [[-(R + 13), wallH + 2], [-(R + 5), wallH + archH + 1.6], [0, wallH + archH + 2.4], [R + 5, wallH + archH + 1.6], [R + 13, wallH + 2]], new THREE.MeshStandardMaterial({ map: rockTex, color: rockCol, roughness: 0.96, side: THREE.DoubleSide }));
      }
      // lamps along both upper walls
      const lamps = [];
      for (let s = t.s0 + 5; s < t.s1 - 2; s += 9) for (const side of [1, -1]) {
        const pnt = st.pointAt(s), d = side * (R - 0.12), a = Math.asin(Math.min(1, (R - 0.25) / R));
        lamps.push({ x: pnt.x + Math.cos(pnt.h) * d, y: pnt.y + wallH + Math.cos(a) * archH * 0.55, z: pnt.z - Math.sin(pnt.h) * d, rot: pnt.h });
      }
      const lg = new THREE.BoxGeometry(0.12, 0.14, 1.1);
      const im = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: concrete ? 0xfff2d6 : 0xffd38a }), lamps.length);
      const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
      lamps.forEach((o, i) => im.setMatrixAt(i, m4.compose(pv.set(o.x, o.y, o.z), qq.setFromAxisAngle(up, o.rot), one)));
      im.computeBoundingSphere(); scene.add(im);
      // portal faces with an arched opening, one at each end
      for (const [sp, dir] of [[t.s0, -1], [t.s1, 1]]) {
        const pnt = st.pointAt(sp), shape = new THREE.Shape();
        const W2 = R + 13, top = wallH + archH + 7.5;
        shape.moveTo(-W2, -3); shape.lineTo(W2, -3); shape.lineTo(W2 - 2, top - 1); shape.lineTo(W2 * 0.4, top + 1.5); shape.lineTo(-W2 * 0.5, top + 0.5); shape.lineTo(-W2 + 1.5, top - 2); shape.lineTo(-W2, -3);
        const hole = new THREE.Path();
        hole.moveTo(-R, -0.1); hole.lineTo(R, -0.1); hole.lineTo(R, wallH);
        for (let k = 1; k < 16; k++) { const a = k / 16 * Math.PI; hole.lineTo(Math.cos(a) * R, wallH + Math.sin(a) * archH); }
        hole.lineTo(-R, wallH); hole.lineTo(-R, -0.1);
        shape.holes.push(hole);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.6, bevelEnabled: false });
        geo.translate(0, 0, dir > 0 ? -1.6 : 0);
        const face = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: concrete ? concTex : rockTex, color: concrete ? C("#c9c5bc") : rockCol, roughness: 0.95 }));
        face.position.set(pnt.x, pnt.y, pnt.z); face.rotation.y = pnt.h;
        face.castShadow = true; face.receiveShadow = true; scene.add(face); this.disposables.push(geo);
      }
    }
    // ---- bridges ----
    for (const b of st.bridges) {
      const stone = b.style === "stone", timber = b.style === "timber";
      const deckMat = new THREE.MeshStandardMaterial({ map: stone ? rockTex : concTex, color: stone ? rockCol.clone().lerp(C("#d8cdb8"), 0.4) : timber ? C("#7a6449") : C("#bdbab3"), roughness: 0.9 });
      const W = w + 1.7;
      sweep(b.s0, b.s1, [[-W, -0.02], [-W, -1.2], [W, -1.2], [W, -0.02]], deckMat);
      if (stone || b.style === "concrete") {
        const wallM = new THREE.MeshStandardMaterial({ map: stone ? rockTex : concTex, color: stone ? rockCol.clone().lerp(C("#e2d6c0"), 0.35) : C("#c8c5be"), roughness: 0.92 });
        for (const side of [1, -1]) sweep(b.s0, b.s1, side > 0 ? [[w + 1.0, -0.05], [w + 1.0, 0.95], [w + 1.7, 0.95], [w + 1.7, -1.2]] : [[-w - 1.7, -1.2], [-w - 1.7, 0.95], [-w - 1.0, 0.95], [-w - 1.0, -0.05]], wallM);
        if (b.style === "concrete") for (const side of [1, -1]) sweep(b.s0, b.s1, [[side * (w + 1.35), 1.05], [side * (w + 1.35), 1.15]], new THREE.MeshStandardMaterial({ color: 0xa9adb2, metalness: 0.7, roughness: 0.4 }));
      } else {
        // timber: posts and two rails each side
        const posts = [];
        for (let s = b.s0; s <= b.s1; s += 2) for (const side of [1, -1]) { const pnt = st.pointAt(s), d = side * (w + 1.2); posts.push({ x: pnt.x + Math.cos(pnt.h) * d, y: pnt.y, z: pnt.z - Math.sin(pnt.h) * d, rot: pnt.h }); }
        const pg = new THREE.BoxGeometry(0.18, 1.1, 0.18); pg.translate(0, 0.5, 0);
        const im = new THREE.InstancedMesh(pg, deckMat, posts.length), m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
        posts.forEach((o, i) => im.setMatrixAt(i, m4.compose(pv.set(o.x, o.y, o.z), qq.setFromAxisAngle(up, o.rot), one)));
        im.castShadow = true; im.computeBoundingSphere(); scene.add(im);
        for (const side of [1, -1]) for (const ry of [0.55, 0.98]) sweep(b.s0, b.s1, [[side * (w + 1.2), ry - 0.07], [side * (w + 1.2), ry + 0.07]], new THREE.MeshStandardMaterial({ color: 0x6d5840, roughness: 0.95, side: THREE.DoubleSide }));
      }
      // piers down to the river bed, and abutments at both ends
      const pierMat = new THREE.MeshStandardMaterial({ map: stone ? rockTex : concTex, color: stone ? rockCol : timber ? C("#5e4b37") : C("#b4b1aa"), roughness: 0.95 });
      const piers = timber ? [-0.55, -0.15, 0.25, 0.6] : stone ? [-0.35, 0.35] : [0];
      for (const f of piers) {
        const pnt = st.pointAt(b.s + f * b.half * 2 * 0.5), hgt = pnt.y - 1.2 - b.bed + 0.5;
        const g = timber ? new THREE.BoxGeometry(w * 2 + 2, hgt, 0.35) : new THREE.BoxGeometry(w * 2 + 1, hgt, stone ? 1.6 : 1.2);
        const m = new THREE.Mesh(g, pierMat); m.position.set(pnt.x, pnt.y - 1.2 - hgt / 2, pnt.z); m.rotation.y = pnt.h; m.castShadow = true; m.receiveShadow = true; scene.add(m);
      }
      for (const sp of [b.s0, b.s1]) {
        const pnt = st.pointAt(sp), hgt = pnt.y - b.bed + 1;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 4, hgt, 3), pierMat); m.position.set(pnt.x, pnt.y - 1.2 - hgt / 2 + 1.1, pnt.z); m.rotation.y = pnt.h; m.receiveShadow = true; scene.add(m);
      }
    }
    // ---- rivers (water ribbons along each river line) ----
    if (st.rivers.length) {
      const nrm = this.waterNormal || normalFromHeight(tileNoise(128, [8, 16, 32], 21), 128, 3);
      const riverNrm = nrm.clone(); riverNrm.wrapS = riverNrm.wrapT = THREE.RepeatWrapping; riverNrm.repeat.set(1, 1); riverNrm.needsUpdate = true;
      this.riverNormal = riverNrm;
      for (const rv of st.rivers) {
        const muddy = rv.muddy, frozen = rv.frozen;
        const col = frozen ? C("#dfe8f2") : muddy ? C("#6b5640") : C(this.k.zenith).lerp(C(rv.ford ? "#3d5a5c" : "#14323c"), 0.7);
        const mat = new THREE.MeshStandardMaterial({ color: col, roughness: frozen ? 0.3 : 0.08, metalness: frozen ? 0 : 0.15, normalMap: riverNrm, normalScale: new THREE.Vector2(0.45, 0.45), transparent: !frozen, opacity: rv.ford ? 0.72 : 0.9, depthWrite: !!frozen, envMapIntensity: 1.3 });
        const P = rv.pts, pos = [], uv = [], idx = [], hw = rv.halfW + 1.5;
        let along = 0;
        for (let k = 0; k < P.length; k++) {
          const a = P[Math.max(0, k - 1)], c = P[Math.min(P.length - 1, k + 1)];
          let tx = c[0] - a[0], tz = c[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
          if (k) along += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
          for (const sgn of [-1, 1]) { pos.push(P[k][0] - tz * hw * sgn, rv.level, P[k][1] + tx * hw * sgn); uv.push(sgn * hw / 6, along / 6); }
          if (k) { const b0 = (k - 1) * 2; idx.push(b0, b0 + 1, b0 + 2, b0 + 1, b0 + 3, b0 + 2); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, mat); m.renderOrder = 4; m.receiveShadow = true;
        scene.add(m); this.disposables.push(geo);
        if (rv.ford && !frozen) {
          // stones and gravel bars at the edges of the splash
          const rr = makeRng(st.seed ^ Math.round(rv.s));
          const stones = [];
          for (let k = 0; k < 26; k++) { const pnt = st.pointAt(rv.s + rr.range(-rv.halfW, rv.halfW)), side = rr.chance(0.5) ? 1 : -1, d = side * (w + rr.range(1.2, 5)); stones.push({ x: pnt.x + Math.cos(pnt.h) * d, y: rv.level - 0.12, z: pnt.z - Math.sin(pnt.h) * d, s: rr.range(0.2, 0.6) }); }
          const sg = new THREE.IcosahedronGeometry(1, 0);
          const sm = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: C(this.loc.pal.rock).multiplyScalar(0.8), roughness: 0.6 }), stones.length);
          const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pv = new THREE.Vector3(), sc = new THREE.Vector3();
          stones.forEach((o, i) => sm.setMatrixAt(i, m4.compose(pv.set(o.x, o.y, o.z), qq.setFromEuler(new THREE.Euler(rr() * 3, rr() * 3, 0)), sc.set(o.s, o.s * 0.55, o.s))));
          sm.computeBoundingSphere(); scene.add(sm);
        }
      }
    }
  }

  // Inside a tunnel the light drops away, as if your eyes were adjusting.
  tunnelDarkness(dt, camera) {
    const st = this.stage;
    let target = 0;
    if (st.tunnels.length) {
      let q = st.locate(camera.position.x, camera.position.z, this._camHint, this._camQ || (this._camQ = {}));
      if (Math.abs(q.d) > st.w + 15) q = st.locate(camera.position.x, camera.position.z, null, this._camQ); // after a reset or jump
      this._camHint = q.i;
      for (const t of st.tunnels) {
        if (q.s > t.s0 - 6 && q.s < t.s1 + 6 && Math.abs(q.d) < st.w + 1.2 && camera.position.y < q.y + 6.3) {
          const inside = Math.min(q.s - t.s0, t.s1 - q.s);
          target = Math.max(target, smoothstep(-6, 18, inside));
        }
      }
    }
    this.dark += (target - this.dark) * Math.min(1, dt * 2.2);
    const k = this.k, d = this.dark;
    this.sun.intensity = k.sunI * (1 - 0.9 * d);
    this.hemi.intensity = k.hemiI * (1 - 0.72 * d);
    this.scene.environmentIntensity = k.envI * (1 - 0.65 * d);
  }

  buildMountains() {
    const g = this.stage.grid, cx = g.x0 + g.nx * g.cell / 2, cz = g.z0 + g.nz * g.cell / 2;
    const nz = makeNoise(this.stage.seed ^ 91), k = this.k;
    const base = C(this.loc.pal.mountain);
    for (const [rad, hgt, mix] of [[5200, 700, 0.55], [4300, 420, 0.35]]) {
      const N = 220, pos = [], col = [], idx = [];
      const hz = k.fogColor, cTop = base.clone().lerp(hz, mix), cBot = base.clone().lerp(hz, mix + 0.25);
      for (let i = 0; i <= N; i++) {
        const a = i / N * TAU, n = nz.fbm(Math.cos(a) * 3 + rad, Math.sin(a) * 3, 5) * 0.5 + 0.5;
        const h = hgt * (0.25 + n * 1.1);
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        const yb = this.stage.minRoadY - 200;
        pos.push(x, yb, z, x, this.stage.minRoadY + h, z);
        const top = cTop.clone();
        if (this.loc.id === "monte" || this.loc.id === "argentina" || this.loc.id === "sweden") top.lerp(C("#f4f7fb"), smoothstep(0.65, 0.9, n) * 0.6);
        col.push(cBot.r, cBot.g, cBot.b, top.r, top.g, top.b);
        if (i < N) { const a0 = i * 2; idx.push(a0, a0 + 2, a0 + 1, a0 + 1, a0 + 2, a0 + 3); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
      m.renderOrder = -5;
      this.scene.add(m);
    }
  }

  update(dt, camera, car) {
    this.time.value += dt;
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value = this.time.value;
    if (car) {
      this.sun.target.position.set(car.x, car.y, car.z);
      this.sun.position.set(car.x, car.y, car.z).addScaledVector(this.k.sunDir, 220);
    }
    const draw = this.Q.draw;
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
      c.obj.visible = d < draw * c.far + 160;
    }
    if (car && this.crowdBody) this.poseCrowd(car, this.time.value, false);
    if (this.waterNormal) this.waterNormal.offset.set(this.time.value * 0.004, this.time.value * 0.003);
    if (this.riverNormal) this.riverNormal.offset.set(0, -this.time.value * 0.12);
    this.tunnelDarkness(dt, camera);
    if (this.flareSprites) this.flareSprites.forEach((s, i) => { s.scale.setScalar(1.4 + Math.sin(this.time.value * 23 + i * 7) * 0.25 + Math.sin(this.time.value * 37 + i) * 0.15); });
  }

  dispose() {
    for (const d of this.disposables) d.dispose && d.dispose();
    this.scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (m.map && m.map !== detailCache?.map) m.map.dispose(); m.dispose(); });
    });
    if (this.envRT) this.envRT.dispose();
  }
}

let _glow = null;
export function glowTexture() {
  if (_glow) return _glow;
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const x = cv.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,255,255,0.6)"); g.addColorStop(1, "rgba(255,255,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  _glow = new THREE.CanvasTexture(cv);
  return _glow;
}
