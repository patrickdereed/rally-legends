// Synthesised sound: engine (pitch from rpm, timbre from cylinders), turbo whistle and blow-off,
// surface roar, tyre squeal, wind, impacts, gear shifts, pops and UI beeps. No audio files.
import { clamp } from "./util.js";

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
    const c = this.ctx, n = {};
    n.out = this.gain(0); n.out.connect(this.master);
    n.o1 = c.createOscillator(); n.o1.type = "sawtooth";
    n.o2 = c.createOscillator(); n.o2.type = "square";
    n.o3 = c.createOscillator(); n.o3.type = "sawtooth";
    n.g1 = this.gain(0.5); n.g2 = this.gain(0.28); n.g3 = this.gain(0.22);
    n.shaper = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.4); }
    n.shaper.curve = curve;
    n.lp = this.filter("lowpass", 1200, 0.9);
    n.o1.connect(n.g1); n.o2.connect(n.g2); n.o3.connect(n.g3);
    [n.g1, n.g2, n.g3].forEach(g => g.connect(n.shaper));
    n.shaper.connect(n.lp); n.lp.connect(n.out);
    // intake/exhaust rasp
    n.ns = this.noise(); n.nbp = this.filter("bandpass", 900, 0.8); n.ng = this.gain(0);
    n.ns.connect(n.nbp); n.nbp.connect(n.ng); n.ng.connect(n.out);
    // turbo whistle
    n.turbo = c.createOscillator(); n.turbo.type = "sine"; n.tg = this.gain(0);
    n.turbo.connect(n.tg); n.tg.connect(this.master);
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
    for (const k of ["o1", "o2", "o3", "turbo", "hyb", "ns", "ss", "ks", "ws"]) n[k].start();
    n.out.gain.setTargetAtTime(1, c.currentTime, 0.3);
    this.car = n; this.spec = spec;
  }

  stopCar() {
    if (!this.car) return;
    const n = this.car;
    try { n.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    const stopAt = this.ctx.currentTime + 0.3;
    for (const k of ["o1", "o2", "o3", "turbo", "hyb", "ns", "ss", "ks", "ws"]) { try { n[k].stop(stopAt); } catch (e) { /* already stopped */ } }
    for (const k of ["tg", "hg", "sg", "kg", "wg"]) { try { n[k].gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); } catch (e) { /* ignore */ } }
    this.car = null;
  }

  update(veh, dt, extra) {
    if (!this.car || !this.ctx) return;
    const n = this.car, sp = this.spec, t = this.ctx.currentTime, T = 0.03;
    const rpm = veh.rpm, rr = rpm / sp.rpmMax, thr = veh.throttle;
    const fire = rpm / 60 * sp.cyl / 2;
    n.o1.frequency.setTargetAtTime(fire, t, T);
    n.o2.frequency.setTargetAtTime(fire * 0.5, t, T);
    n.o3.frequency.setTargetAtTime(fire * (sp.cyl === 5 ? 1.25 : sp.cyl === 6 ? 1.5 : 2.0) * 1.003, t, T);
    n.lp.frequency.setTargetAtTime(500 + thr * 2600 + rr * 2400, t, T);
    const shiftDuck = veh.shiftTimer > 0 ? 0.35 : 1;
    const ev = this.engineVol;
    n.g1.gain.setTargetAtTime((0.22 + thr * 0.3) * shiftDuck * ev, t, T);
    n.g2.gain.setTargetAtTime((0.14 + thr * 0.16) * shiftDuck * ev, t, T);
    n.g3.gain.setTargetAtTime((0.06 + thr * 0.12 * rr) * shiftDuck * ev, t, T);
    n.nbp.frequency.setTargetAtTime(400 + rr * 2400, t, T);
    n.ng.gain.setTargetAtTime((0.03 + thr * 0.12 * rr) * ev, t, T);
    if (sp.turbo) {
      n.turbo.frequency.setTargetAtTime(1800 + veh.boost * 4200, t, 0.05);
      n.tg.gain.setTargetAtTime(veh.boost * 0.035 * ev, t, 0.05);
    }
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
  pop() { this.burst(0.08, 700, "lowpass", 0.5); this.thump(160, 0.08, 0.5); }
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
