const mem = {}; globalThis.window = { localStorage: { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } } };
const { Career } = await import("../force-app/main/default/staticresources/RallyLegends/career.js");
const c = new Career("r"); c.newCareer("T", "mosquito", "amateur"); c.startChampionship("H", "mosquito");
const ev = c.ensureEvent("H");
const before = JSON.stringify({ cr: c.d.credits, xp: c.d.xp, dmg: c.d.garage.mosquito.dmg, stats: c.d.stats });
c.recordStage("H", 100, 130, { resets: 1, km: 3.8, dmg: { engine: 0.2, susp: 0.3, body: 0.4 } }); // fast time = stage win
console.log("after stage: stage", ev.stage, "credits", c.d.credits, "xp", c.d.xp, "canRetry", c.canRetryStage("H"));
console.log("retry ok", c.retryStage("H"), "stage", ev.stage, "restarts", ev.restarts, "times P", ev.times.P.length, "rival0", ev.times[0].length);
const after = JSON.stringify({ cr: c.d.credits, xp: c.d.xp, dmg: c.d.garage.mosquito.dmg, stats: c.d.stats });
console.log("state restored:", before === after, "canRetry again (no stage):", c.canRetryStage("H"));
