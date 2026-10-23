// Shared helpers: math, seeded randomness, gradient noise and formatting. No DOM or three.js here,
// so track.js and physics.js can run in Node for the headless tests.

export const TAU = Math.PI * 2;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}
export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function sign(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Mulberry32 with a few conveniences hung off the function.
export function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.gauss = () => {
    let u = 0;
    while (u === 0) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * r());
  };
  r.weighted = list => {
    let total = 0;
    for (const it of list) total += it.w;
    let x = r() * total;
    for (const it of list) { x -= it.w; if (x <= 0) return it; }
    return list[list.length - 1];
  };
  return r;
}

// 2D gradient noise (Perlin) with fbm and ridged variants. Output of noise() is roughly [-1, 1].
export function makeNoise(seed) {
  const r = makeRng(seed);
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = base[i]; base[i] = base[j]; base[j] = t;
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  const gx = [1, -1, 1, -1, 1.4142, -1.4142, 0, 0], gz = [1, 1, -1, -1, 0, 0, 1.4142, -1.4142];
  function grad(h, x, z) { const k = h & 7; return gx[k] * x + gz[k] * z; }
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function noise(x, z) {
    const xi = Math.floor(x), zi = Math.floor(z);
    const xf = x - xi, zf = z - zi;
    const X = xi & 255, Z = zi & 255;
    const u = fade(xf), v = fade(zf);
    const aa = p[p[X] + Z], ab = p[p[X] + Z + 1], ba = p[p[X + 1] + Z], bb = p[p[X + 1] + Z + 1];
    const x1 = lerp(grad(aa, xf, zf), grad(ba, xf - 1, zf), u);
    const x2 = lerp(grad(ab, xf, zf - 1), grad(bb, xf - 1, zf - 1), u);
    return lerp(x1, x2, v) * 0.75;
  }
  function fbm(x, z, oct = 5, lac = 2.03, gain = 0.5) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += noise(x * f + o * 17.3, z * f - o * 9.1) * amp; norm += amp; amp *= gain; f *= lac; }
    return s / norm;
  }
  function ridged(x, z, oct = 4) {
    let s = 0, amp = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(noise(x * f + o * 31.7, z * f + o * 7.7));
      s += n * n * amp; norm += amp; amp *= 0.5; f *= 2.1;
    }
    return s / norm;
  }
  return { noise, fbm, ridged };
}

export function fmtTime(t) {
  if (t == null || !isFinite(t)) return "--:--.--";
  const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2);
}
export function fmtDelta(d) {
  if (d == null || !isFinite(d)) return "";
  return (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(2);
}
export function fmtCredits(n) { return Math.round(n).toLocaleString("en-US") + " CR"; }
export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
