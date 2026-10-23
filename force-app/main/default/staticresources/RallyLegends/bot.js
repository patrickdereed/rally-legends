// A simple driver: pure-pursuit steering plus a target-speed profile. Used by the headless tests to
// calibrate rival pace, and by the menu's attract mode.
import { clamp, wrapAngle } from "./util.js";
import { referenceTime, Vehicle, DT } from "./physics.js";
import { STEP } from "./track.js";

export class Bot {
  constructor(vehicle, pace = 0.9) {
    this.v = vehicle;
    this.pace = pace;
    this.profile = referenceTime(vehicle.stage, vehicle.spec).profile;
    this.p = {};
  }
  input() {
    const v = this.v, st = v.stage;
    const look = clamp(v.speed * 0.75, 7, 30);
    const p = st.pointAt(v.s + look, this.p);
    const ang = Math.atan2(p.x - v.x, p.z - v.z);
    const err = wrapAngle(ang - v.heading);
    const steer = clamp(-err * 2.4, -1, 1);
    // target speed: minimum of the profile over the braking horizon ahead
    const i0 = Math.round(v.s / STEP);
    let target = Infinity;
    for (let k = 2; k < 40; k++) target = Math.min(target, this.profile[clamp(i0 + k, 0, st.n - 1)] / Math.sqrt(1 + k * 0.004));
    target = Math.max(6, target * this.pace);
    const dv = target - v.speed;
    return { steer, throttle: dv > 0 ? clamp(dv * 0.6, 0.3, 1) : 0, brake: dv < -1 ? clamp(-dv * 0.25, 0, 1) : 0, handbrake: false, analog: true };
  }
}

// Benchmark run for a stage: the built-in driver in the given spec, obstacles ignored, resets free.
// Returns the time and, per centreline sample, the time it was first reached (for split targets).
// Deterministic, roughly 50-120 ms per stage.
export function benchmark(stage, spec) {
  const v = new Vehicle(spec, stage, { ghost: true, assist: { steer: true, abs: true, tc: false } });
  const bot = new Bot(v, 0.92);
  const at = new Float32Array(stage.n);
  let t = 0, off = 0, last = v.maxS, stuck = 0, mark = 0;
  const limit = stage.L / 3 + 120;
  while (v.maxS < stage.finishS && t < limit) {
    v.step(DT, bot.input());
    t += DT;
    v.events.length = 0;
    const i = Math.min(stage.n - 1, Math.floor(v.maxS / STEP));
    while (mark <= i) at[mark++] = t;
    off = Math.abs(v.d) > stage.w + 12 ? off + DT : 0;
    if (Math.floor(t) !== Math.floor(t - DT)) { stuck = v.maxS - last < 1 ? stuck + 1 : 0; last = v.maxS; }
    if (off > 2 || stuck > 3) { v.reset(Math.max(stage.startS, v.maxS - 10)); off = 0; stuck = 0; }
  }
  while (mark < stage.n) at[mark++] = t;
  return { time: t, at };
}
