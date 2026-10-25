import { LOC_BY_ID, CAR_BY_ID } from "../force-app/main/default/staticresources/RallyLegends/data.js";
import { buildStage } from "../force-app/main/default/staticresources/RallyLegends/track.js";
import { buildSpec, Vehicle, DT } from "../force-app/main/default/staticresources/RallyLegends/physics.js";
import { Bot } from "../force-app/main/default/staticresources/RallyLegends/bot.js";
const [locId, carId, pace] = [process.argv[2] || "finland", process.argv[3] || "asti", +(process.argv[4] || 0.92)];
const st = buildStage(LOC_BY_ID[locId], 0, { cell: 6 });
const v = new Vehicle(buildSpec(CAR_BY_ID[carId], {}, null), st);
const bot = new Bot(v, pace);
let t = 0; const lands = [];
const t0 = performance.now();
while (v.maxS < st.finishS && t < 600) { v.step(DT, bot.input()); t += DT; for (const e of v.events) if (e.type === "land") lands.push(e.mag.toFixed(1) + "/" + e.air.toFixed(2) + "s"); v.events.length = 0; }
console.log("time", t.toFixed(1), "sim ms", (performance.now() - t0).toFixed(0), "dmg", JSON.stringify(v.dmg));
console.log("landings (impact m/s / airtime):", lands.join(" "));
console.log("crests", st.crests.map(c => c.h.toFixed(1)).join(" "));
