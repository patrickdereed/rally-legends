// Stage generator. Builds a deterministic point-to-point rally stage for a location: centreline, road
// elevation with crests and jumps, a terrain height grid blended into the road, roadside walls, ice
// patches, pace notes and every scenery placement. Pure data (no three.js) so physics can use it in Node.
import { makeRng, makeNoise, clamp, lerp, smoothstep, hashStr, wrapAngle, TAU } from "./util.js";
import { ROAD_SURFACES } from "./data.js";

export const STEP = 2;            // metres between centreline samples
export const START_S = 20;        // car start line
export const FINISH_BACK = 150;   // finish line distance from the end of the road
const DEG = Math.PI / 180;

export function buildStage(loc, stageIdx, opts = {}) {
  const def = loc.stages[stageIdx];
  const seed = hashStr(loc.id + "/" + stageIdx + "/v1");
  const r = makeRng(seed);
  const line = genCenterline(loc.gen, def.len, r);
  return new Stage(loc, def, stageIdx, seed, line, r, opts);
}

// ---------- Centreline ----------
function genCenterline(gen, targetLen, r) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const res = tryCenterline(gen, targetLen, r);
    if (res) return res;
  }
  throw new Error("Could not lay out the stage");
}

function tryCenterline(gen, targetLen, r) {
  const xs = [], zs = [], hs = [];
  const cell = 20, hash = new Map();
  const key = (cx, cz) => (cx + 4096) * 8192 + (cz + 4096);
  const minClear = gen.minClear, maxR = gen.maxR;
  const backSkip = Math.ceil(Math.max(140, minClear * 4) / STEP);
  let x = 0, z = 0, h = r() * TAU, k = 0, turnSum = 0;

  function addPoint(px, pz, ph) {
    const i = xs.length;
    xs.push(px); zs.push(pz); hs.push(ph);
    const kk = key(Math.floor(px / cell), Math.floor(pz / cell));
    let arr = hash.get(kk);
    if (!arr) { arr = []; hash.set(kk, arr); }
    arr.push(i);
  }
  function simulate(pieces) {
    let tx = x, tz = z, th = h, tk = k, turn = 0;
    const out = [];
    for (const [len, kt] of pieces) {
      const n = Math.max(1, Math.round(len / STEP));
      for (let j = 0; j < n; j++) {
        tk += (kt - tk) * Math.min(1, STEP / 9);
        th += tk * STEP; turn += tk * STEP;
        tx += Math.sin(th) * STEP; tz += Math.cos(th) * STEP;
        out.push(tx, tz, th);
      }
    }
    return { out, tx, tz, th, tk, turn };
  }
  function valid(out) {
    const base = xs.length, rr = Math.ceil(minClear / cell), mc2 = minClear * minClear;
    for (let j = 0; j < out.length; j += 3) {
      const px = out[j], pz = out[j + 1];
      if (px * px + pz * pz > maxR * maxR) return false;
      const idx = base + j / 3, cx = Math.floor(px / cell), cz = Math.floor(pz / cell);
      for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
        const arr = hash.get(key(cx + dx, cz + dz));
        if (!arr) continue;
        for (const i of arr) {
          if (idx - i < backSkip) continue;
          const ex = xs[i] - px, ez = zs[i] - pz;
          if (ex * ex + ez * ez < mc2) return false;
        }
      }
    }
    return true;
  }
  function commit(sim) {
    for (let j = 0; j < sim.out.length; j += 3) addPoint(sim.out[j], sim.out[j + 1], sim.out[j + 2]);
    x = sim.tx; z = sim.tz; h = sim.th; k = sim.tk; turnSum += sim.turn;
  }
  function chooseDir() {
    const dist = Math.hypot(x, z);
    let bias = -clamp(turnSum / (TAU * 0.75), -1, 1) * 0.35;
    if (dist > maxR * 0.45) {
      const dh = wrapAngle(Math.atan2(-x, -z) - h);
      bias += Math.sign(dh) * clamp((dist - maxR * 0.45) / (maxR * 0.4), 0, 1) * 0.7;
    }
    return r() < 0.5 + bias ? 1 : -1;
  }
  function makePiece(dir) {
    const p = r.weighted(gen.pieces);
    if (p.type === "straight") return [[r.range(p.len[0], p.len[1]), 0]];
    if (p.type === "corner") {
      const R = r.range(p.R[0], p.R[1]), a = r.range(p.ang[0], p.ang[1]) * DEG;
      return [[R * a, dir / R], [16, 0]];
    }
    if (p.type === "hairpin") {
      const R = r.range(p.R[0], p.R[1]), a = r.range(165, 185) * DEG;
      return [[30, 0], [R * a, dir / R], [30, 0]];
    }
    if (p.type === "switchback") {
      const R = r.range(p.R[0], p.R[1]), L = r.range(p.len[0], p.len[1]), a = r.range(172, 184) * DEG;
      return [[24, 0], [R * a, dir / R], [L, 0], [R * a, -dir / R], [24, 0]];
    }
    // esses
    const R = r.range(p.R[0], p.R[1]), a = r.range(p.ang[0], p.ang[1]) * DEG;
    return [[R * a, dir / R], [R * a * r.range(0.8, 1.2), -dir / R], [14, 0]];
  }

  addPoint(x, z, h);
  commit(simulate([[110, 0]]));
  while (xs.length * STEP < targetLen - FINISH_BACK - 20) {
    const dir = chooseDir();
    let ok = false;
    for (let t = 0; t < 18 && !ok; t++) {
      const sim = simulate(makePiece(t % 2 ? -dir : dir));
      if (valid(sim.out)) { commit(sim); ok = true; }
    }
    if (!ok) return null;
  }
  const fin = simulate([[FINISH_BACK + 30, 0]]);
  if (!valid(fin.out)) return null;
  commit(fin);
  return { x: Float32Array.from(xs), z: Float32Array.from(zs), h: Float32Array.from(hs), n: xs.length };
}

function boxBlur(src, radius, passes) {
  const n = src.length;
  let a = Float32Array.from(src), b = new Float32Array(n);
  for (let p = 0; p < passes; p++) {
    let sum = 0;
    const cnt = radius * 2 + 1;
    for (let i = -radius; i <= radius; i++) sum += a[clamp(i, 0, n - 1)];
    for (let i = 0; i < n; i++) {
      b[i] = sum / cnt;
      sum += a[clamp(i + radius + 1, 0, n - 1)] - a[clamp(i - radius, 0, n - 1)];
    }
    const t = a; a = b; b = t;
  }
  return a;
}

const SHOULDER = { tarmac: "gravel", concrete: "gravel", gravel: "gravel", snow: "snow", mud: "mud", sand: "sand" };

// ---------- Stage ----------
export class Stage {
  constructor(loc, def, idx, seed, line, r, opts) {
    this.loc = loc; this.def = def; this.idx = idx; this.seed = seed;
    this.name = def.name;
    this.x = line.x; this.z = line.z; this.h = line.h; this.n = line.n;
    this.L = (this.n - 1) * STEP;
    this.w = loc.roadW / 2;
    this.surface = loc.surface;
    this.shoulderSurf = SHOULDER[loc.surface] || "gravel";
    this.offroad = loc.offroad;
    this.startS = START_S;
    this.finishS = this.L - FINISH_BACK;
    this.wet = def.weather === "rain";
    this.noise = makeNoise(seed ^ 0x5bd1e995);
    const n = this.n;

    // Curvature from heading change, lightly smoothed.
    const kRaw = new Float32Array(n);
    for (let i = 1; i < n - 1; i++) kRaw[i] = wrapAngle(this.h[i + 1] - this.h[i - 1]) / (2 * STEP);
    this.k = boxBlur(kRaw, 2, 2);

    this.buildHash();
    this.buildElevation(r);
    this.buildIce(r);
    this.buildSurfaces(opts.surface);
    this.buildGrid(opts.cell || 6, opts.maxVerts || 420000);
    this.buildWalls(r);
    this.buildNotes(r);
    this.buildScenery(r, opts.density == null ? 1 : opts.density);
  }

  // Terrain height before blending into the road.
  baseHeight(x, z) {
    const E = this.loc.elev, sc = E.scale, nz = this.noise;
    return E.amp * nz.fbm(x * sc, z * sc, 5) + E.ridge * (nz.ridged(x * sc * 0.7 + 40, z * sc * 0.7 - 20, 4) - 0.5);
  }

  buildHash() {
    this.cell = 16;
    this.hash = new Map();
    for (let i = 0; i < this.n; i++) {
      const kk = this.hkey(Math.floor(this.x[i] / this.cell), Math.floor(this.z[i] / this.cell));
      let a = this.hash.get(kk);
      if (!a) { a = []; this.hash.set(kk, a); }
      a.push(i);
    }
  }
  hkey(cx, cz) { return (cx + 4096) * 8192 + (cz + 4096); }

  buildElevation(r) {
    const n = this.n, E = this.loc.elev;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = this.baseHeight(this.x[i], this.z[i]);
    let y = boxBlur(raw, Math.max(2, Math.round(E.smooth / STEP / 1.7)), 3);
    const g = E.maxGrade * STEP;
    for (let it = 0; it < 2; it++) {
      for (let i = 1; i < n; i++) y[i] = clamp(y[i], y[i - 1] - g, y[i - 1] + g);
      for (let i = n - 2; i >= 0; i--) y[i] = clamp(y[i], y[i + 1] - g, y[i + 1] + g);
    }
    y = boxBlur(y, 3, 2);
    // Flatten the start and finish areas.
    const s0 = Math.round(60 / STEP);
    for (let i = 0; i < s0; i++) y[i] = lerp(y[s0], y[i], i / s0);
    const f0 = Math.round((this.finishS - 30) / STEP);
    for (let i = f0; i < n; i++) y[i] = y[f0] + (y[i] - y[f0]) * 0.3;

    // Crests and jumps: asymmetric humps (gentle run-up, steeper drop) on near-straight sections.
    const C = this.loc.crests;
    this.crests = [];
    const want = Math.round(this.L / 1000 * C.perKm);
    const used = [];
    const straightAt = i => {
      for (let j = i - 15; j <= i + 15; j++) if (Math.abs(this.k[clamp(j, 0, n - 1)]) > 1 / 160) return false;
      return true;
    };
    const place = (s, hgt, wUp, big) => {
      const i0 = Math.round(s / STEP), wDown = wUp * 0.78;
      for (let i = Math.max(0, i0 - Math.ceil(wUp * 2.5 / STEP)); i < Math.min(n, i0 + Math.ceil(wDown * 2.5 / STEP)); i++) {
        const u = (i * STEP - s) / (i < i0 ? wUp : wDown);
        y[i] += hgt * Math.exp(-u * u);
      }
      this.crests.push({ s, h: hgt, big: !!big });
      used.push(s);
    };
    if (this.def.bigJump) {
      for (let tries = 0; tries < 200; tries++) {
        const s = r.range(0.72, 0.9) * this.finishS, i = Math.round(s / STEP);
        if (straightAt(i)) { place(s, 4.6, 26, true); break; }
      }
    }
    for (let tries = 0; tries < want * 40 && this.crests.length < want + (this.def.bigJump ? 1 : 0); tries++) {
      const s = r.range(160, this.finishS - 60), i = Math.round(s / STEP);
      if (used.some(u => Math.abs(u - s) < 140) || !straightAt(i)) continue;
      place(s, r.range(C.h[0], C.h[1]), r.range(C.w[0], C.w[1]), false);
    }
    this.crests.sort((a, b) => a.s - b.s);
    this.y = y;
    let mn = Infinity;
    for (let i = 0; i < n; i++) mn = Math.min(mn, y[i]);
    this.minRoadY = mn;
  }

  // Road surface sections. The rally's mix alternates main-surface stretches with shorter other ones
  // (own RNG, so the road layout is the same whatever the surface). A forced surface covers everything.
  buildSurfaces(forced) {
    const n = this.n;
    this.surfIdx = new Uint8Array(n);
    this.sections = [];
    const mix = this.loc.mix || [[this.loc.surface, 1]];
    if (forced && forced !== "mixed") {
      this.sections.push({ s0: 0, s1: this.L, surf: forced });
      this.surface = forced;
    } else {
      const main = mix[0][0], rr = makeRng(this.seed ^ 0x51f1);
      this.surface = main;
      let s = 0, cur = main;
      while (s < this.L) {
        let end = Math.min(this.L, s + (cur === main ? rr.range(300, 750) : rr.range(150, 520)));
        if (end > this.finishS - 60) end = this.L;
        this.sections.push({ s0: s, s1: end, surf: cur });
        s = end;
        cur = cur === main && mix.length > 1 ? rr.weighted(mix.slice(1).map(([id, w]) => ({ id, w }))).id : main;
      }
    }
    for (const sec of this.sections) {
      const code = ROAD_SURFACES.indexOf(sec.surf);
      for (let i = Math.floor(sec.s0 / STEP); i <= Math.min(n - 1, Math.floor(sec.s1 / STEP)); i++) this.surfIdx[i] = code;
    }
    this.shoulderSurf = SHOULDER[this.surface] || "gravel";
  }
  surfAt(i) { return ROAD_SURFACES[this.surfIdx[i]]; }

  buildIce(r) {
    this.ice = new Uint8Array(this.n);
    this.icePatches = [];
    const per = this.def.ice || 0;
    const count = Math.round(this.L / 1000 * per);
    for (let c = 0; c < count; c++) {
      const s0 = r.range(150, this.finishS - 80), len = r.range(20, 55);
      for (let i = Math.round(s0 / STEP); i < Math.round((s0 + len) / STEP); i++) this.ice[clamp(i, 0, this.n - 1)] = 1;
      this.icePatches.push([s0, s0 + len]);
    }
  }

  // Terrain grid: base noise, blended to the road height near the road (up to two road "legs" per vertex
  // so switchbacks get a smooth embankment between them). Also records distance to the road per vertex.
  buildGrid(cell, maxVerts) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.n; i++) {
      minX = Math.min(minX, this.x[i]); maxX = Math.max(maxX, this.x[i]);
      minZ = Math.min(minZ, this.z[i]); maxZ = Math.max(maxZ, this.z[i]);
    }
    const margin = 450;
    minX -= margin; minZ -= margin; maxX += margin; maxZ += margin;
    while (((maxX - minX) / cell + 1) * ((maxZ - minZ) / cell + 1) > maxVerts) cell *= 1.1;
    const nx = Math.floor((maxX - minX) / cell) + 2, nz = Math.floor((maxZ - minZ) / cell) + 2, N = nx * nz;
    const hgt = new Float32Array(N), d1 = new Float32Array(N).fill(1e9), d2 = new Float32Array(N).fill(1e9);
    const i1 = new Int32Array(N).fill(-1), i2 = new Int32Array(N).fill(-1);
    for (let gz = 0; gz < nz; gz++) for (let gx = 0; gx < nx; gx++) hgt[gz * nx + gx] = this.baseHeight(minX + gx * cell, minZ + gz * cell);

    const w = this.w, blendW = this.loc.walls === "stone" ? 20 : 28, R = w + 1.2 + blendW;
    const legGap = Math.ceil(R * 2 / STEP) + 6;
    for (let i = 0; i < this.n; i++) {
      const px = this.x[i], pz = this.z[i];
      const gx0 = Math.max(0, Math.floor((px - R - minX) / cell)), gx1 = Math.min(nx - 1, Math.ceil((px + R - minX) / cell));
      const gz0 = Math.max(0, Math.floor((pz - R - minZ) / cell)), gz1 = Math.min(nz - 1, Math.ceil((pz + R - minZ) / cell));
      for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
        const dx = minX + gx * cell - px, dz = minZ + gz * cell - pz, dd = dx * dx + dz * dz;
        if (dd > R * R) continue;
        const v = gz * nx + gx, d = Math.sqrt(dd);
        if (i1[v] < 0 || Math.abs(i - i1[v]) < legGap) {
          if (d < d1[v]) { d1[v] = d; i1[v] = i; }
        } else if (d < d1[v]) {
          d2[v] = d1[v]; i2[v] = i1[v]; d1[v] = d; i1[v] = i;
        } else if (i2[v] < 0 || Math.abs(i - i2[v]) < legGap) {
          if (d < d2[v]) { d2[v] = d; i2[v] = i; }
        } else if (d < d2[v]) { d2[v] = d; i2[v] = i; }
      }
    }
    for (let v = 0; v < N; v++) {
      if (i1[v] < 0) continue;
      const t1 = 1 - smoothstep(w + 1.2, w + 1.2 + blendW, d1[v]);
      let wsum = t1, tsum = t1 * (this.y[i1[v]] - 0.3), mx = t1;
      if (i2[v] >= 0) {
        const t2 = 1 - smoothstep(w + 1.2, w + 1.2 + blendW, d2[v]);
        wsum += t2; tsum += t2 * (this.y[i2[v]] - 0.3); mx = Math.max(mx, t2);
      }
      if (wsum > 0) hgt[v] = lerp(hgt[v], tsum / wsum, Math.min(1, mx));
    }
    this.grid = { x0: minX, z0: minZ, cell, nx, nz, h: hgt, d: d1, i: i1 };

    // Water level: lakes in the low ground, or a sea for coastal rallies. Never above the road.
    this.waterY = null;
    const wt = this.loc.water;
    if (wt) {
      const sorted = Float32Array.from(hgt).sort();
      const q = sorted[Math.floor(sorted.length * (wt === "sea" ? 0.16 : wt))];
      this.waterY = Math.min(q, this.minRoadY - (wt === "sea" ? 8 : 2.5));
    }
  }

  gridH(x, z) {
    const g = this.grid;
    const fx = clamp((x - g.x0) / g.cell, 0, g.nx - 1.001), fz = clamp((z - g.z0) / g.cell, 0, g.nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const v = iz * g.nx + ix;
    return lerp(lerp(g.h[v], g.h[v + 1], tx), lerp(g.h[v + g.nx], g.h[v + g.nx + 1], tx), tz);
  }
  gridRoadDist(x, z) {
    const g = this.grid;
    const gx = clamp(Math.round((x - g.x0) / g.cell), 0, g.nx - 1), gz = clamp(Math.round((z - g.z0) / g.cell), 0, g.nz - 1);
    return g.d[gz * g.nx + gx];
  }

  // Nearest point on the centreline. With a hint (last index) the search is local, which also stops
  // progress jumping across to a neighbouring leg of a switchback.
  locate(x, z, hint, out) {
    out = out || {};
    let best = -1, bd = Infinity;
    if (hint != null && hint >= 0) {
      const a = Math.max(0, hint - 30), b = Math.min(this.n - 1, hint + 30);
      for (let i = a; i <= b; i++) {
        const dx = this.x[i] - x, dz = this.z[i] - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) {
      const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
      for (let ring = 0; ring <= 6 && best < 0; ring++) {
        for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const a = this.hash.get(this.hkey(cx + dx, cz + dz));
          if (!a) continue;
          for (const i of a) {
            const ex = this.x[i] - x, ez = this.z[i] - z, d = ex * ex + ez * ez;
            if (d < bd) { bd = d; best = i; }
          }
        }
        if (best >= 0 && ring < 6) {
          // one more ring to be sure the nearest is not just across a cell border
          const r2 = ring + 1;
          for (let dx = -r2; dx <= r2; dx++) for (let dz = -r2; dz <= r2; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r2) continue;
            const a = this.hash.get(this.hkey(cx + dx, cz + dz));
            if (!a) continue;
            for (const i of a) {
              const ex = this.x[i] - x, ez = this.z[i] - z, d = ex * ex + ez * ez;
              if (d < bd) { bd = d; best = i; }
            }
          }
        }
      }
      if (best < 0) {
        for (let i = 0; i < this.n; i += 4) {
          const ex = this.x[i] - x, ez = this.z[i] - z, d = ex * ex + ez * ez;
          if (d < bd) { bd = d; best = i; }
        }
      }
    }
    // Project onto the better of the two adjacent segments.
    let i = best, t = 0;
    const proj = j => {
      if (j < 0 || j >= this.n - 1) return null;
      const ax = this.x[j], az = this.z[j], ux = this.x[j + 1] - ax, uz = this.z[j + 1] - az;
      const tt = clamp(((x - ax) * ux + (z - az) * uz) / (ux * ux + uz * uz), 0, 1);
      const fx = ax + ux * tt - x, fz = az + uz * tt - z;
      return { j, tt, d2: fx * fx + fz * fz };
    };
    const p1 = proj(best), p0 = proj(best - 1);
    let p = p1 && p0 ? (p1.d2 <= p0.d2 ? p1 : p0) : (p1 || p0);
    if (p) { i = p.j; t = p.tt; }
    const j = Math.min(i + 1, this.n - 1);
    const hx = lerp(this.x[i], this.x[j], t), hz = lerp(this.z[i], this.z[j], t);
    const hh = this.h[i] + wrapAngle(this.h[j] - this.h[i]) * t;
    out.i = i; out.t = t; out.s = (i + t) * STEP;
    out.d = (x - hx) * Math.cos(hh) - (z - hz) * Math.sin(hh); // left of the road is positive
    out.y = lerp(this.y[i], this.y[j], t);
    out.heading = hh;
    return out;
  }

  // Ground height and surface for a wheel or the camera.
  ground(x, z, hint, out) {
    out = out || {};
    const q = this.locate(x, z, hint, this._q || (this._q = {}));
    const ad = Math.abs(q.d), w = this.w;
    out.i = q.i; out.d = q.d;
    if (ad <= w) {
      out.y = q.y; out.onRoad = true;
      out.surf = this.ice[q.i] ? "ice" : this.surfAt(q.i);
    } else {
      const gy = this.gridH(x, z);
      out.y = ad < w + 3 ? lerp(q.y, gy, smoothstep(w, w + 3, ad)) : gy;
      out.onRoad = false;
      out.surf = ad < w + 1.6 ? SHOULDER[this.surfAt(q.i)] || "gravel" : this.offroad;
      if (this.waterY != null && gy < this.waterY - 0.15) out.surf = "water";
    }
    return out;
  }

  pointAt(s, out) {
    out = out || {};
    const f = clamp(s / STEP, 0, this.n - 1.001), i = Math.floor(f), t = f - i;
    out.x = lerp(this.x[i], this.x[i + 1], t); out.z = lerp(this.z[i], this.z[i + 1], t);
    out.y = lerp(this.y[i], this.y[i + 1], t);
    out.h = this.h[i] + wrapAngle(this.h[i + 1] - this.h[i]) * t;
    out.i = i;
    return out;
  }

  // Roadside walls per sample and side: 0 none, 1 armco, 2 snow bank, 3 stone wall.
  buildWalls(r) {
    const n = this.n, w = this.w;
    this.wallL = new Uint8Array(n); this.wallR = new Uint8Array(n);
    const kind = this.loc.walls, snowEdges = this.def.snowEdges;
    const fill = (arr, a, b, v) => { for (let i = Math.max(0, a); i < Math.min(n, b); i++) arr[i] = v; };
    const s0 = Math.round(45 / STEP), s1 = Math.round((this.finishS + 40) / STEP);
    if (kind === "snowbank") {
      fill(this.wallL, s0, s1, 2); fill(this.wallR, s0, s1, 2);
      for (let g = 0; g < this.L / 350; g++) {
        const at = r.int(s0, s1), side = r.chance(0.5) ? this.wallL : this.wallR;
        fill(side, at, at + r.int(4, 8), 0);
      }
    } else if (snowEdges) {
      for (let i = s0; i < s1; i += r.int(20, 60)) if (r.chance(0.45)) fill(r.chance(0.5) ? this.wallL : this.wallR, i, i + r.int(10, 30), 2);
    }
    if (this.loc.barriers || kind === "stone") {
      // Armco where the ground drops away, stone walls on some uphill sides.
      for (let i = s0; i < s1; i++) {
        const c = Math.cos(this.h[i]), s = Math.sin(this.h[i]);
        for (const side of [1, -1]) {
          const px = this.x[i] + c * side * (w + 9), pz = this.z[i] - s * side * (w + 9);
          const dy = this.gridH(px, pz) - this.y[i];
          const arr = side > 0 ? this.wallL : this.wallR;
          if (arr[i]) continue;
          if (this.loc.barriers && dy < -2.2) arr[i] = 1;
          else if (kind === "stone" && dy > 2.5 && (Math.floor(i / 40) + this.seed) % 3 !== 0) arr[i] = 3;
        }
      }
      // Remove slivers shorter than 16 m and close gaps shorter than 10 m.
      for (const arr of [this.wallL, this.wallR]) {
        for (let i = 0; i < n;) {
          if (!arr[i]) { let j = i; while (j < n && !arr[j]) j++; if (i > 0 && j < n && j - i < 5 && arr[i - 1] === arr[j]) fill(arr, i, j, arr[j]); i = j; continue; }
          let j = i; while (j < n && arr[j] === arr[i]) j++;
          if (j - i < 8 && arr[i] !== 2) fill(arr, i, j, 0);
          i = j;
        }
      }
    }
  }

  // Pace notes: corners graded 1 (slowest) to 6 (fastest) plus hairpins, crests, jumps and ice.
  buildNotes(r) {
    const n = this.n, k = this.k, notes = [];
    const thr = 1 / 380;
    let i = Math.round(this.startS / STEP);
    const end = Math.round(this.finishS / STEP);
    while (i < end) {
      if (Math.abs(k[i]) < thr) { i++; continue; }
      const dir = Math.sign(k[i]);
      let j = i, gap = 0, last = i;
      while (j < n - 1) {
        j++;
        if (Math.sign(k[j]) === dir && Math.abs(k[j]) > thr * 0.7) { last = j; gap = 0; }
        else if (++gap > 7) break;
      }
      const i0 = i, i1 = last;
      let kmax = 0, ang = 0, mid = Math.round((i0 + i1) / 2), k1 = 0, k2 = 0;
      for (let q = i0; q <= i1; q++) {
        kmax = Math.max(kmax, Math.abs(k[q])); ang += k[q] * STEP;
        if (q < mid) k1 = Math.max(k1, Math.abs(k[q])); else k2 = Math.max(k2, Math.abs(k[q]));
      }
      i = i1 + 1;
      const R = 1 / Math.max(kmax, 1e-5), A = Math.abs(ang) / DEG;
      if (A < 14) continue;
      let grade;
      if (R < 21 || (A > 140 && R < 30)) grade = "H";
      else if (R < 32) grade = 1;
      else if (R < 50) grade = 2;
      else if (R < 75) grade = 3;
      else if (R < 110) grade = 4;
      else if (R < 170) grade = 5;
      else if (R < 300) grade = 6;
      else { if (A < 22) continue; grade = "F"; }
      const mods = [];
      if (A > 100 && grade !== "H") mods.push("long");
      if (grade !== "H" && k2 > k1 * 1.45) mods.push("tightens");
      else if (grade !== "H" && k1 > k2 * 1.45) mods.push("opens");
      notes.push({ kind: "corner", s: i0 * STEP, sEnd: i1 * STEP, dir: dir > 0 ? "L" : "R", grade, R, mods });
    }
    for (const c of this.crests) notes.push({ kind: c.h > 2.7 || c.big ? "jump" : "crest", s: c.s - 25, sEnd: c.s, mods: c.big ? ["big"] : [] });
    for (const p of this.icePatches) notes.push({ kind: "ice", s: p[0] - 10, sEnd: p[1], mods: [] });
    for (const sec of this.sections.slice(1)) if (sec.s0 < this.finishS - 20) notes.push({ kind: "surface", s: sec.s0 - 30, sEnd: sec.s0, to: sec.surf, mods: [] });
    notes.push({ kind: "finish", s: this.finishS, sEnd: this.finishS, mods: [] });
    notes.sort((a, b) => a.s - b.s);
    // Caution after long straights, distances / "into" links, and the occasional "don't cut".
    let prevEnd = this.startS;
    for (let q = 0; q < notes.length; q++) {
      const nt = notes[q];
      if (nt.kind === "corner") {
        if ((nt.grade === "H" || nt.grade === 1 || nt.grade === 2) && nt.s - prevEnd > 170) nt.mods.unshift("caution");
        if (nt.grade !== "H" && typeof nt.grade === "number" && nt.grade <= 3 && r.chance(0.18)) { nt.mods.push("dontcut"); nt.cutRock = true; }
        prevEnd = nt.sEnd;
      }
      const nx = notes[q + 1];
      if (nx) {
        const gap = nx.s - nt.sEnd;
        nt.link = gap < 28 ? "into" : gap < 45 ? "and" : [50, 70, 100, 150, 200, 250, 300, 400, 500].reduce((b, v) => gap >= v ? v : b, 50);
      }
    }
    this.notes = notes;
  }

  // ---------- Scenery placement ----------
  // Near-road vegetation is placed in full regardless of quality (it collides); far scenery is scaled by density.
  buildScenery(r, density) {
    const w = this.w, L = this.L, loc = this.loc;
    const trees = [], obstacles = [], crowds = [], props = [];
    const q = {};
    const roadDistAt = (x, z) => Math.abs(this.locate(x, z, null, q).d);
    const underWater = y => this.waterY != null && y < this.waterY + 0.3;
    const TREE_R = { pine: 0.28, spruce: 0.3, birch: 0.22, broadleaf: 0.4, olive: 0.35, acacia: 0.3, eucalyptus: 0.3, cactus: 0.35, bush: 0, rock: 1 };

    for (const v of loc.veg) {
      const nearCount = Math.round(v.n * L / 1000);
      for (let c = 0; c < nearCount; c++) {
        const i = r.int(0, this.n - 1), side = r.chance(0.5) ? 1 : -1;
        const d = w + v.dmin * r.range(0.8, 1.3) + (-Math.log(1 - r() * 0.999)) * 14;
        const along = r.range(-STEP, STEP);
        const c0 = Math.cos(this.h[i]), s0 = Math.sin(this.h[i]);
        const x = this.x[i] + c0 * side * d + s0 * along, z = this.z[i] - s0 * side * d + c0 * along;
        if (roadDistAt(x, z) < w + v.dmin * 0.75) continue;
        const y = this.gridH(x, z);
        if (underWater(y)) continue;
        this.addTree(trees, obstacles, v, x, y, z, r, TREE_R, true);
      }
      const g = this.grid, area = (g.nx * g.cell) * (g.nz * g.cell) / 1e6;
      const farCount = Math.round(v.far * area * density);
      for (let c = 0; c < farCount; c++) {
        const x = g.x0 + r() * g.cell * (g.nx - 1), z = g.z0 + r() * g.cell * (g.nz - 1);
        if (this.gridRoadDist(x, z) < w + 12) continue;
        const y = this.gridH(x, z);
        if (underWater(y)) continue;
        this.addTree(trees, null, v, x, y, z, r, TREE_R, false);
      }
    }

    // Spectator zones: inside of slow corners, both sides of jumps, the start and the finish.
    const zones = [{ s: START_S + 8, side: 0, n: 30 }, { s: this.finishS + 6, side: 0, n: 26 }];
    const slow = this.notes.filter(nt => nt.kind === "corner" && (nt.grade === "H" || nt.grade <= 2));
    const jumps = this.notes.filter(nt => nt.kind === "jump");
    for (const j of jumps) zones.push({ s: j.sEnd, side: 0, n: j.mods.includes("big") ? 60 : 22 });
    const wantZones = Math.round(L / 1000 * 2.2 * loc.crowd);
    for (let c = 0; c < wantZones && slow.length; c++) {
      const nt = slow[r.int(0, slow.length - 1)];
      const mid = (nt.s + nt.sEnd) / 2;
      if (zones.some(zn => Math.abs(zn.s - mid) < 60)) continue;
      zones.push({ s: mid, side: nt.dir === "L" ? 1 : -1, n: r.int(14, 34), corner: nt });
    }
    for (const zn of zones) {
      const count = Math.round(zn.n * Math.max(0.5, loc.crowd));
      const sides = zn.side ? [zn.side] : [1, -1];
      for (const side of sides) {
        for (let c = 0; c < count / sides.length; c++) {
          const s = clamp(zn.s + r.range(-26, 26), 4, L - 4), p = this.pointAt(s);
          const d = w + 7 + r() * 9 + (zn.corner ? 2 : 0);
          const x = p.x + Math.cos(p.h) * side * d, z = p.z - Math.sin(p.h) * side * d;
          if (roadDistAt(x, z) < w + 5.5) continue;
          const y = this.gridH(x, z);
          if (underWater(y)) continue;
          crowds.push({ x, y, z, rot: p.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + r.range(-0.5, 0.5), shirt: r.int(0, 11), flag: r.chance(0.12), flare: r.chance(0.08), h: r.range(0.92, 1.08), ph: r() * TAU });
        }
        // Tape line between the crowd and the road.
        for (let s = zn.s - 30; s <= zn.s + 30; s += 6) {
          const p = this.pointAt(clamp(s, 2, L - 2)), d = w + 4.6;
          const x = p.x + Math.cos(p.h) * side * d, z = p.z - Math.sin(p.h) * side * d;
          if (roadDistAt(x, z) < w + 3.5) continue;
          props.push({ type: "tapepost", x, y: this.gridH(x, z), z, s, side, zone: zn.s });
        }
      }
      if (zn.corner) {
        // Hay bales on the outside of the corner, chevrons behind them.
        const out = -zn.side, apex = (zn.corner.s + zn.corner.sEnd) / 2;
        for (let b = -2; b <= 2; b++) {
          const p = this.pointAt(apex + b * 3.2), d = w + 1.9;
          const x = p.x + Math.cos(p.h) * out * d, z = p.z - Math.sin(p.h) * out * d;
          if (roadDistAt(x, z) < w + 1.2) continue;
          const y = this.gridH(x, z);
          props.push({ type: "bale", x, y, z, rot: p.h });
          obstacles.push({ x, z, r: 0.75, soft: true, kind: "bale" });
        }
      }
    }
    // Chevron boards on the outside of every hairpin and grade-1/2 corner.
    for (const nt of slow) {
      const out = nt.dir === "L" ? -1 : 1, apex = (nt.s + nt.sEnd) / 2;
      for (const off of [-5, 0, 5]) {
        const p = this.pointAt(apex + off), d = w + 3.0;
        const x = p.x + Math.cos(p.h) * out * d, z = p.z - Math.sin(p.h) * out * d;
        if (roadDistAt(x, z) < w + 2.4) continue;
        props.push({ type: "chevron", x, y: this.gridH(x, z), z, rot: p.h + (out > 0 ? -Math.PI / 2 : Math.PI / 2), dir: nt.dir });
        obstacles.push({ x, z, r: 0.25, soft: true, kind: "sign" });
      }
    }
    // A rock on the inside of "don't cut" corners.
    for (const nt of this.notes) {
      if (!nt.cutRock) continue;
      const inside = nt.dir === "L" ? 1 : -1, p = this.pointAt((nt.s + nt.sEnd) / 2), d = w + 1.6;
      const x = p.x + Math.cos(p.h) * inside * d, z = p.z - Math.sin(p.h) * inside * d;
      if (roadDistAt(x, z) < w + 1.0) continue;
      trees.push({ type: "rock", x, y: this.gridH(x, z), z, scale: 1.1, rot: r() * TAU, near: true });
      obstacles.push({ x, z, r: 1.0, kind: "rock" });
    }
    // Houses in small hamlets.
    const hamlets = Math.round(L / 1000 * loc.houses * 1.6);
    for (let hgt = 0; hgt < hamlets; hgt++) {
      const s = r.range(200, this.finishS - 100), count = r.int(2, 5);
      for (let c = 0; c < count; c++) {
        const p = this.pointAt(s + r.range(-60, 60)), side = r.chance(0.5) ? 1 : -1, d = w + r.range(11, 26);
        const x = p.x + Math.cos(p.h) * side * d, z = p.z - Math.sin(p.h) * side * d;
        const hw = r.range(3, 4.6), hd = r.range(3.5, 5);
        if (roadDistAt(x, z) < w + Math.max(hw, hd) + 3) continue;
        const y = this.gridH(x, z);
        if (underWater(y)) continue;
        props.push({ type: "house", x, y, z, rot: p.h + (r.chance(0.5) ? 0 : Math.PI / 2), w: hw, d: hd, ht: r.range(3.2, 5.5), tint: r() });
        obstacles.push({ x, z, r: Math.max(hw, hd) * 0.95, kind: "house" });
      }
    }
    // Telegraph poles along stretches of road.
    if (loc.poles > 0) {
      let s = r.range(60, 300);
      while (s < this.finishS) {
        const runLen = r.range(300, 800) * loc.poles + 150, side = r.chance(0.5) ? 1 : -1, run = [];
        for (let t = s; t < Math.min(s + runLen, this.finishS); t += 48) {
          const p = this.pointAt(t), d = w + 6.5;
          const x = p.x + Math.cos(p.h) * side * d, z = p.z - Math.sin(p.h) * side * d;
          if (roadDistAt(x, z) < w + 4.5) { run.length = 0; continue; }
          const y = this.gridH(x, z);
          if (underWater(y)) continue;
          run.push({ type: "pole", x, y, z, rot: p.h });
          obstacles.push({ x, z, r: 0.2, kind: "pole" });
        }
        if (run.length > 1) props.push({ type: "wire", pts: run.map(o => [o.x, o.y + 7.2, o.z]) });
        props.push(...run);
        s += runLen + r.range(300, 900);
      }
    }
    // Start and finish furniture.
    for (const [type, s] of [["startArch", START_S], ["finishArch", this.finishS], ["stopBoard", this.finishS + 110]]) {
      const p = this.pointAt(s);
      props.push({ type, x: p.x, y: p.y, z: p.z, rot: p.h });
      if (type !== "stopBoard") for (const side of [1, -1]) {
        const d = w + 1.6;
        obstacles.push({ x: p.x + Math.cos(p.h) * side * d, z: p.z - Math.sin(p.h) * side * d, r: 0.35, kind: "post" });
      }
    }

    this.trees = trees; this.crowds = crowds; this.props = props;
    this.obstacles = obstacles;
    this.obsCell = 8;
    this.obsHash = new Map();
    obstacles.forEach((o, idx) => {
      const kk = this.hkey(Math.floor(o.x / this.obsCell), Math.floor(o.z / this.obsCell));
      let a = this.obsHash.get(kk);
      if (!a) { a = []; this.obsHash.set(kk, a); }
      a.push(idx);
    });
  }

  addTree(trees, obstacles, v, x, y, z, r, TREE_R, near) {
    const scale = v.type === "rock" ? r.range(0.5, 1.6) : v.type === "bush" ? r.range(0.6, 1.4) : r.range(0.75, 1.3);
    trees.push({ type: v.type, x, y, z, scale, rot: r() * TAU, snowy: !!v.snowy, near, tint: r() });
    if (obstacles && TREE_R[v.type] > 0) obstacles.push({ x, z, r: TREE_R[v.type] * (v.type === "rock" ? scale : Math.sqrt(scale)), kind: v.type === "rock" ? "rock" : "tree" });
  }

  obstaclesNear(x, z, cb) {
    const c = this.obsCell, cx = Math.floor(x / c), cz = Math.floor(z / c);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const a = this.obsHash.get(this.hkey(cx + dx, cz + dz));
      if (a) for (const idx of a) cb(this.obstacles[idx]);
    }
  }
}

// Pace-note text for the co-driver and the HUD.
const NUM = ["", "one", "two", "three", "four", "five", "six"];
export function noteText(nt) {
  const parts = [];
  if (nt.kind === "corner") {
    if (nt.mods.includes("caution")) parts.push("caution");
    const dir = nt.dir === "L" ? "left" : "right";
    if (nt.grade === "H") parts.push("hairpin " + dir);
    else if (nt.grade === "F") parts.push("flat " + dir);
    else parts.push(dir + " " + NUM[nt.grade]);
    for (const m of nt.mods) {
      if (m === "long") parts.push("long");
      else if (m === "tightens") parts.push("tightens");
      else if (m === "opens") parts.push("opens");
      else if (m === "dontcut") parts.push("don't cut");
    }
  } else if (nt.kind === "crest") parts.push("over crest");
  else if (nt.kind === "jump") parts.push(nt.mods.includes("big") ? "big jump, flat out" : "jump");
  else if (nt.kind === "ice") parts.push("caution, ice");
  else if (nt.kind === "surface") parts.push("onto " + nt.to);
  else if (nt.kind === "finish") parts.push("flat to finish");
  if (nt.link === "into") parts.push("into");
  else if (nt.link === "and") parts.push("and");
  else if (nt.link) parts.push(String(nt.link));
  return parts.join(", ");
}
