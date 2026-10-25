// Synthesised sound: engine, turbo whistle and blow-off, supercharger and gear whine, anti-lag, surface
// roar, tyre squeal, wind, impacts, gear shifts, pops and UI beeps. No audio files.
//
// The engine is a looped buffer of combustion pulses laid out at the engine's real firing intervals (one
// cycle = two crank turns), played back at a rate proportional to rpm. Firing order is most of what makes
// an engine recognisable: a boxer's uneven burble, a five's warble, a six's smooth wail. Exhaust and intake
// resonances are fixed-pitch filters after it, so they stay put while the pulses sweep through them.
import { clamp } from "./util.js";

// Pulses per 720° cycle: [crank angle, strength]. Boxer: even firing, but its unequal-length headers
// deliver the pulses unevenly. Fives fire every 144°, which gives the half-order warble.
const LAYOUTS = {
  i4: [[0, 1], [180, 0.96], [360, 1], [540, 0.97]],
  boxer: [[0, 1], [205, 0.72], [360, 0.96], [520, 0.68]],
  i5: [[0, 1], [144, 0.88], [288, 0.97], [432, 0.86], [576, 0.94]],
  v6: [[0, 1], [120, 0.86], [240, 0.98], [360, 0.84], [480, 0.97], [600, 0.87]],
  i6: [[0, 1], [120, 0.97], [240, 0.99], [360, 0.96], [480, 1], [600, 0.97]],
};
// Per car, after the engine its body is based on. bark/low: pulse ring and body (Hz at 3000 rpm); rasp: noise
// in each pulse; bright: upper harmonic; rough: cycle-to-cycle variation; res: fixed exhaust/intake
// resonances [Hz, Q, dB]; intake: carb/induction roar; whine: straight-cut gears; turbo: whistle level;
// sc: supercharger whine; als: anti-lag bangs on lift-off.
const SOUNDS = {
  mosquito: { layout: "i4", bark: 225, low: 95, rasp: 0.38, bright: 0.55, rough: 0.55, res: [[120, 1.4, 5], [1900, 1.2, 4]], intake: 0.6, whine: 0.9 },   // small A-series four, drop-gear whine
  sialia: { layout: "i4", bark: 200, low: 88, rasp: 0.26, bright: 0.45, rough: 0.35, res: [[110, 1.2, 5], [1200, 1, 3]], intake: 0.45, whine: 0.25 },     // SOHC four with twin carbs
  pennine: { layout: "i4", bark: 290, low: 105, rasp: 0.46, bright: 0.85, rough: 0.35, res: [[160, 1.3, 4], [2600, 1.6, 6]], intake: 0.95, whine: 0.6 }, // 16-valve four on twin Webers
  sanremo: { layout: "i4", bark: 250, low: 100, rasp: 0.4, bright: 0.7, rough: 0.35, res: [[140, 1.3, 5], [1700, 1.4, 5]], intake: 0.7, whine: 0.5 },   // twin-cam four, tuned exhaust
  lionne: { layout: "i4", bark: 240, low: 95, rasp: 0.4, bright: 0.65, rough: 0.35, res: [[150, 1.3, 5], [1100, 1.6, 4]], intake: 0.2, whine: 0.6, turbo: 1.1, als: 1 },
  asti: { layout: "i4", bark: 235, low: 95, rasp: 0.38, bright: 0.65, rough: 0.3, res: [[145, 1.3, 5], [1250, 1.6, 4]], intake: 0.2, whine: 0.6, turbo: 0.8, sc: 1, als: 1 },
  fairheaven: { layout: "i4", bark: 190, low: 84, rasp: 0.3, bright: 0.45, rough: 0.45, res: [[115, 1.2, 5], [900, 1.2, 3]], intake: 0.2, whine: 0.5, turbo: 1.25, als: 0.6 },
  pleiad: { layout: "boxer", bark: 170, low: 75, rasp: 0.3, bright: 0.5, rough: 0.3, res: [[85, 1.4, 7], [600, 1.5, 4]], intake: 0.15, whine: 0.6, turbo: 1, als: 1 },
  ronin: { layout: "i4", bark: 230, low: 90, rasp: 0.45, bright: 0.7, rough: 0.35, res: [[140, 1.3, 5], [1300, 1.6, 5]], intake: 0.15, whine: 0.6, turbo: 1.1, als: 1.2 },
  eagle: { layout: "v6", bark: 260, low: 95, rasp: 0.3, bright: 0.72, rough: 0.25, res: [[150, 1.3, 5], [1200, 1.6, 4]], intake: 0.15, whine: 0.3, turbo: 1.3, als: 0.5 },
  kaze: { layout: "i4", bark: 260, low: 95, rasp: 0.5, bright: 0.8, rough: 0.3, res: [[170, 1.3, 5], [1500, 1.7, 6]], intake: 0.1, whine: 1, turbo: 0.9, als: 1.4 },
  ferox: { layout: "i4", bark: 250, low: 92, rasp: 0.5, bright: 0.75, rough: 0.3, res: [[160, 1.3, 5], [1350, 1.7, 6]], intake: 0.1, whine: 1, turbo: 0.9, als: 1.4 },
};
export function soundFor(car) {
  return SOUNDS[car.id] || { layout: car.cyl === 5 ? "i5" : car.cyl === 6 ? "v6" : "i4", bark: 230, low: 92, rasp: 0.35, bright: 0.6, rough: 0.35, res: [[140, 1.3, 5], [1200, 1.5, 4]], intake: 0.3, whine: 0.4, turbo: car.turbo ? 1 : 0, als: car.turbo ? 0.8 : 0 };
}
const REF_RPM = 3000;

// One looped buffer of CYCLES engine cycles at REF_RPM, with small cycle-to-cycle variation so it doesn't
// sound like a pure tone.
function engineBuffer(ctx, snd) {
  const sr = ctx.sampleRate, CYCLES = 8, cycle = 120 / REF_RPM, n = Math.round(CYCLES * cycle * sr);
  const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), fires = LAYOUTS[snd.layout] || LAYOUTS.i4;
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const tau = 0.0034, len = Math.round(0.014 * sr);
  for (let c = 0; c < CYCLES; c++) for (const [ang, m] of fires) {
    const t0 = (c + ang / 720) * cycle + (rnd() - 0.5) * 0.0004 * snd.rough;
    const amp = m * (1 + (rnd() - 0.5) * 0.16 * snd.rough);
    const i0 = Math.round(t0 * sr);
    for (let k = 0; k < len; k++) {
      const t = k / sr, env = (1 - Math.exp(-t / 0.0003)) * Math.exp(-t / tau);
      const v = amp * (env * (Math.sin(2 * Math.PI * snd.bark * t) * 0.7 + Math.sin(2 * Math.PI * snd.bark * 2.03 * t) * 0.3 * snd.bright)
        + 0.6 * Math.exp(-t / (tau * 2.2)) * Math.sin(2 * Math.PI * snd.low * t)
        + snd.rasp * (rnd() * 2 - 1) * Math.exp(-t / (tau * 0.6)));
      d[(i0 + k) % n] += v;
    }
  }
  let mean = 0; for (let i = 0; i < n; i++) mean += d[i]; mean /= n;
  let peak = 0; for (let i = 0; i < n; i++) { d[i] -= mean; peak = Math.max(peak, Math.abs(d[i])); }
  for (let i = 0; i < n; i++) d[i] *= 0.9 / peak;
  return buf;
}

const SOURCES = ["eng", "ns", "is", "turbo", "sc", "gw", "hyb", "ss", "ks", "ws"];

export class AudioEngine {
  constructor() { this.ctx = null; this.vol = 0.8; this.engineVol = 0.9; this.muted = false; this.car = null; }

  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    this.applyVolume();
    const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  }
  setVolume(v, engine) { this.vol = v; if (engine != null) this.engineVol = engine; this.applyVolume(); }
  setMuted(m) { this.muted = m; this.applyVolume(); }
  applyVolume() { if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol * 0.7, this.ctx.currentTime, 0.05); }

  noise() { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; return s; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }

  startCar(spec) {
    if (!this.ctx) return;
    this.stopCar();
    const c = this.ctx, n = {}, snd = soundFor(spec.car || { cyl: spec.cyl, turbo: spec.turbo });
    n.out = this.gain(0); n.out.connect(this.master);
    // engine: pulse buffer -> drive -> fixed resonances -> tone filter
    n.eng = c.createBufferSource(); n.eng.buffer = engineBuffer(c, snd); n.eng.loop = true;
    n.eg = this.gain(0.5);
    n.shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.2); }
    n.shaper.curve = curve;
    let last = n.shaper;
    n.eng.connect(n.eg); n.eg.connect(n.shaper);
    for (const [f, q, db] of snd.res) { const r = this.filter("peaking", f, q); r.gain.value = db; last.connect(r); last = r; }
    n.lp = this.filter("lowpass", 1200, 0.8); last.connect(n.lp); n.lp.connect(n.out);
    // rev-limiter cut and overrun thin-out act on this
    n.cut = n.out;
    // intake/exhaust rasp
    n.ns = this.noise(); n.nbp = this.filter("bandpass", 900, 0.8); n.ng = this.gain(0);
    n.ns.connect(n.nbp); n.nbp.connect(n.ng); n.ng.connect(n.out);
    // carb/induction roar
    n.is = this.noise(); n.ibp = this.filter("bandpass", 350, 1.2); n.ig = this.gain(0);
    n.is.connect(n.ibp); n.ibp.connect(n.ig); n.ig.connect(n.out);
    // turbo whistle
    n.turbo = c.createOscillator(); n.turbo.type = "sine"; n.tg = this.gain(0);
    n.turbo.connect(n.tg); n.tg.connect(this.master);
    // supercharger whine (crank-driven, so it follows rpm)
    n.sc = c.createOscillator(); n.sc.type = "triangle"; n.scg = this.gain(0);
    n.sc.connect(n.scg); n.scg.connect(this.master);
    // straight-cut gear whine (follows road speed)
    n.gw = c.createOscillator(); n.gw.type = "sine"; n.gwg = this.gain(0);
    n.gw.connect(n.gwg); n.gwg.connect(this.master);
    // hybrid whine
    n.hyb = c.createOscillator(); n.hyb.type = "triangle"; n.hg = this.gain(0);
    n.hyb.connect(n.hg); n.hg.connect(this.master);
    // surface roar, skid and wind
    n.ss = this.noise(); n.sf = this.filter("bandpass", 600, 0.6); n.sg = this.gain(0);
    n.ss.connect(n.sf); n.sf.connect(n.sg); n.sg.connect(this.master);
    n.ks = this.noise(); n.kf = this.filter("bandpass", 1300, 6); n.kg = this.gain(0);
    n.ks.connect(n.kf); n.kf.connect(n.kg); n.kg.connect(this.master);
    n.ws = this.noise(); n.wf = this.filter("lowpass", 500, 0.5); n.wg = this.gain(0);
    n.ws.connect(n.wf); n.wf.connect(n.wg); n.wg.connect(this.master);
    for (const k of SOURCES) n[k].start();
    n.out.gain.setTargetAtTime(1, c.currentTime, 0.3);
    this.car = n; this.spec = spec; this.snd = snd; this.lastThr = 0; this.als = 0; this.popT = 0; this.limT = 0;
  }

  stopCar() {
    if (!this.car) return;
    const n = this.car;
    try { n.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    const stopAt = this.ctx.currentTime + 0.3;
    for (const k of SOURCES) { try { n[k].stop(stopAt); } catch (e) { /* already stopped */ } }
    for (const k of ["tg", "scg", "gwg", "hg", "sg", "kg", "wg"]) { try { n[k].gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); } catch (e) { /* ignore */ } }
    this.car = null;
  }

  update(veh, dt, extra) {
    if (!this.car || !this.ctx) return;
    const n = this.car, sp = this.spec, snd = this.snd, t = this.ctx.currentTime, T = 0.03;
    const rpm = veh.rpm, rr = rpm / sp.rpmMax, thr = veh.throttle, ev = this.engineVol;
    n.eng.playbackRate.setTargetAtTime(Math.max(0.15, rpm / REF_RPM), t, T);
    n.lp.frequency.setTargetAtTime(450 + thr * 2600 + rr * 2600, t, T);
    // rev limiter: the ignition cuts in bursts
    this.limT += dt;
    const onLimiter = rr > 0.985 && thr > 0.7;
    const cut = onLimiter && Math.floor(this.limT * 16) % 2 === 0 ? 0.25 : 1;
    const shiftDuck = veh.shiftTimer > 0 ? 0.35 : 1;
    n.eg.gain.setTargetAtTime((0.3 + thr * 0.5) * shiftDuck * cut * ev, t, T * 0.5);
    n.nbp.frequency.setTargetAtTime(400 + rr * 2400, t, T);
    n.ng.gain.setTargetAtTime((0.025 + thr * 0.1 * rr) * ev, t, T);
    n.ibp.frequency.setTargetAtTime(220 + rr * 900, t, T);
    n.ig.gain.setTargetAtTime(thr * rr * 0.09 * (snd.intake || 0) * ev, t, T);
    if (sp.turbo) {
      n.turbo.frequency.setTargetAtTime(1800 + veh.boost * 4200, t, 0.05);
      n.tg.gain.setTargetAtTime(veh.boost * 0.035 * (snd.turbo ?? 1) * ev, t, 0.05);
    }
    if (snd.sc) {
      n.sc.frequency.setTargetAtTime(rpm / 60 * 9, t, T);
      n.scg.gain.setTargetAtTime((0.01 + thr * 0.03) * (1 - rr * 0.45) * snd.sc * ev, t, T);
    }
    n.gw.frequency.setTargetAtTime(120 + veh.speed * 48, t, T);
    n.gwg.gain.setTargetAtTime(clamp(veh.speed / 25, 0, 1) * (0.004 + (1 - thr) * 0.006) * (snd.whine || 0) * ev, t, 0.08);
    // anti-lag: a run of bangs after lifting from boost; carb cars crackle a little on the overrun
    if (snd.als && this.lastThr > 0.6 && thr < 0.2 && rr > 0.45) this.als = 0.5 + 0.4 * snd.als;
    this.lastThr = thr;
    this.popT -= dt;
    if (this.popT <= 0) {
      if (this.als > 0 && thr < 0.3) { this.pop(0.35 + Math.random() * 0.35 * snd.als); this.popT = 0.06 + Math.random() * 0.12; }
      else if (!snd.als && thr < 0.05 && rr > 0.55 && Math.random() < 0.08) { this.pop(0.12); this.popT = 0.15; }
      else this.popT = 0.05;
    }
    this.als = Math.max(0, this.als - dt);
    n.hg.gain.setTargetAtTime(veh.boosting ? 0.03 : 0, t, 0.05);
    n.hyb.frequency.setTargetAtTime(600 + veh.speed * 40, t, 0.05);
    const s = veh.speed, surf = extra.surf;
    const loose = surf === "gravel" || surf === "sand" || surf === "rock" || surf === "scrub" || surf === "mud" || surf === "grass";
    n.sf.frequency.setTargetAtTime(loose ? 1600 : surf === "snow" || surf === "deepsnow" ? 900 : 380, t, 0.1);
    n.sg.gain.setTargetAtTime(veh.airborne ? 0 : clamp(s / 40, 0, 1) * (loose ? 0.22 : 0.12), t, 0.06);
    const skid = !veh.airborne && (surf === "tarmac" || surf === "concrete") ? clamp(extra.slip - 0.45, 0, 1) : 0;
    n.kg.gain.setTargetAtTime(skid * 0.16, t, 0.05);
    n.wg.gain.setTargetAtTime(clamp(s * s / 3500, 0, 0.12), t, 0.1);
  }

  burst(dur, f, type, vol, q = 1, sweep) {
    if (!this.ctx) return;
    const c = this.ctx, s = this.noise(), fl = this.filter(type, f, q), g = this.gain(0), t = c.currentTime;
    s.connect(fl); fl.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    if (sweep) fl.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  thump(f, dur, vol) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = this.gain(0), t = c.currentTime;
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.4, t + dur);
    o.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
  }
  impact(mag, soft) {
    const v = clamp(mag / 20, 0.08, 1);
    this.burst(soft ? 0.35 : 0.25, soft ? 500 : 1800, soft ? "lowpass" : "bandpass", v * (soft ? 0.5 : 0.8), 0.7);
    this.thump(soft ? 70 : 110, 0.3, v * 0.9);
  }
  land(mag) { this.thump(65, 0.35, clamp(mag / 10, 0.1, 0.9)); this.burst(0.2, 400, "lowpass", clamp(mag / 14, 0.05, 0.5)); }
  blowoff() { this.burst(0.35, 3500, "highpass", 0.18, 0.7, 1200); }
  pop(v = 1) { this.burst(0.08, 700, "lowpass", 0.5 * v); this.thump(160, 0.08, 0.5 * v); }
  shift() { this.burst(0.05, 2500, "bandpass", 0.06, 2); }
  beep(high) {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = this.gain(0), t = c.currentTime;
    o.type = "square"; o.frequency.value = high ? 1320 : 660;
    o.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.5 : 0.18));
    o.start(t); o.stop(t + 0.6);
  }
  click() {
    if (!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = this.gain(0), t = c.currentTime;
    o.type = "triangle"; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.05);
    o.connect(g); g.connect(this.master);
    g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.start(t); o.stop(t + 0.1);
  }
  cash() { this.beep(true); setTimeout(() => this.beep(true), 90); }
}
