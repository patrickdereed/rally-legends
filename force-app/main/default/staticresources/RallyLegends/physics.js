// Vehicle dynamics. A two-axle model with a combined-slip tyre curve per axle, longitudinal weight
// transfer, drivetrain layouts, turbo lag, hybrid boost, gearbox, handbrake, driver assists, jumps,
// walls, obstacle collisions and damage. Pure JS: no three.js, runs in Node for the headless tests.
import { SURFACES, PART_BY_ID } from "./data.js";
import { clamp, lerp, smoothstep, wrapAngle } from "./util.js";
import { STEP } from "./track.js";

export const G = 9.81;
const RHO = 1.2;
export const DT = 1 / 120;

// Normalised engine torque against rpm/rpmMax; peak power lands at the limiter.
export function torqueCurve(t) { return Math.max(0.3, 0.6625 + 1.125 * t - 0.9375 * t * t); }

// Turn a car + its part levels (+ damage) into the numbers the simulation uses.
export function buildSpec(car, parts, damage) {
  const lv = id => (parts && parts[id]) || 0;
  const g = id => PART_BY_ID[id].gains;
  const mass = car.mass * (1 - g("weight").mass[lv("weight")]);
  const powerW = car.hp * 745.7 * (1 + g("engine").power[lv("engine")]);
  const omegaMax = car.rpmMax * Math.PI / 30;
  const torquePeak = powerW / (omegaMax * torqueCurve(1)) * (1 + g("drivetrain").torque[lv("drivetrain")]);
  const wheelR = car.body.wheelR;
  const crr = 0.015;
  let vPow = 40;
  for (let it = 0; it < 30; it++) vPow = Math.cbrt(Math.max(1, powerW * 0.97 - crr * mass * G * vPow) / (0.5 * RHO * car.cdA));
  const vGear = car.gearTop * (1 + g("drivetrain").top[lv("drivetrain")] + g("engine").power[lv("engine")] * 0.12);
  const topRatio = omegaMax * wheelR / vGear;
  const firstFrac = car.gears <= 4 ? 0.34 : car.gears === 5 ? 0.3 : 0.27;
  const firstRatio = topRatio / firstFrac;
  const gears = [];
  for (let i = 0; i < car.gears; i++) gears.push(firstRatio * Math.pow(topRatio / firstRatio, i / (car.gears - 1)));
  const L = car.wheelbase, b = car.cgFront * L, a = L - b; // a: CG to front axle, b: CG to rear axle
  const dmg = damage || { engine: 0, susp: 0, body: 0 };
  return {
    car, mass, powerW, torquePeak, rpmIdle: car.rpmIdle, rpmMax: car.rpmMax, gears, revRatio: gears[0] * 1.1,
    wheelR, drive: car.drive, awdRear: car.awdRear || 0.5, wheelbase: L, a, b, track: car.track, hCG: car.hCG,
    cdA: car.cdA, clA: car.clA, iz: mass * a * b * 1.05,
    grip: car.grip * (1 + g("tyres").grip[lv("tyres")] + g("suspension").grip[lv("suspension")]),
    brakeForce: mass * G * 0.78 * car.brake * (1 + g("brakes").brake[lv("brakes")]),
    steerMax: car.steerMax * (1 + g("suspension").steer[lv("suspension")]),
    landRes: g("suspension").landing[lv("suspension")],
    turbo: car.turbo, hybridW: (car.hybridKw || 0) * 1000,
    shiftT: car.shiftT * g("drivetrain").shift[lv("drivetrain")],
    vTop: Math.min(vGear, vPow), cyl: car.cyl, dmg: { engine: dmg.engine || 0, susp: dmg.susp || 0, body: dmg.body || 0 }
  };
}

// Ideal-driver lap time along the stage for a spec: cornering-speed limit from curvature and grip, then
// forward (traction/power) and backward (braking) passes. Used to set rival pace.
export function referenceTime(stage, spec) {
  const n = stage.n, v = new Float32Array(n);
  const m = spec.mass;
  const muAt = i => { const id = stage.ice[i] ? "ice" : stage.surfAt(i); return SURFACES[id].mu * spec.grip * (stage.wet ? WET[id] || 1 : 1); };
  for (let i = 0; i < n; i++) {
    const mu = muAt(i) * 0.94;
    const R = 1 / Math.max(Math.abs(stage.k[i]), 1e-4);
    const denom = 1 - mu * 0.5 * RHO * spec.clA * R / m;
    const vc = denom > 0.15 ? Math.sqrt(mu * G * R / denom) : 999;
    v[i] = Math.min(spec.vTop, vc);
  }
  const trac = spec.drive === "AWD" ? 0.95 : spec.drive === "RWD" ? 0.62 : 0.58;
  let cur = 0;
  const s0 = Math.round(stage.startS / STEP), s1 = Math.round(stage.finishS / STEP);
  v[s0] = 0;
  for (let i = s0 + 1; i <= s1; i++) {
    const mu = muAt(i);
    const drag = 0.5 * RHO * spec.cdA * cur * cur + 0.02 * m * G;
    const acc = Math.min(spec.powerW * 0.85 / (m * Math.max(cur, 4)), mu * G * trac) - drag / m;
    cur = Math.min(v[i], Math.sqrt(Math.max(0, cur * cur + 2 * acc * STEP)));
    v[i] = cur;
  }
  for (let i = s1 - 1; i >= s0; i--) {
    const mu = muAt(i);
    const dec = Math.min(mu * G * 0.92, spec.brakeForce / m) + 0.5 * RHO * spec.cdA * v[i + 1] * v[i + 1] / m;
    v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * dec * STEP));
  }
  let t = 0;
  for (let i = s0; i < s1; i++) t += STEP / Math.max(0.5, (v[i] + v[i + 1]) / 2);
  return { time: t, profile: v };
}

const ZERO_DMG = { engine: 0, susp: 0, body: 0 };
// Grip multiplier on a wet stage, by surface.
const WET = { tarmac: 0.8, concrete: 0.82, gravel: 0.93, mud: 0.88, sand: 0.95, snow: 1, ice: 1 };

export class Vehicle {
  constructor(spec, stage, opts = {}) {
    this.spec = spec;
    this.stage = stage;
    this.assist = opts.assist || { steer: true, abs: true, tc: false };
    this.manual = !!opts.manual;
    this.ghost = !!opts.ghost; // benchmark runs skip obstacle collisions
    this.dmg = Object.assign({}, spec.dmg || ZERO_DMG);
    this.wheels = [0, 1, 2, 3].map(i => ({ front: i < 2, left: i % 2 === 0, x: 0, y: 0, z: 0, surf: "tarmac", onRoad: true, slip: 0, spin: 0, lock: false, rot: 0, comp: 0, gy: 0 }));
    this.g = {};
    this.events = [];
    this.reset(stage.startS);
  }

  reset(s) {
    const p = this.stage.pointAt(s);
    this.x = p.x; this.z = p.z; this.heading = p.h;
    this.vx = 0; this.vz = 0; this.r = 0;
    this.hint = p.i;
    const gr = this.stage.ground(p.x, p.z, p.i, this.g);
    this.y = gr.y + 0.02; this.vy = 0; this.prevGroundY = gr.y;
    this.airborne = false; this.airTime = 0;
    this.gear = 1; this.shiftTimer = 0; this.rpm = this.spec.rpmIdle;
    this.boost = 0; this.hybridE = 1; this.boosting = false;
    this.steer = 0; this.axLong = 0; this.ayLat = 0;
    this.pitchV = 0; this.rollV = 0; this.pitchVV = 0; this.rollVV = 0;
    this.groundPitch = 0; this.groundRoll = 0; this.airPitch = 0;
    this.revTimer = 0; this.limiter = false; this.throttle = 0; this.brake = 0;
    this.slipAngle = 0; this.spinF = 0; this.spinR = 0;
    this.d = 0; this.s = s; this.maxS = s;
    this.speed = 0; this.vLong = 0;
    for (const w of this.wheels) { w.slip = 0; w.spin = 0; w.lock = false; }
    this.placeWheels();
  }

  // ---- helpers ----
  shift(to) {
    if (to === this.gear || this.shiftTimer > 0) return;
    if (to > this.spec.gears.length || to < -1) return;
    this.gear = to;
    this.gearTime = 0;
    this.shiftTimer = to === -1 || to === 1 ? 0.15 : this.spec.shiftT;
    this.events.push({ type: "shift", up: to > 0 });
  }

  placeWheels() {
    const sp = this.spec, fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = Math.cos(this.heading), lz = -Math.sin(this.heading), ht = sp.track / 2;
    for (const w of this.wheels) {
      const along = w.front ? sp.a : -sp.b, side = w.left ? ht : -ht;
      w.x = this.x + fx * along + lx * side;
      w.z = this.z + fz * along + lz * side;
      const gr = this.stage.ground(w.x, w.z, this.hint, this.g);
      w.gy = gr.y; w.surf = gr.surf; w.onRoad = gr.onRoad;
    }
  }

  // ---- main step ----
  // input: steer -1..1 (right +), throttle 0..1, brake 0..1, handbrake bool, analog bool, shiftUp/shiftDown bool
  step(dt, inp) {
    const sp = this.spec, st = this.stage, W = this.wheels;
    const m = sp.mass, L = sp.wheelbase, a = sp.a, b = sp.b;

    // Orientation
    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let lx = Math.cos(this.heading), lz = -Math.sin(this.heading);
    let vLong = this.vx * fx + this.vz * fz, vLat = this.vx * lx + this.vz * lz;
    const speed = Math.hypot(this.vx, this.vz);

    // Ground under the wheels
    this.placeWheels();
    const yF = (W[0].gy + W[1].gy) / 2, yR = (W[2].gy + W[3].gy) / 2, yLft = (W[0].gy + W[2].gy) / 2, yRgt = (W[1].gy + W[3].gy) / 2;
    const groundY = (yF + yR) / 2;
    this.groundPitch = Math.atan2(yF - yR, L);
    this.groundRoll = Math.atan2(yLft - yRgt, sp.track);

    // Vertical motion: gravity, then the ground pushes up. Leaving a crest faster than gravity = airborne.
    const groundVy = (groundY - this.prevGroundY) / dt;
    this.prevGroundY = groundY;
    const wasAir = this.airborne;
    const vyBefore = this.vy;
    this.vy -= G * dt;
    this.y += this.vy * dt;
    if (this.y <= groundY) {
      if (wasAir) {
        const impact = Math.max(0, Math.min(groundVy, 9) - vyBefore);
        if (this.airTime > 0.12 && impact > 2) this.events.push({ type: "land", mag: impact, air: this.airTime });
        if (impact > 9) {
          const dm = (impact - 9) * 0.025 * (1 - sp.landRes);
          this.dmg.susp = Math.min(1, this.dmg.susp + dm);
          this.dmg.body = Math.min(1, this.dmg.body + dm * 0.4);
        }
      }
      this.y = groundY;
      this.vy = Math.max(this.vy, Math.min(groundVy, 9));
      this.airborne = false; this.airTime = 0;
    } else {
      this.airborne = this.y > groundY + 0.06;
      if (this.airborne) this.airTime += dt;
    }

    // ---- driver inputs ----
    const rev = this.gear === -1;
    let thr = clamp(inp.throttle || 0, 0, 1), brk = clamp(inp.brake || 0, 0, 1);
    if (rev) { const t = thr; thr = brk; brk = t; }
    const hb = !!inp.handbrake;
    // steering: rate-limited for keys, direct for analog sticks
    const tgt = clamp(inp.steer || 0, -1, 1);
    if (inp.analog) this.steer = lerp(this.steer, tgt, Math.min(1, dt * 18));
    else {
      const rate = (Math.sign(tgt) !== Math.sign(this.steer) || tgt === 0 ? 7.5 : 4.2) * dt;
      this.steer += clamp(tgt - this.steer, -rate, rate);
    }
    const maxSteer = sp.steerMax * lerp(1, 0.3, clamp((speed - 6) / 38, 0, 1)) * (1 - this.dmg.susp * 0.15);
    let delta = -this.steer * maxSteer;
    const beta = speed > 4 ? Math.atan2(vLat, Math.abs(vLong)) : 0;
    this.slipAngle = beta;
    if (this.assist.steer && !this.airborne && speed > 5 && vLong > 0) delta += clamp(beta * 0.75, -0.35, 0.35) * (hb ? 0.3 : 1);
    delta += this.dmg.susp * 0.035;
    delta = clamp(delta, -sp.steerMax * 1.2, sp.steerMax * 1.2);
    this.delta = delta;

    // ---- gearbox ----
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    this.gearTime = (this.gearTime || 0) + dt;
    const n = sp.gears.length;
    if (this.manual) {
      if (inp.shiftUp) this.shift(this.gear === -1 ? 1 : this.gear + 1);
      if (inp.shiftDown) this.shift(this.gear === 1 ? (speed < 2 ? -1 : 1) : this.gear - 1);
    } else if (this.shiftTimer <= 0) {
      if (this.gear >= 1 && !this.airborne) {
        // Decide on road speed, not engine rpm: wheelspin and clutch slip at launch inflate the engine
        // rpm and would make the box hunt between gears. Wide hysteresis plus a minimum time in gear.
        const rpmW = Math.abs(vLong) / sp.wheelR * sp.gears[this.gear - 1] * 30 / Math.PI;
        const ratioDown = this.gear > 1 ? sp.gears[this.gear - 2] / sp.gears[this.gear - 1] : 0;
        // ...but if the tyres are spinning the engine onto the limiter, short-shift as a driver would.
        const up = this.gear < n && thr > 0.15 && this.gearTime > 0.3 &&
          (rpmW > sp.rpmMax * 0.94 || (this.rpm > sp.rpmMax * 0.98 && rpmW > sp.rpmMax * 0.68));
        const lugging = rpmW < sp.rpmMax * (thr > 0.6 ? 0.44 : 0.36);
        const braking = brk > 0.3 && rpmW < sp.rpmMax * 0.62;
        const down = this.gear > 1 && this.gearTime > 0.7 && (lugging || braking) && rpmW * ratioDown < sp.rpmMax * 0.86;
        if (up) this.shift(this.gear + 1);
        else if (down) this.shift(this.gear - 1);
      }
      // reverse when stopped and holding brake; back to first with throttle
      const rawBrake = clamp(inp.brake || 0, 0, 1), rawThr = clamp(inp.throttle || 0, 0, 1);
      if (this.gear >= 1 && speed < 0.8 && rawBrake > 0.5 && rawThr < 0.1) { this.revTimer += dt; if (this.revTimer > 0.35) { this.shift(-1); this.revTimer = 0; } }
      else if (this.gear === -1 && rawThr > 0.3 && vLong > -1.5) { this.shift(1); this.revTimer = 0; }
      else this.revTimer = 0;
    }

    // ---- engine ----
    const ratio = this.gear > 0 ? sp.gears[this.gear - 1] : this.gear < 0 ? -sp.revRatio : 0;
    const wheelOmega = vLong / sp.wheelR;
    const rpmWheel = Math.abs(wheelOmega * ratio) * 30 / Math.PI;
    const spin = Math.max(this.spinF, this.spinR);
    let rpmTarget;
    if (this.airborne) rpmTarget = lerp(this.rpm, sp.rpmIdle + thr * (sp.rpmMax - sp.rpmIdle), 0.5);
    else if (Math.abs(this.gear) === 1 && rpmWheel < sp.rpmMax * 0.5) rpmTarget = Math.max(rpmWheel * (1 + spin), sp.rpmIdle + thr * (sp.rpmMax * 0.55 - sp.rpmIdle));
    else rpmTarget = Math.max(sp.rpmIdle, rpmWheel * (1 + spin * 0.6));
    this.rpm = clamp(lerp(this.rpm, rpmTarget, Math.min(1, dt * 14)), sp.rpmIdle * 0.9, sp.rpmMax * 1.02);
    this.limiter = this.rpm >= sp.rpmMax * 0.995;
    const tr = this.rpm / sp.rpmMax;
    // turbo
    let turboMul = 1;
    if (sp.turbo) {
      const want = thr * smoothstep(0.28, 0.55, tr);
      this.boost += (want - this.boost) * Math.min(1, dt / (want > this.boost ? sp.turbo.lag : 0.12));
      turboMul = 1 - sp.turbo.depth * (1 - this.boost);
      if (thr < 0.2 && this.lastThr > 0.6 && this.boost > 0.45) this.events.push({ type: "blowoff", boost: this.boost });
    }
    this.lastThr = thr;
    let T = sp.torquePeak * torqueCurve(tr) * turboMul * (1 - this.dmg.engine * 0.35) * thr;
    if (this.limiter || this.shiftTimer > 0) T = 0;
    if (thr < 0.05 && this.gear !== 0) T = -sp.torquePeak * 0.1 * tr; // engine braking
    let Fdrive = T * ratio * 0.9 / sp.wheelR;
    if (this.gear < 0 && vLong > 0.5) Fdrive = Math.min(Fdrive, 0);
    // hybrid boost: deploys at full throttle, regenerates under braking
    this.boosting = false;
    if (sp.hybridW > 0) {
      if (thr > 0.92 && this.gear >= 2 && this.hybridE > 0 && !this.airborne && this.shiftTimer <= 0) {
        Fdrive += sp.hybridW / Math.max(vLong, 6); this.hybridE = Math.max(0, this.hybridE - dt / 4.5); this.boosting = true;
      }
      if (brk > 0.2) this.hybridE = Math.min(1, this.hybridE + dt * 0.16 * brk);
    }
    const rearShare = sp.drive === "RWD" ? 1 : sp.drive === "FWD" ? 0 : sp.awdRear;
    let FdF = Fdrive * (1 - rearShare), FdR = Fdrive * rearShare;

    // ---- loads ----
    const down = 0.5 * RHO * sp.clA * vLong * vLong;
    const dN = m * clamp(this.axLong, -14, 14) * sp.hCG / L;
    const Nf = Math.max(0.12 * m * G, m * G * b / L - dN + down * 0.48);
    const Nr = Math.max(0.12 * m * G, m * G * a / L + dN + down * 0.52);

    // Surface per axle
    const sF0 = SURFACES[W[0].surf], sF1 = SURFACES[W[1].surf], sR0 = SURFACES[W[2].surf], sR1 = SURFACES[W[3].surf];
    const wet = w => st.wet && w.onRoad ? WET[w.surf] || 1 : 1;
    const gripMul = sp.grip * (1 - this.dmg.susp * 0.18);
    const muF = (sF0.mu * wet(W[0]) + sF1.mu * wet(W[1])) / 2 * gripMul, muR = (sR0.mu * wet(W[2]) + sR1.mu * wet(W[3])) / 2 * gripMul;
    const BF = (sF0.B + sF1.B) / 2, CF = (sF0.C + sF1.C) / 2, BR = (sR0.B + sR1.B) / 2, CR = (sR0.C + sR1.C) / 2;
    const crr = (sF0.crr + sF1.crr + sR0.crr + sR1.crr) / 4;

    let ax = 0, az = 0;
    this.spinF = 0; this.spinR = 0;
    let lockF = false, lockR = false;
    if (!this.airborne) {
      const cosd = Math.cos(delta), sind = Math.sin(delta);
      // front axle velocity in the wheel frame
      const vfx = vLong, vfy = vLat + a * this.r;
      const wfx = vfx * cosd + vfy * sind, wfy = -vfx * sind + vfy * cosd;
      const alphaF = -Math.atan2(wfy, Math.max(Math.abs(wfx), 0.8));
      const wrx = vLong, wry = vLat - b * this.r;
      const alphaR = -Math.atan2(wry, Math.max(Math.abs(wrx), 0.8));
      const DF = muF * Nf, DR = muR * Nr;
      const rsF = Math.abs(wfx) < 0.2 ? 0 : Math.sign(wfx), rsR = Math.abs(wrx) < 0.2 ? 0 : Math.sign(wrx);

      // brakes (front-biased) and handbrake
      const Fb = brk * sp.brakeForce;
      let FxF = FdF, FxR = FdR;
      let bF = Fb * 0.62, bR = Fb * 0.38;
      // traction control trims drive to the available grip
      if (this.assist.tc) { if (Math.abs(FxF) > DF * 0.95) FxF = Math.sign(FxF) * DF * 0.95; if (Math.abs(FxR) > DR * 0.95) FxR = Math.sign(FxR) * DR * 0.95; }
      // front
      if (bF > 0 && rsF !== 0) {
        if (bF > DF && !this.assist.abs) { lockF = true; FxF = -rsF * DF * 0.88; }
        else FxF -= rsF * Math.min(bF, DF * 0.98);
      }
      if (Math.abs(FxF) > DF) { this.spinF = clamp((Math.abs(FxF) - DF) / Math.max(Math.abs(FxF), 1), 0, 1); FxF = Math.sign(FxF) * DF * 0.92; }
      let DyF = Math.sqrt(Math.max(DF * DF - FxF * FxF, (0.28 * DF) * (0.28 * DF)));
      if (lockF) DyF *= 0.35;
      const FyF = DyF * Math.sin(CF * Math.atan(BF * alphaF));
      // rear
      if (hb && rsR !== 0) { lockR = true; FxR = -rsR * DR * 0.85; }
      else if (bR > 0 && rsR !== 0) {
        if (bR > DR && !this.assist.abs) { lockR = true; FxR = -rsR * DR * 0.88; }
        else FxR -= rsR * Math.min(bR, DR * 0.98);
      }
      if (Math.abs(FxR) > DR) { this.spinR = clamp((Math.abs(FxR) - DR) / Math.max(Math.abs(FxR), 1), 0, 1); FxR = Math.sign(FxR) * DR * 0.92; }
      let DyR = Math.sqrt(Math.max(DR * DR - FxR * FxR, (0.25 * DR) * (0.25 * DR)));
      if (lockR) DyR *= hb ? 0.42 : 0.35;
      const FyR = DyR * Math.sin(CR * Math.atan(BR * alphaR));

      // body-frame totals
      const Fx = FxF * cosd - FyF * sind + FxR;
      const Fy = FxF * sind + FyF * cosd + FyR;
      // slope gravity
      const gLong = -G * Math.sin(this.groundPitch), gLat = -G * Math.sin(this.groundRoll);
      const aLong = Fx / m + gLong, aLat = Fy / m + gLat;
      ax = aLong * fx + aLat * lx; az = aLong * fz + aLat * lz;
      // yaw
      const Mz = a * (FxF * sind + FyF * cosd) - b * FyR;
      this.r += Mz / sp.iz * dt;
      this.r *= 1 - 0.8 * dt;
      this.axLong = lerp(this.axLong, Fx / m, Math.min(1, dt * 8));
      this.ayLat = lerp(this.ayLat, Fy / m, Math.min(1, dt * 8));
      // per-wheel slip for effects and sound
      const latF = clamp(Math.abs(alphaF) / 0.25, 0, 1), latR = clamp(Math.abs(alphaR) / 0.25, 0, 1);
      W[0].slip = W[1].slip = Math.max(latF, lockF ? 1 : 0, this.spinF);
      W[2].slip = W[3].slip = Math.max(latR, lockR ? 1 : 0, this.spinR);
      W[0].lock = W[1].lock = lockF; W[2].lock = W[3].lock = lockR;
      W[0].spin = W[1].spin = this.spinF; W[2].spin = W[3].spin = this.spinR;
    } else {
      this.r *= 1 - 1.5 * dt;
      this.r += -this.steer * 0.5 * dt;
      for (const w of W) { w.slip = 0; w.lock = false; w.spin = 0; }
      this.axLong = lerp(this.axLong, 0, dt * 4); this.ayLat = lerp(this.ayLat, 0, dt * 4);
    }

    // resistances (world frame, opposing velocity)
    if (speed > 0.05) {
      const drag = 0.5 * RHO * sp.cdA * (1 + this.dmg.body * 0.25) * speed * speed + (this.airborne ? 0 : crr * m * G);
      const dec = Math.min(drag / m, speed / dt);
      ax -= this.vx / speed * dec; az -= this.vz / speed * dec;
    }
    this.vx += ax * dt; this.vz += az * dt;

    // Low-speed blend toward the kinematic bicycle model (stable parking-speed steering).
    if (!this.airborne) {
      const sp2 = Math.hypot(this.vx, this.vz);
      const wk = clamp(1 - (sp2 - 1.5) / 4, 0, 1) * (hb ? 0.25 : 1);
      if (wk > 0) {
        vLong = this.vx * fx + this.vz * fz; vLat = this.vx * lx + this.vz * lz;
        const rKin = vLong * Math.tan(delta) / L;
        const k = Math.min(1, dt * 18) * wk;
        this.r = lerp(this.r, rKin, k);
        vLat *= 1 - Math.min(1, dt * 10) * wk;
        this.vx = vLong * fx + vLat * lx; this.vz = vLong * fz + vLat * lz;
      }
      // hold the car still when braking at a standstill
      if (brk > 0.3 && thr < 0.05 && sp2 < 0.6 && this.gear >= 0) { this.vx *= 0.8; this.vz *= 0.8; this.r *= 0.8; }
    }

    this.heading += this.r * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;

    this.collide(dt);

    // Progress along the stage. Local search from the last index keeps progress continuous.
    const q = st.locate(this.x, this.z, this.hint, this._loc || (this._loc = {}));
    if (Math.abs(q.i - this.hint) < 40) this.hint = q.i;
    this.s = q.s; this.d = q.d;
    if (q.s > this.maxS && q.s - this.maxS < 20 && Math.abs(q.d) < st.w + 14) this.maxS = q.s;

    // Wheel spin for visuals
    for (const w of W) w.rot += (this.airborne ? thr * 40 : vLong / sp.wheelR) * dt * (w.lock ? 0 : 1);

    // Visual body motion: springs toward acceleration-driven pitch/roll.
    const pT = -clamp(this.axLong, -12, 12) * 0.0065, rT = clamp(this.ayLat, -12, 12) * 0.009;
    this.pitchVV += ((pT - this.pitchV) * 90 - this.pitchVV * 11) * dt; this.pitchV += this.pitchVV * dt;
    this.rollVV += ((rT - this.rollV) * 90 - this.rollVV * 11) * dt; this.rollV += this.rollVV * dt;
    if (this.airborne) this.airPitch = Math.max(this.airPitch - 0.22 * dt, -0.35);
    else this.airPitch = lerp(this.airPitch, 0, Math.min(1, dt * 10));

    this.speed = Math.hypot(this.vx, this.vz);
    this.vLong = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
    this.throttle = thr; this.brake = brk; this.handbrake = hb;
  }

  // Walls along the road edge and circular obstacles (trees, rocks, poles, bales, houses).
  collide(dt) {
    const st = this.stage, sp = this.spec;
    const q = st.locate(this.x, this.z, this.hint, this._col || (this._col = {}));
    const i = q.i;
    for (const side of [1, -1]) {
      const kind = (side > 0 ? st.wallL : st.wallR)[i];
      if (!kind) continue;
      const lim = st.w + (kind === 2 ? 1.35 : 0.95);
      const over = side * q.d - lim + 0.9; // car half-width
      if (over <= 0) continue;
      const nx = -Math.cos(q.heading) * side, nz = Math.sin(q.heading) * side; // points back to the road
      this.x += nx * over; this.z += nz * over;
      const vn = this.vx * nx + this.vz * nz;
      if (vn < 0) {
        const hard = kind !== 2, e = hard ? 0.2 : 0.02;
        this.vx -= (1 + e) * vn * nx; this.vz -= (1 + e) * vn * nz;
        const scrub = 1 - clamp(-vn * (hard ? 0.035 : 0.05), 0, 0.5);
        this.vx *= scrub; this.vz *= scrub;
        this.r *= hard ? 0.6 : 0.8;
        if (-vn > 1.5) this.events.push({ type: "impact", mag: -vn, soft: !hard, kind: kind === 2 ? "snow" : kind === 1 ? "armco" : "wall" });
        if (hard && -vn > 4) { this.dmg.body = Math.min(1, this.dmg.body + (-vn - 4) * 0.012); this.dmg.susp = Math.min(1, this.dmg.susp + (-vn - 4) * 0.006); }
      }
    }
    if (this.ghost) return;
    // obstacles: two circles along the car
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const off = Math.min(1.25, sp.wheelbase * 0.5), rc = 0.95;
    for (const k of [1, -1]) {
      const cx = this.x + fx * off * k, cz = this.z + fz * off * k;
      st.obstaclesNear(cx, cz, o => {
        const dx = cx - o.x, dz = cz - o.z, rr = rc + o.r, dd = dx * dx + dz * dz;
        if (dd >= rr * rr || dd < 1e-6) return;
        const dist = Math.sqrt(dd), nx = dx / dist, nz = dz / dist, pen = rr - dist;
        this.x += nx * pen; this.z += nz * pen;
        const vn = this.vx * nx + this.vz * nz;
        if (vn >= 0) return;
        const soft = !!o.soft, e = soft ? 0.05 : 0.25;
        this.vx -= (1 + e) * vn * nx; this.vz -= (1 + e) * vn * nz;
        const keep = soft ? 0.9 : 0.75;
        this.vx *= keep; this.vz *= keep;
        // spin from an off-centre hit
        const lever = k * off, torque = fz * nx - fx * nz; // y-component of (lever arm x impulse direction)
        this.r += clamp(-vn * lever * torque * 0.35, -3, 3);
        const mag = -vn;
        if (mag > 1.2) this.events.push({ type: "impact", mag, soft, kind: o.kind });
        if (!soft && mag > 3) {
          const dm = (mag - 3) * 0.022;
          this.dmg.body = Math.min(1, this.dmg.body + dm);
          if (k > 0) this.dmg.engine = Math.min(1, this.dmg.engine + dm * 0.45);
          this.dmg.susp = Math.min(1, this.dmg.susp + dm * 0.3);
        }
      });
    }
  }

  damageTotal() { return (this.dmg.engine + this.dmg.susp + this.dmg.body) / 3; }
}
