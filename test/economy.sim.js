// Full-career economy simulation with the real Career code and real benchmark stage times.
const mem = {}; globalThis.window = { localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } };
const D = await import("../force-app/main/default/staticresources/RallyLegends/data.js");
const { Career } = await import("../force-app/main/default/staticresources/RallyLegends/career.js");
const { buildSpec } = await import("../force-app/main/default/staticresources/RallyLegends/physics.js");
const { buildStage } = await import("../force-app/main/default/staticresources/RallyLegends/track.js");
const { benchmark } = await import("../force-app/main/default/staticresources/RallyLegends/bot.js");
const { makeRng } = await import("../force-app/main/default/staticresources/RallyLegends/util.js");

const skill = +(process.argv[2] ?? 0.0);     // player pace vs the class pace: 0 = mid-field rival, negative = faster
const diff = process.argv[3] || "amateur";
const r = makeRng(42);
const benchCache = {};
const bench = (loc, i, cls) => {
  const k = loc + i + cls;
  if (!benchCache[k]) benchCache[k] = benchmark(buildStage(D.LOC_BY_ID[loc], i, { cell: 10 }), buildSpec(D.carsInClass(cls)[0], {}, null)).time;
  return benchCache[k];
};
// Cost of owning everything
let everything = 0;
for (const car of D.CARS) {
  everything += car.price;
  for (const p of D.PART_CATS) for (let l = 1; l <= 6; l++) everything += Math.round(car.price * D.PART_BASE_COST * p.costMul * D.PART_LEVEL_COST[l] / 10) * 10;
  for (const d of D.LIVERY_DESIGNS) everything += 4 * Math.round(car.price * D.LIVERY_BASE_COST * d.price / 10) * 10;
}
everything += D.RIMS.reduce((a, x) => a + x.price, 0) * 10;
console.log("cost of everything:", everything.toLocaleString(), "CR");

const c = new Career("sim"); c.newCareer("Sim", "mosquito", diff);
let season = 0, stages = 0, spentRepairs = 0;
const log = [];
const partsAvg = id => Object.values(c.d.garage[id].parts).reduce((a, b) => a + b, 0) / 36; // 0..1 (6 cats x 6)
const owned = () => c.ownedCars().map(x => x.id);
const allBought = () => {
  if (owned().length < D.CARS.length) return false;
  for (const id of owned()) {
    const g = c.d.garage[id];
    if (Object.values(g.parts).some(l => l < 6)) return false;
    if (g.liveries.length < 1 + D.LIVERY_DESIGNS.length * 4) return false;
  }
  return true;
};
function shop() {
  // 1. step up: buy the best car in the highest unlocked class we don't have a car in
  for (const cl of D.CLASSES.slice().reverse()) {
    if (!c.classUnlocked(cl.id) || c.ownedInClass(cl.id).length) continue;
    const car = D.carsInClass(cl.id).sort((a, b) => a.price - b.price)[0];
    if (c.canAfford(car.price)) { c.buyCar(car.id); log.push(`S${season}: bought ${car.name} (L${c.level})`); }
    break;
  }
  // 2. upgrade the current main car (cheapest next part first), keep a repair reserve
  const main = currentCar();
  for (let guard = 0; guard < 50; guard++) {
    const opts = D.PART_CATS.map(p => ({ p: p.id, req: c.partRequirement(main, p.id) })).filter(o => o.req.ok && c.d.credits - o.req.cost > c.d.credits * 0.1).sort((a, b) => a.req.cost - b.req.cost);
    if (!opts.length) break;
    c.buyPart(main, opts[0].p);
  }
  // 3. collector phase: once the top class is reached, buy remaining cars, their parts, then liveries
  if (c.classUnlocked("R1") && c.ownedInClass("R1").length) {
    for (const car of D.CARS) if (!c.owns(car.id) && c.carRequirement(car.id).ok) c.buyCar(car.id);
    for (const id of owned()) for (const p of D.PART_CATS) while (c.partRequirement(id, p.id).ok) c.buyPart(id, p.id);
    for (const id of owned()) for (const d of D.LIVERY_DESIGNS) for (let w = 0; w < 4; w++) { const key = d.id + ":" + w; if (!c.ownsLivery(id, key) && c.liveryRequirement(id, d.id).ok && c.canAfford(c.liveryCost(id, d.id))) c.applyLivery(id, key); }
  }
}
function currentCar() {
  for (const cl of D.CLASSES.slice().reverse()) { const o = c.ownedInClass(cl.id); if (o.length && c.classUnlocked(cl.id)) return o.sort((a, b) => partsAvg(b.id) - partsAvg(a.id))[0].id; }
  return "mosquito";
}
const milestones = {};
while (season < 120 && !allBought()) {
  season++;
  const carId = currentCar(), cls = D.CAR_BY_ID[carId].cls;
  c.startChampionship(cls, carId);
  let ev;
  while ((ev = c.ensureEvent(cls))) {
    while (ev.stage < ev.nStages) {
      const b = bench(ev.locId, ev.stage, cls);
      // measured: ~2% quicker per average part level (12% at full Works+Legend); a little noise; occasional mistakes
      const up = partsAvg(carId) * 6 * 0.02;
      let t = b * c.diff.pace * (1 + skill - up + r.gauss() * 0.008);
      if (r.chance(0.06)) t += r.range(5, 20);
      c.recordStage(cls, t, b, { resets: 0, km: 4.5, dmg: { engine: 0.05, susp: 0.08, body: 0.12 } });
      const rc = c.repairCost(carId); if (rc && c.canAfford(rc)) { spentRepairs += rc; c.repair(carId); }
      stages++;
    }
    c.finishEvent(cls, {});
    shop();
  }
  const st = c.standings(cls), pos = st.findIndex(o => o.id === "P") + 1;
  for (const cl of D.CLASSES) if (!milestones[cl.id] && c.ownedInClass(cl.id).length) milestones[cl.id] = season;
  if (season <= 12 || season % 5 === 0) console.log(`season ${String(season).padStart(3)} ${cls.padEnd(3)} P${pos}  level ${String(c.level).padStart(2)}  credits ${Math.round(c.d.credits).toLocaleString().padStart(12)}  cars ${owned().length}  parts(main) ${(partsAvg(carId) * 36).toFixed(0)}/36`);
}
console.log("\nfirst season driving each class:", JSON.stringify(milestones));
console.log(log.join("\n"));
console.log(`\n${allBought() ? "OWNED EVERYTHING" : "not finished"} after ${season} seasons, ${stages} stages (~${Math.round(stages * 3.5 / 60)} hours of driving), credits left ${Math.round(c.d.credits).toLocaleString()}, total earned ${c.d.stats.earned.toLocaleString()}, repairs ${spentRepairs.toLocaleString()}, titles ${c.d.stats.titles}`);
