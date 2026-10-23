const mem = {}; globalThis.window = { localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } };
const { CARS, PART_CATS, LOC_BY_ID, CLASS_BY_ID, CAR_BY_ID } = await import("../force-app/main/default/staticresources/RallyLegends/data.js");
const { Career, specStats } = await import("../force-app/main/default/staticresources/RallyLegends/career.js");
const { buildSpec } = await import("../force-app/main/default/staticresources/RallyLegends/physics.js");
const { buildStage } = await import("../force-app/main/default/staticresources/RallyLegends/track.js");
const { benchmark } = await import("../force-app/main/default/staticresources/RallyLegends/bot.js");
const max = Object.fromEntries(PART_CATS.map(p => [p.id, 6]));
const c = new Career("u1"); c.newCareer("Pat", "mosquito", "amateur");
for (const car of CARS) {
  const s0 = specStats(buildSpec(car, {}, null)), s6 = specStats(buildSpec(car, max, null));
  let full = 0; c.addCar(car.id); for (const p of PART_CATS) for (let l = 1; l <= 6; l++) full += c.partCost(car.id, p.id, l);
  console.log(car.name.padEnd(22), car.cls.padEnd(3), "PI", s0.pi, "->", s6.pi, "| 0-100", s0.zeroTo100.toFixed(1), "->", s6.zeroTo100.toFixed(1), "s | top", s0.topKmh.toFixed(0), "->", s6.topKmh.toFixed(0), "| hp", s0.hp.toFixed(0), "->", s6.hp.toFixed(0), "| price", car.price, "max-upgrade cost", full, "L1 engine", c.partCost(car.id, "engine", 1));
}
// simulate a Heritage season with a player at bench pace
const c2 = new Career("u2"); c2.newCareer("Pat", "mosquito", "amateur");
c2.startChampionship("H", "mosquito");
const t0 = performance.now();
let ev;
while ((ev = c2.ensureEvent("H"))) {
  const loc = LOC_BY_ID[ev.locId];
  while (ev.stage < ev.nStages) {
    const st = buildStage(loc, ev.stage, { cell: 8 });
    const bench = benchmark(st, buildSpec(CAR_BY_ID.mosquito, {}, null)).time;
    const res = c2.recordStage("H", bench * 1.0, bench, { resets: 0, km: st.L / 1000, dmg: { engine: 0, susp: 0.05, body: 0.1 } });
    process.stdout.write(`${loc.id}/${ev.stage} bench ${bench.toFixed(1)} pos ${res.pos + 1}; `);
  }
  const sum = c2.finishEvent("H", {});
  console.log(`\n  round P${sum.pos + 1} pts ${sum.points} prize ${sum.prize} bonus ${sum.bonus} xp ${sum.xp} credits now ${c2.d.credits} level ${c2.level}` + (sum.champ ? ` CHAMP P${sum.champ.pos + 1} +${sum.champ.prize}` : ""));
}
console.log("season sim ms", (performance.now() - t0).toFixed(0), "standings", JSON.stringify(c2.standings("H")));
console.log("parts mosquito engine req", JSON.stringify(c2.partRequirement("mosquito", "engine")), "buy", JSON.stringify(c2.buyPart("mosquito", "engine")));
console.log("G4 car req", JSON.stringify(c2.carRequirement("pennine")));
