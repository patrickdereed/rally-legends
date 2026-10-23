// Career state and economy: credits, reputation, garage (cars, parts, liveries, damage), championships,
// personal records and ghosts. Saved in the browser per Salesforce user.
import {
  CLASSES, CLASS_BY_ID, CARS, CAR_BY_ID, PART_CATS, PART_LEVELS, PART_LEVEL_COST, PART_BASE_COST, PART_REP_EXTRA, PART_BY_ID,
  LIVERY_BY_ID, LIVERY_BASE_COST, CUSTOM_PAINT_COST, RIMS, RIM_BY_ID, CHAMPIONSHIPS, POINTS, POWER_POINTS, START_CREDITS,
  TIER_PRIZE, TIER_CHAMP, TIER_XP, POS_PRIZE, POS_XP, STAGE_WIN_FRAC, REPAIR_FRAC, xpForLevel, MAX_LEVEL, DIFF_BY_ID,
  OBJECTIVES, RIVALS, LOC_BY_ID, carsInClass
} from "./data.js";
import { buildSpec, G, torqueCurve } from "./physics.js";
import { makeRng, hashStr, clamp } from "./util.js";

const VERSION = 1;
const CHAMP_POS = [1, 0.55, 0.35, 0.15, 0.1, 0.08, 0.06, 0.05];

function safeGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
function safeSet(key, val) { try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; } }

export function defaultSettings() {
  const mobile = typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
  return { quality: mobile ? "medium" : "high", units: "kmh", voice: true, voiceName: "", notes: true, volume: 0.8, engineVol: 0.9,
    camera: 0, manual: false, assist: { steer: true, abs: true, tc: false }, ghost: true, shake: true };
}

// Rivals develop their cars through a championship like the player does: about 2% quicker per
// average part level (fully upgraded is ~12-14% on the stopwatch). They start each season on
// Street-level parts and reach roughly Pro level by the final round, so a stock car can score
// early points but the title needs upgrades. Repeating a season doesn't make them stronger.
export function rivalDevelopment(round) {
  return clamp(1 + round * 0.7, 0, 4.6) * 0.02;
}

export class Career {
  constructor(user) {
    this.user = user || "";
    this.key = "rally-legends-v1" + (user ? "-" + user : "");
    this.ghostKey = "rally-legends-ghosts-v1" + (user ? "-" + user : "");
    this.settingsKey = "rally-legends-settings-v1" + (user ? "-" + user : "");
    this.d = null;
    let s = null;
    try { s = JSON.parse(safeGet(this.settingsKey) || "null"); } catch (e) { s = null; }
    this.settings = Object.assign(defaultSettings(), s || {});
    this.settings.assist = Object.assign(defaultSettings().assist, (s && s.assist) || {});
  }

  load() {
    try {
      const d = JSON.parse(safeGet(this.key) || "null");
      if (d && d.v === VERSION) { this.d = d; this.migrate(); return true; }
    } catch (e) { /* fall through to no save */ }
    return false;
  }
  // Factory liveries are copied into the save at purchase; refresh ones whose factory colours changed.
  migrate() {
    const g = this.d.garage && this.d.garage.berlinette;
    if (g && g.livery && g.livery.key === "factory" && g.livery.colors[0] === "#1f4fa8") {
      g.livery.colors = CAR_BY_ID.berlinette.livery.colors.slice();
      this.save();
    }
  }
  save() { if (this.d) safeSet(this.key, JSON.stringify(this.d)); }
  saveSettings() { safeSet(this.settingsKey, JSON.stringify(this.settings)); }
  exportCode() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.d)))); }
  importCode(code) {
    const d = JSON.parse(decodeURIComponent(escape(atob(code.trim()))));
    if (!d || d.v !== VERSION || !d.garage) throw new Error("That is not a Rally Legends save code.");
    this.d = d; this.save();
  }
  reset() { this.d = null; safeSet(this.key, "null"); }

  newCareer(name, starterId, difficulty) {
    this.d = {
      v: VERSION, name: (name || "Driver").slice(0, 28), difficulty: difficulty || "amateur", created: Date.now(),
      credits: START_CREDITS, xp: 0, garage: {}, selected: starterId,
      seasons: {}, champs: {}, records: {}, stats: { stages: 0, stageWins: 0, events: 0, eventWins: 0, titles: 0, km: 0, earned: 0, resets: 0 },
      log: []
    };
    this.addCar(starterId);
    this.save();
  }

  // ---------- reputation ----------
  get level() { return this.levelInfo().level; }
  levelInfo() {
    let lvl = 1, xp = this.d ? this.d.xp : 0;
    while (lvl < MAX_LEVEL && xp >= xpForLevel(lvl)) { xp -= xpForLevel(lvl); lvl++; }
    return { level: lvl, into: xp, need: lvl < MAX_LEVEL ? xpForLevel(lvl) : 1 };
  }
  addXp(n) { const before = this.level; this.d.xp += Math.round(n); return this.level > before ? this.level : 0; }
  // Cheat codes (case-insensitive). Credits from cheats don't count toward lifetime earnings.
  cheat(code) {
    const k = String(code || "").trim().toUpperCase().replace(/\s+/g, "");
    if (k === "SHOWMETHEMONEY") {
      this.d.credits += 5000000;
      this.d.log.unshift({ t: Date.now(), n: 5000000, why: "Cheat code" });
      this.d.log.length = Math.min(this.d.log.length, 30);
      this.save();
      return { ok: true, msg: "+5,000,000 CR" };
    }
    return { ok: false, reason: "Nothing happened." };
  }
  earn(n, why) {
    n = Math.round(n);
    this.d.credits += n;
    if (n > 0) this.d.stats.earned += n;
    this.d.log.unshift({ t: Date.now(), n, why });
    this.d.log.length = Math.min(this.d.log.length, 30);
  }
  canAfford(n) { return this.d.credits >= n; }
  get diff() { return DIFF_BY_ID[this.d.difficulty] || DIFF_BY_ID.amateur; }

  classUnlocked(cls) { return this.level >= CLASS_BY_ID[cls].repReq; }

  // ---------- garage ----------
  owns(id) { return !!this.d.garage[id]; }
  ownedCars() { return CARS.filter(c => this.d.garage[c.id]); }
  ownedInClass(cls) { return carsInClass(cls).filter(c => this.d.garage[c.id]); }
  addCar(id) {
    const car = CAR_BY_ID[id];
    this.d.garage[id] = {
      parts: Object.fromEntries(PART_CATS.map(p => [p.id, 0])),
      livery: { key: "factory", design: car.livery.design, colors: car.livery.colors.slice(), number: car.livery.number },
      rim: car.livery.rim, liveries: ["factory"], rims: [car.livery.rim, "silver"],
      dmg: { engine: 0, susp: 0, body: 0 }, km: 0, bought: Date.now()
    };
  }
  carRequirement(id) {
    const car = CAR_BY_ID[id], cls = CLASS_BY_ID[car.cls];
    if (this.owns(id)) return { ok: false, reason: "Owned" };
    if (!this.classUnlocked(car.cls)) return { ok: false, reason: "Reach reputation level " + cls.repReq };
    if (!this.canAfford(car.price)) return { ok: false, reason: "Not enough credits" };
    return { ok: true };
  }
  buyCar(id) {
    const req = this.carRequirement(id);
    if (!req.ok) return req;
    const car = CAR_BY_ID[id];
    this.earn(-car.price, "Bought " + car.name);
    this.addCar(id);
    this.d.selected = id;
    this.save();
    return { ok: true };
  }

  // ---------- parts (bought in series) ----------
  partLevel(id, cat) { return this.d.garage[id].parts[cat] || 0; }
  partCost(id, cat, lvl) {
    const car = CAR_BY_ID[id];
    return Math.round(car.price * PART_BASE_COST * PART_BY_ID[cat].costMul * PART_LEVEL_COST[lvl] / 10) * 10;
  }
  partRequirement(id, cat) {
    const cur = this.partLevel(id, cat), next = cur + 1, car = CAR_BY_ID[id], cls = CLASS_BY_ID[car.cls];
    if (next >= PART_LEVELS.length) return { ok: false, maxed: true, reason: "Fully upgraded" };
    if (next === PART_LEVELS.length - 1 && !((this.d.champs[car.cls] || {}).wins > 0)) return { ok: false, level: next, reason: "Win the " + cls.title + " to unlock Legend parts" };
    const rep = cls.repReq + PART_REP_EXTRA[next];
    if (this.level < rep) return { ok: false, level: next, reason: "Reach reputation level " + rep };
    const cost = this.partCost(id, cat, next);
    if (!this.canAfford(cost)) return { ok: false, level: next, cost, reason: "Not enough credits" };
    return { ok: true, level: next, cost };
  }
  buyPart(id, cat) {
    const req = this.partRequirement(id, cat);
    if (!req.ok) return req;
    this.earn(-req.cost, PART_BY_ID[cat].name + " " + PART_LEVELS[req.level] + " · " + CAR_BY_ID[id].name);
    this.d.garage[id].parts[cat] = req.level;
    this.save();
    return { ok: true };
  }

  // ---------- liveries and rims ----------
  liveryCost(id, designId) {
    if (designId === "factory") return 0;
    return Math.round(CAR_BY_ID[id].price * LIVERY_BASE_COST * LIVERY_BY_ID[designId].price / 10) * 10;
  }
  customPaintCost(id) { return Math.round(CAR_BY_ID[id].price * CUSTOM_PAINT_COST / 10) * 10; }
  liveryRequirement(id, designId) {
    if (designId === "factory") return { ok: true, cost: 0 };
    const rep = LIVERY_BY_ID[designId].rep;
    if (this.level < rep) return { ok: false, reason: "Reputation level " + rep };
    return { ok: true, cost: this.liveryCost(id, designId) };
  }
  ownsLivery(id, key) { return this.d.garage[id].liveries.includes(key); }
  // key: "factory" or "design:wayIndex"
  applyLivery(id, key, number) {
    const g = this.d.garage[id], car = CAR_BY_ID[id];
    if (!this.ownsLivery(id, key)) {
      const designId = key.split(":")[0], req = this.liveryRequirement(id, designId);
      if (!req.ok) return req;
      if (!this.canAfford(req.cost)) return { ok: false, reason: "Not enough credits" };
      this.earn(-req.cost, "Livery " + LIVERY_BY_ID[designId].name + " · " + car.name);
      g.liveries.push(key);
    }
    if (key === "factory") g.livery = { key, design: car.livery.design, colors: car.livery.colors.slice(), number: number || g.livery.number };
    else {
      const [designId, way] = key.split(":");
      g.livery = { key, design: designId, colors: LIVERY_BY_ID[designId].ways[+way].slice(), number: number || g.livery.number };
    }
    this.save();
    return { ok: true };
  }
  applyCustom(id, design, colors, number) {
    const cost = this.customPaintCost(id);
    const req = this.liveryRequirement(id, design);
    if (!req.ok) return req;
    if (!this.canAfford(cost)) return { ok: false, reason: "Not enough credits" };
    this.earn(-cost, "Custom paint · " + CAR_BY_ID[id].name);
    this.d.garage[id].livery = { key: "custom", design, colors: colors.slice(0, 3), number: clamp(Math.round(number) || 1, 1, 99) };
    this.save();
    return { ok: true };
  }
  setNumber(id, n) { this.d.garage[id].livery.number = clamp(Math.round(n) || 1, 1, 99); this.save(); }
  applyRim(id, rimId) {
    const g = this.d.garage[id], rim = RIM_BY_ID[rimId];
    if (!g.rims.includes(rimId)) {
      if (!this.canAfford(rim.price)) return { ok: false, reason: "Not enough credits" };
      this.earn(-rim.price, rim.name + " wheels · " + CAR_BY_ID[id].name);
      g.rims.push(rimId);
    }
    g.rim = rimId;
    this.save();
    return { ok: true };
  }

  // ---------- damage ----------
  damage(id) { const g = this.d.garage[id]; return (g.dmg.engine + g.dmg.susp + g.dmg.body) / 3; }
  repairCost(id) { return Math.round(this.damage(id) * CAR_BY_ID[id].price * REPAIR_FRAC / 10) * 10; }
  repair(id) {
    const cost = this.repairCost(id);
    if (cost <= 0) return { ok: true };
    if (!this.canAfford(cost)) return { ok: false, reason: "Not enough credits" };
    this.earn(-cost, "Repairs · " + CAR_BY_ID[id].name);
    this.d.garage[id].dmg = { engine: 0, susp: 0, body: 0 };
    this.save();
    return { ok: true };
  }

  // ---------- specs and stats ----------
  spec(id, partsOverride) {
    const g = this.d && this.d.garage[id];
    return buildSpec(CAR_BY_ID[id], partsOverride || (g ? g.parts : {}), g && !partsOverride ? g.dmg : null);
  }
  stats(id, partsOverride) {
    const g = this.d && this.d.garage[id];
    const spec = buildSpec(CAR_BY_ID[id], partsOverride || (g ? g.parts : {}), null);
    return specStats(spec);
  }

  // ---------- championships ----------
  champ(cls) { return this.d.seasons[cls] || null; }
  champRequirement(cls) {
    const c = CLASS_BY_ID[cls];
    if (!this.classUnlocked(cls)) return { ok: false, reason: "Reach reputation level " + c.repReq };
    if (!this.ownedInClass(cls).length) return { ok: false, needCar: true, reason: "Buy a " + c.name + " car" };
    return { ok: true };
  }
  startChampionship(cls, carId) {
    const prev = this.d.seasons[cls];
    this.d.seasons[cls] = {
      season: (prev ? prev.season : 0) + 1, round: 0, carId, done: false,
      points: Object.fromEntries(["P", 0, 1, 2, 3, 4, 5, 6].map(k => [k, 0])), results: [], event: null,
      seed: hashStr(cls + ":" + Date.now())
    };
    this.save();
    return this.d.seasons[cls];
  }
  setChampCar(cls, carId) { const s = this.champ(cls); if (s) { s.carId = carId; this.save(); } }
  roundInfo(cls, round) {
    const [locId, nStages] = CHAMPIONSHIPS[cls].rounds[round];
    return { loc: LOC_BY_ID[locId], nStages, round, total: CHAMPIONSHIPS[cls].rounds.length };
  }
  ensureEvent(cls) {
    const s = this.champ(cls);
    if (!s || s.done) return null;
    if (!s.event || s.event.round !== s.round) {
      const r = makeRng(s.seed + s.round * 977);
      const info = this.roundInfo(cls, s.round);
      s.event = {
        round: s.round, locId: info.loc.id, nStages: info.nStages, stage: 0,
        times: { P: [] }, bench: [], resets: 0, restarts: 3,
        objective: OBJECTIVES[r.int(0, OBJECTIVES.length - 1)].id
      };
      for (let k = 0; k < 7; k++) s.event.times[k] = [];
      this.save();
    }
    return s.event;
  }
  rivals(cls) { return RIVALS[cls].map(([name, nat, skill], i) => ({ id: i, name, nat, skill })); }

  // Rival times for one stage from the benchmark time. Seeded so restarts don't re-roll the field.
  rivalTimes(cls, bench) {
    const s = this.champ(cls), ev = s.event;
    const r = makeRng(s.seed ^ hashStr(ev.round + "/" + ev.stage));
    const pace = this.diff.pace * (1 - rivalDevelopment(ev.round));
    return this.rivals(cls).map(rv => {
      let t = bench * pace * (1 + rv.skill + r.gauss() * 0.006);
      if (r.chance(0.055)) t += r.range(8, 45); // the odd spin or puncture
      return Math.round(t * 100) / 100;
    });
  }

  // Store a finished (or retired) stage. Returns the stage classification.
  recordStage(cls, playerTime, bench, info) {
    const s = this.champ(cls), ev = s.event;
    const g0 = this.d.garage[s.carId];
    const undo = { dmg: g0 ? Object.assign({}, g0.dmg) : null, credits0: this.d.credits, earned0: this.d.stats.earned, xp0: this.d.xp, stats0: Object.assign({}, this.d.stats), km0: g0 ? g0.km : 0 };
    const rv = this.rivalTimes(cls, bench);
    ev.times.P.push(Math.round(playerTime * 100) / 100);
    rv.forEach((t, k) => ev.times[k].push(t));
    ev.bench.push(bench);
    ev.resets += info.resets || 0;
    ev.stage++;
    this.d.stats.stages++;
    this.d.stats.resets += info.resets || 0;
    this.d.stats.km += (info.km || 0);
    const g = this.d.garage[s.carId];
    if (g && info.dmg) g.dmg = { engine: info.dmg.engine, susp: info.dmg.susp, body: info.dmg.body };
    if (g) g.km += info.km || 0;
    const tier = CLASS_BY_ID[cls].tier, pay = this.diff.pay * (info.noAssists ? 1.1 : 1);
    const order = this.classify(ev, ev.stage - 1);
    const pos = order.findIndex(o => o.id === "P");
    let credits = 0, xp = 60 * TIER_XP[tier];
    if (pos === 0) {
      credits += TIER_PRIZE[tier] * STAGE_WIN_FRAC * pay; xp += 80 * TIER_XP[tier];
      this.d.stats.stageWins++;
    }
    if (credits) this.earn(credits, "Stage win · " + LOC_BY_ID[ev.locId].stages[ev.stage - 1].name);
    const up = this.addXp(xp);
    ev.undo = undo;
    this.save();
    return { order, pos, credits: Math.round(credits), xp: Math.round(xp), levelUp: up };
  }

  // Order for a single stage (stageIdx) or overall after `upTo` stages.
  classify(ev, stageIdx) {
    const ids = ["P", 0, 1, 2, 3, 4, 5, 6];
    return ids.map(id => ({ id, t: ev.times[id][stageIdx] })).sort((a, b) => a.t - b.t);
  }
  overall(ev) {
    const ids = ["P", 0, 1, 2, 3, 4, 5, 6];
    return ids.map(id => ({ id, t: ev.times[id].reduce((a, b) => a + b, 0) })).sort((a, b) => a.t - b.t);
  }

  // Throw away the stage just recorded (Retry): times, rewards, damage and stats go back to before it.
  canRetryStage(cls) { const s = this.champ(cls), ev = s && s.event; return !!(ev && ev.undo && ev.stage > 0 && ev.restarts > 0); }
  retryStage(cls) {
    const s = this.champ(cls), ev = s.event, u = ev.undo;
    if (!this.canRetryStage(cls)) return false;
    for (const k of Object.keys(ev.times)) ev.times[k].pop();
    ev.bench.pop();
    ev.stage--;
    ev.restarts--;
    ev.resets = Math.max(0, ev.resets - (this.d.stats.resets - u.stats0.resets));
    this.d.credits = u.credits0; this.d.xp = u.xp0; this.d.stats = u.stats0;
    const g = this.d.garage[s.carId];
    if (g && u.dmg) { g.dmg = u.dmg; g.km = u.km0; }
    ev.undo = null;
    this.save();
    return true;
  }

  // Close the round: points (with Power Stage bonus), prize money, objective, XP; maybe the title.
  finishEvent(cls, info) {
    const s = this.champ(cls), ev = s.event, tier = CLASS_BY_ID[cls].tier;
    const pay = this.diff.pay * (info && info.noAssists ? 1.1 : 1);
    const overall = this.overall(ev);
    const power = this.classify(ev, ev.nStages - 1);
    const pts = {};
    overall.forEach((o, i) => { pts[o.id] = POINTS[i] || 0; });
    power.slice(0, 3).forEach((o, i) => { pts[o.id] += POWER_POINTS[i]; });
    for (const k in pts) s.points[k] += pts[k];
    const pos = overall.findIndex(o => o.id === "P");
    const powerPos = power.findIndex(o => o.id === "P");
    const stageWins = ev.times.P.filter((t, i) => this.classify(ev, i)[0].id === "P").length;
    const g = this.d.garage[s.carId];
    const dmg = g ? this.damage(s.carId) : 0;
    const objMet = {
      clean: ev.resets === 0, podium: pos < 3, stagewin: stageWins > 0, lowdmg: dmg < 0.25, power: powerPos < 3
    }[ev.objective];
    const obj = OBJECTIVES.find(o => o.id === ev.objective);
    const prize = TIER_PRIZE[tier] * POS_PRIZE[pos] * pay;
    const bonus = objMet ? TIER_PRIZE[tier] * obj.bonus * pay : 0;
    this.earn(prize, "Round " + (ev.round + 1) + " · " + LOC_BY_ID[ev.locId].name + " · P" + (pos + 1));
    if (bonus) this.earn(bonus, "Sponsor objective · " + obj.text);
    let xp = POS_XP[pos] * TIER_XP[tier];
    const summary = { pos, points: pts.P, powerPos, prize: Math.round(prize), bonus: Math.round(bonus), objective: obj, objMet, overall, stageWins };
    this.d.stats.events++;
    if (pos === 0) this.d.stats.eventWins++;
    s.results.push({ round: ev.round, locId: ev.locId, pos, points: pts.P, time: overall.find(o => o.id === "P").t });
    s.round++;
    s.event = null;
    if (s.round >= CHAMPIONSHIPS[cls].rounds.length) {
      s.done = true;
      const table = this.standings(cls);
      const cpos = table.findIndex(o => o.id === "P");
      const cprize = TIER_CHAMP[tier] * CHAMP_POS[cpos] * pay;
      this.earn(cprize, CLASS_BY_ID[cls].title + " · final position P" + (cpos + 1));
      xp += (600 + ([800, 500, 300][cpos] || 0)) * TIER_XP[tier];
      const ch = this.d.champs[cls] || (this.d.champs[cls] = { wins: 0, best: 99, completed: 0 });
      ch.completed++; ch.best = Math.min(ch.best, cpos + 1);
      if (cpos === 0) { ch.wins++; this.d.stats.titles++; }
      summary.champ = { pos: cpos, prize: Math.round(cprize), table };
    }
    summary.xp = Math.round(xp);
    summary.levelUp = this.addXp(xp);
    this.save();
    return summary;
  }
  standings(cls) {
    const s = this.champ(cls);
    return ["P", 0, 1, 2, 3, 4, 5, 6].map(id => ({ id, pts: s.points[id] })).sort((a, b) => b.pts - a.pts || (a.id === "P" ? -1 : 1));
  }

  // ---------- time trial records ----------
  // Records are per stage and class, and per surface when Time Trial forces one.
  recordKey(locId, idx, cls, surface) { return locId + "/" + idx + "/" + cls + (surface && surface !== "mixed" ? "/" + surface : ""); }
  record(locId, idx, cls, surface) { return this.d.records[this.recordKey(locId, idx, cls, surface)] || null; }
  timeTrialFinish(locId, idx, cls, carId, time, info) {
    const key = this.recordKey(locId, idx, cls, info.surface), prev = this.d.records[key];
    const pb = !prev || time < prev.time;
    if (pb) this.d.records[key] = { time, carId, date: Date.now() };
    const tier = CLASS_BY_ID[cls].tier;
    const credits = TIER_PRIZE[tier] * 0.06 * (pb && prev ? 2 : 1);
    this.earn(credits, "Time trial · " + LOC_BY_ID[locId].stages[idx].name + (pb ? " · new record" : ""));
    const up = this.addXp(25 * TIER_XP[tier] * (pb ? 2 : 1));
    this.d.stats.km += info.km || 0;
    const g = this.d.garage[carId];
    if (g && info.dmg) g.dmg = { engine: info.dmg.engine, susp: info.dmg.susp, body: info.dmg.body };
    this.save();
    return { pb, prev: prev ? prev.time : null, credits: Math.round(credits), levelUp: up };
  }

  // ---------- ghosts (separate key, capped) ----------
  loadGhost(key) {
    try { const all = JSON.parse(safeGet(this.ghostKey) || "{}"); return all[key] || null; } catch (e) { return null; }
  }
  saveGhost(key, ghost) {
    let all = {};
    try { all = JSON.parse(safeGet(this.ghostKey) || "{}") || {}; } catch (e) { all = {}; }
    all[key] = ghost;
    const keys = Object.keys(all).sort((a, b) => (all[b].date || 0) - (all[a].date || 0));
    for (const k of keys.slice(20)) delete all[k];
    if (!safeSet(this.ghostKey, JSON.stringify(all))) { // storage full: keep only this one
      safeSet(this.ghostKey, JSON.stringify({ [key]: ghost }));
    }
  }
}

// Display stats (0..100 bars), headline numbers and a performance index.
export function specStats(spec) {
  const m = spec.mass;
  // 0-100 km/h, simple traction- and power-limited straight-line run on gravel
  let v = 0, t = 0, gear = 0;
  const trac = spec.drive === "AWD" ? 0.95 : spec.drive === "RWD" ? 0.65 : 0.6;
  while (v < 27.78 && t < 30) {
    const rpm = Math.max(spec.rpmIdle, v / spec.wheelR * spec.gears[gear] * 30 / Math.PI);
    if (rpm > spec.rpmMax * 0.97 && gear < spec.gears.length - 1) { gear++; t += spec.shiftT; continue; }
    const T = spec.torquePeak * torqueCurve(Math.min(1, rpm / spec.rpmMax)) * (spec.turbo ? 1 - spec.turbo.depth * 0.3 : 1);
    const F = Math.min(T * spec.gears[gear] * 0.9 / spec.wheelR + (spec.hybridW ? spec.hybridW / Math.max(v, 6) : 0), 0.8 * spec.grip * m * G * trac);
    const a = (F - 0.5 * 1.2 * spec.cdA * v * v - 0.02 * m * G) / m;
    v += a * 0.01; t += 0.01;
  }
  const decel = Math.min(spec.brakeForce / m, 1.0 * spec.grip * G);
  const n = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  const pw = spec.powerW / m;
  const bars = {
    speed: n(spec.vTop, 38, 64),
    accel: n(1 / t, 1 / 12, 1 / 2.6),
    grip: n(spec.grip, 0.88, 1.45),
    braking: n(decel, 6, 13),
    handling: n(spec.steerMax * spec.grip / Math.sqrt(spec.iz / 1500), 0.45, 0.95)
  };
  const pi = Math.round(100 + 900 * (0.34 * n(pw, 90, 620) + 0.24 * bars.grip + 0.16 * bars.speed + 0.14 * bars.braking + 0.12 * bars.accel));
  return { bars, pi, topKmh: spec.vTop * 3.6, zeroTo100: t, hp: spec.powerW / 745.7, mass: m, decel };
}
