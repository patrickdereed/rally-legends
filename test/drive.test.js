import { LOCATIONS, CARS } from "../force-app/main/default/staticresources/RallyLegends/data.js";
import { buildStage } from "../force-app/main/default/staticresources/RallyLegends/track.js";
import { buildSpec, referenceTime, Vehicle, DT } from "../force-app/main/default/staticresources/RallyLegends/physics.js";
import { Bot } from "../force-app/main/default/staticresources/RallyLegends/bot.js";
const only = process.argv[2];
const carIds = (process.argv[3] || "mosquito,sanremo,asti,pleiad,kaze").split(",");
let bad = 0;
for (const loc of LOCATIONS) {
  if (only && only !== "all" && loc.id !== only) continue;
  const st = buildStage(loc, 0, { cell: 6 });
  for (const id of carIds) {
    const car = CARS.find(c => c.id === id);
    const spec = buildSpec(car, {}, null);
    const ref = referenceTime(st, spec).time;
    const v = new Vehicle(spec, st, { assist: { steer: true, abs: true, tc: false } });
    const bot = new Bot(v, 0.92);
    let t = 0, maxSpd = 0, air = 0, impacts = 0, resets = 0, offT = 0, lastS = v.maxS, stuck = 0;
    while (v.maxS < st.finishS && t < ref * 4) {
      const inp = bot.input();
      v.step(DT, inp); t += DT;
      maxSpd = Math.max(maxSpd, v.speed);
      if (v.airborne) air += DT;
      for (const e of v.events) if (e.type === "impact") { impacts++; if (process.env.DBG) console.log("  impact", e.kind, e.mag.toFixed(1), "at s", v.maxS.toFixed(0), "d", (v.d || 0).toFixed(2)); }
      v.events.length = 0;
      if (Math.abs(v.d) > st.w + 12) offT += DT; else offT = 0;
      if (Math.floor(t) !== Math.floor(t - DT)) { if (v.maxS - lastS < 1) stuck++; else stuck = 0; lastS = v.maxS; }
      if (offT > 2.5 || stuck > 4) { v.reset(Math.max(st.startS, v.maxS - 10)); resets++; offT = 0; stuck = 0; t += 10; }
      if (!isFinite(v.x) || !isFinite(v.vx)) { console.log("NaN!", loc.id, id, t); bad++; break; }
    }
    const ok = v.maxS >= st.finishS;
    if (!ok) bad++;
    console.log(`${loc.id.padEnd(9)} ${id.padEnd(10)} bot=${t.toFixed(1)}s ref=${ref.toFixed(1)}s ratio=${(t/ref).toFixed(3)} vmax=${(maxSpd*3.6).toFixed(0)}km/h air=${air.toFixed(1)}s impacts=${impacts} resets=${resets} dmg=${(v.damageTotal()*100).toFixed(0)}% ${ok ? "" : "DNF at " + v.maxS.toFixed(0) + "/" + st.finishS.toFixed(0)}`);
  }
}
process.exit(bad ? 1 : 0);
