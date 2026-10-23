// Menus and screens. Plain DOM with delegated click handling (data-a="action").
import {
  CLASSES, CLASS_BY_ID, CARS, CAR_BY_ID, carsInClass, PART_CATS, PART_LEVELS, LIVERY_DESIGNS, LIVERY_BY_ID, RIMS, RIM_BY_ID,
  LOCATIONS, LOC_BY_ID, CHAMPIONSHIPS, DIFFICULTIES, DIFF_BY_ID, RIVALS, OBJECTIVES, POINTS, TIER_PRIZE, SURFACES, xpForLevel
} from "./data.js";
import { specStats } from "./career.js";
import { TYRE_LOOK, BRAKE_LOOK } from "./car.js";
import { ROAD_SURFACES } from "./data.js";
import { buildSpec } from "./physics.js";
import { fmtTime, fmtDelta, fmtCredits, esc, clamp } from "./util.js";

const $ = id => document.getElementById(id);
const TIME_ICON = { day: "☀", dusk: "🌇", dawn: "🌅", night: "☾" };
const WX_ICON = { clear: "", overcast: "☁", rain: "🌧", fog: "🌫", snow: "❄" };
const WX_LABEL = { clear: "Clear", overcast: "Overcast", rain: "Rain", fog: "Fog", snow: "Snowfall" };
const STAT_LABELS = [["speed", "Top speed"], ["accel", "Acceleration"], ["grip", "Grip"], ["braking", "Braking"], ["handling", "Handling"]];

export class UI {
  constructor(app) {
    this.app = app;
    this.c = app.career;
    this.root = $("ui");
    this.v = "title"; this.p = {};
    this.root.addEventListener("click", e => {
      const el = e.target.closest("[data-a]");
      if (!el || el.disabled || el.classList.contains("disabled")) return;
      this.app.audio.init();
      this.app.audio.click();
      this.act(el.dataset.a, el.dataset, el);
    });
    this.root.addEventListener("change", e => this.change(e.target));
    $("pause").addEventListener("click", e => {
      const el = e.target.closest("[data-a]");
      if (el) { this.app.audio.click(); this.pauseAct(el.dataset.a, el); }
    });
    $("pause").addEventListener("change", e => this.change(e.target));
  }

  // ---------- frame ----------
  // Moving to a different screen starts at the top; staying on the same screen (buying a part,
  // picking a stage or livery) keeps the scroll position.
  go(v, p) {
    const same = v === this.v;
    this.v = v; this.p = p || {}; this.render();
    if (!same) { this.root.scrollTop = 0; const pn = this.root.querySelector(".panel-body"); if (pn) pn.scrollTop = 0; }
  }
  render() {
    const fn = this["v_" + this.v];
    const keep = [".panel-body", ".liv-grid"].map(sel => [sel, this.root.querySelector(sel)?.scrollTop || 0]);
    const rootTop = this.root.scrollTop;
    this.root.classList.remove("hidden");
    this.root.innerHTML = fn.call(this, this.p);
    this.root.scrollTop = rootTop;
    for (const [sel, top] of keep) { const el = this.root.querySelector(sel); if (el) el.scrollTop = top; }
    this.app.menuActive = true;
    if (this.afterRender) { const f = this.afterRender; this.afterRender = null; f(); }
  }
  hide() { this.root.classList.add("hidden"); this.root.innerHTML = ""; this.app.menuActive = false; }
  toast(msg, kind) {
    const t = $("toast");
    t.innerHTML = msg; t.className = "toast show " + (kind || "");
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove("show"), 3200);
  }
  header() {
    const c = this.c, L = c.levelInfo();
    return `<header class="topbar">
      <div class="brand"><span class="logo-mark"></span><span>RALLY<b>LEGENDS</b></span></div>
      <div class="driver"><div class="lvl" title="Reputation level">${L.level}</div><div><div class="dname">${esc(c.d.name)} <small>${esc(c.diff.name)}</small></div>
        <div class="xp"><i style="width:${(L.into / L.need * 100).toFixed(1)}%"></i></div><div class="xpt">${Math.round(L.into).toLocaleString()} / ${L.need.toLocaleString()} XP</div></div></div>
      <div class="credits">${fmtCredits(c.d.credits)}</div></header>`;
  }
  nav(active) {
    const items = [["season", "Season"], ["garage", "Garage"], ["dealer", "Dealership"], ["tt", "Time Trial"], ["records", "Records"], ["settings", "Settings"]];
    return `<nav class="nav">${items.map(([k, l]) => `<button class="${k === active ? "on" : ""}" data-a="go" data-v="${k}">${l}</button>`).join("")}</nav>`;
  }
  frame(active, body, title) {
    return `<div class="menu">${this.header()}${this.nav(active)}<section class="panel"><div class="panel-body">${title ? `<h2 class="ptitle">${title}</h2>` : ""}${body}</div></section></div>`;
  }
  showCar(id, livery, rim) {
    const car = CAR_BY_ID[id], g = this.c.d && this.c.d.garage[id];
    this.app.showroom.show(car, livery || (g ? g.livery : car.livery), rim || (g ? g.rim : car.livery.rim), g ? g.parts.tyres || 0 : 0, g ? g.parts.brakes || 0 : 0);
  }
  statBars(stats, next) {
    return `<div class="stats">${STAT_LABELS.map(([k, l]) => {
      const v = stats.bars[k] * 100, n = next ? next.bars[k] * 100 : v;
      return `<div class="stat"><span>${l}</span><div class="bar"><i style="width:${v.toFixed(1)}%"></i>${n > v + 0.1 ? `<b style="left:${v.toFixed(1)}%;width:${(n - v).toFixed(1)}%"></b>` : ""}</div><em>${Math.round(v)}</em></div>`;
    }).join("")}</div>`;
  }
  carFacts(car, stats) {
    return `<div class="facts"><div><b>${Math.round(stats.hp)}</b><span>hp</span></div><div><b>${Math.round(stats.mass)}</b><span>kg</span></div><div><b>${stats.zeroTo100.toFixed(1)}s</b><span>0–100</span></div><div><b>${Math.round(stats.topKmh)}</b><span>km/h</span></div><div><b>${car.drive}</b><span>drive</span></div></div>`;
  }
  pi(stats, cls) { return `<span class="pi" style="--c:${CLASS_BY_ID[cls].color}">${CLASS_BY_ID[cls].id}<b>${stats.pi}</b></span>`; }

  // ---------- title / new career ----------
  v_title() {
    const has = this.c.load();
    if (has) this.showCar(this.c.d.selected);
    else this.showCar("stiletto", CAR_BY_ID.stiletto.livery, "gold");
    return `<div class="title-screen">
      <div class="title-logo"><div class="t-kicker">World Rally · 1960 – today</div><h1>RALLY<span>LEGENDS</span></h1><p>Five eras. Ten legends. Twenty-seven stages against the clock.</p></div>
      <div class="title-actions">
        ${has ? `<button class="btn primary big" data-a="continue">Continue career <small>${esc(this.c.d.name)} · level ${this.c.level} · ${fmtCredits(this.c.d.credits)}</small></button>` : ""}
        <button class="btn ${has ? "" : "primary big"}" data-a="go" data-v="newcareer">${has ? "New career" : "Start your career"}</button>
      </div>
      <p class="title-foot">Runs in your browser inside Salesforce · progress saved per user on this device · keyboard, gamepad or touch</p>
    </div>`;
  }
  v_newcareer(p) {
    p.diff = p.diff || "amateur"; p.starter = p.starter || "mosquito";
    p.name = p.name != null ? p.name : (window.RL_NAME || "").trim();
    this.showCar(p.starter, CAR_BY_ID[p.starter].livery, CAR_BY_ID[p.starter].livery.rim);
    const starters = CARS.filter(c => c.starter);
    return `<div class="menu"><section class="panel solo"><div class="panel-body">
      <h2 class="ptitle">New career</h2>
      ${this.c.d ? `<p class="warn-box">Starting a new career replaces your current save (${esc(this.c.d.name)}, level ${this.c.level}).</p>` : ""}
      <label class="field"><span>Driver name</span><input id="nc-name" maxlength="28" value="${esc(p.name)}" placeholder="Your name"></label>
      <div class="field"><span>Difficulty</span><div class="seg">${DIFFICULTIES.map(d => `<button class="${d.id === p.diff ? "on" : ""}" data-a="nc-diff" data-id="${d.id}">${d.name}<small>${d.desc}</small><em>pay ×${d.pay}</em></button>`).join("")}</div></div>
      <div class="field"><span>Choose your first car (free)</span><div class="cards two">${starters.map(car => {
        const s = specStats(buildSpec(car, {}, null));
        return `<button class="card car-card ${car.id === p.starter ? "on" : ""}" data-a="nc-car" data-id="${car.id}"><div class="cc-head"><b>${esc(car.name)}</b>${this.pi(s, car.cls)}</div><div class="cc-sub">${esc(car.maker)} · ${car.year} · ${car.drive}</div><p>${esc(car.blurb)}</p>${this.statBars(s)}</button>`;
      }).join("")}</div></div>
      <div class="row-end"><button class="btn" data-a="go" data-v="title">Back</button><button class="btn primary" data-a="nc-start">Start career</button></div>
    </div></section></div>`;
  }

  // ---------- season ----------
  v_season() {
    const c = this.c;
    this.showCar(c.d.selected);
    const cards = CLASSES.map(cl => {
      const s = c.champ(cl.id), req = c.champRequirement(cl.id), rounds = CHAMPIONSHIPS[cl.id].rounds, ch = c.d.champs[cl.id];
      let status, btn;
      if (!c.classUnlocked(cl.id)) { status = `<span class="lock">🔒 Reputation level ${cl.repReq}</span>`; btn = ""; }
      else if (req.needCar) { status = `<span class="lock">Needs a ${cl.name} car</span>`; btn = `<button class="btn small" data-a="go" data-v="dealer" data-cls="${cl.id}">Dealership</button>`; }
      else if (s && !s.done) { status = `Season ${s.season} · Round ${s.round + 1} of ${rounds.length}`; btn = `<button class="btn small primary" data-a="go" data-v="champ" data-cls="${cl.id}">Continue</button>`; }
      else { status = s ? `Season ${s.season} complete` : "Ready"; btn = `<button class="btn small primary" data-a="go" data-v="champ" data-cls="${cl.id}">${s ? "View" : "Enter"}</button>`; }
      return `<div class="champ-card ${c.classUnlocked(cl.id) ? "" : "locked"}" style="--c:${cl.color}">
        <div class="cc-era">${cl.era}</div><h3>${esc(cl.title)}</h3><p>${esc(cl.blurb)}</p>
        <div class="cc-rounds">${rounds.map(([l, n]) => `<span title="${esc(LOC_BY_ID[l].name)}">${LOC_BY_ID[l].code}</span>`).join("")}</div>
        <div class="cc-foot"><span>${status}</span>${ch ? `<span class="trophy">🏆 ${ch.wins} · best P${ch.best}</span>` : ""}${btn}</div></div>`;
    }).join("");
    return this.frame("season", `<p class="lede">Win championships to earn credits and reputation. Reputation unlocks the next era; credits buy cars, upgrades and liveries.</p><div class="champ-grid">${cards}</div>`, "Season");
  }

  v_champ(p) {
    const c = this.c, cls = p.cls, cl = CLASS_BY_ID[cls], s = c.champ(cls), rounds = CHAMPIONSHIPS[cls].rounds;
    const owned = c.ownedInClass(cls);
    const carId = s && !s.done ? s.carId : (p.carId || (owned.find(x => x.id === c.d.selected) || owned[0]).id);
    this.showCar(carId);
    const carSel = `<div class="car-pick">${owned.map(car => `<button class="chip ${car.id === carId ? "on" : ""}" data-a="champ-car" data-cls="${cls}" data-id="${car.id}">${esc(car.name)}</button>`).join("")}</div>`;
    let body = `<div class="champ-head" style="--c:${cl.color}"><div><div class="cc-era">${cl.era} · ${cl.name}</div><h3>${esc(cl.title)}${s ? ` <small>Season ${s.season}</small>` : ""}</h3></div></div>`;
    if (!s || s.done) {
      if (s && s.done) body += `<h4>Final standings · Season ${s.season}</h4>${this.standingsTable(cls)}`;
      body += `<h4>Your car</h4>${carSel}<p class="muted">${rounds.length} rounds, ${rounds.reduce((a, r) => a + r[1], 0)} stages. Rivals drive at ${esc(c.diff.name)} pace. Damage carries over between stages, so budget for repairs.</p>
        <div class="row-end"><button class="btn" data-a="go" data-v="season">Back</button><button class="btn primary" data-a="champ-start" data-cls="${cls}" data-id="${carId}">Start season ${s ? s.season + 1 : 1}</button></div>`;
    } else {
      const ev = c.ensureEvent(cls);
      const canChange = ev.stage === 0;
      body += `<div class="two-col"><div><h4>Calendar</h4><ol class="calendar">${rounds.map(([l, n], i) => {
        const res = s.results.find(r => r.round === i), cur = i === s.round;
        return `<li class="${cur ? "cur" : res ? "done" : ""}"><span class="code">${LOC_BY_ID[l].code}</span><span class="cn">${esc(LOC_BY_ID[l].name)}<small>${n} stages</small></span>${res ? `<span class="res p${res.pos + 1}">P${res.pos + 1} · ${res.points} pts</span>` : cur ? `<span class="res now">Next</span>` : ""}</li>`;
      }).join("")}</ol></div><div><h4>Standings</h4>${this.standingsTable(cls)}</div></div>
        <h4>Car</h4>${canChange ? carSel : `<p class="muted">${esc(CAR_BY_ID[s.carId].name)} (locked until this round ends)</p>`}
        <div class="row-end"><button class="btn" data-a="go" data-v="season">Back</button><button class="btn primary" data-a="go" data-v="event" data-cls="${cls}">Round ${s.round + 1}: ${esc(LOC_BY_ID[ev.locId].name)} →</button></div>`;
    }
    return this.frame("season", body);
  }
  standingsTable(cls) {
    const c = this.c, rv = RIVALS[cls], s = c.champ(cls);
    const rows = c.standings(cls);
    return `<table class="tbl"><thead><tr><th>Pos</th><th>Driver</th><th class="r">Pts</th></tr></thead><tbody>${rows.map((r, i) => {
      const me = r.id === "P", name = me ? c.d.name : rv[r.id][0], nat = me ? "YOU" : rv[r.id][1];
      return `<tr class="${me ? "me" : ""}"><td>${i + 1}</td><td>${esc(name)} <span class="nat">${nat}</span></td><td class="r">${r.pts}</td></tr>`;
    }).join("")}</tbody></table>`;
  }

  v_event(p) {
    const c = this.c, cls = p.cls, s = c.champ(cls), ev = c.ensureEvent(cls), loc = LOC_BY_ID[ev.locId], car = CAR_BY_ID[s.carId];
    this.showCar(s.carId);
    this.app.showroom.setDirt(clamp(ev.stage * 0.3, 0, 0.8));
    const g = c.d.garage[s.carId], dmg = c.damage(s.carId), cost = c.repairCost(s.carId);
    const obj = OBJECTIVES.find(o => o.id === ev.objective);
    const stages = [];
    for (let i = 0; i < ev.nStages; i++) {
      const sd = loc.stages[i], done = i < ev.stage;
      let res = "";
      if (done) {
        const order = c.classify(ev, i), pos = order.findIndex(o => o.id === "P");
        res = `<span class="res p${pos + 1}">${fmtTime(ev.times.P[i])} · P${pos + 1}</span>`;
      }
      stages.push(`<li class="${done ? "done" : i === ev.stage ? "cur" : ""}"><span class="code">SS${i + 1}</span><span class="cn">${esc(sd.name)}${i === ev.nStages - 1 ? ` <em class="ps">Power Stage</em>` : ""}<small>${(sd.len / 1000).toFixed(1)} km · ${TIME_ICON[sd.time]} ${sd.time} · ${WX_ICON[sd.weather]} ${WX_LABEL[sd.weather]} · ${(loc.mix || [[loc.surface]]).map(([id]) => SURFACES[id].label).join(" / ")}</small></span>${res}</li>`);
    }
    const overall = ev.stage ? c.overall({ times: Object.fromEntries(Object.entries(ev.times).map(([k, v]) => [k, v.slice(0, ev.stage)])) }) : null;
    const myPos = overall ? overall.findIndex(o => o.id === "P") : -1;
    const done = ev.stage >= ev.nStages;
    const body = `<div class="event-head"><span class="code big">${loc.code}</span><div><div class="cc-era">${esc(CLASS_BY_ID[cls].title)} · Round ${ev.round + 1} of ${CHAMPIONSHIPS[cls].rounds.length}</div><h3>${esc(loc.name)} <small>${esc(loc.country)}</small></h3></div></div>
      <p class="lede">${esc(loc.blurb)}</p>
      <div class="obj">Sponsor objective: <b>${esc(obj.text)}</b> <span>+${fmtCredits(TIER_PRIZE[CLASS_BY_ID[cls].tier] * obj.bonus * c.diff.pay)}</span></div>
      <ol class="calendar stages">${stages.join("")}</ol>
      ${overall ? `<p class="muted">Overall after SS${ev.stage}: <b>P${myPos + 1}</b>${myPos > 0 ? ` · ${fmtDelta(overall[myPos].t - overall[0].t)}s to the leader` : overall[1] ? ` · leading by ${(overall[1].t - overall[0].t).toFixed(2)}s` : ""}</p>` : ""}
      <div class="service"><h4>Service park · ${esc(car.name)}</h4>
        <div class="dmg-row">${[["Engine", g.dmg.engine], ["Suspension", g.dmg.susp], ["Bodywork", g.dmg.body]].map(([l, d]) => `<div><span>${l}</span><div class="bar dmg"><i style="width:${(d * 100).toFixed(0)}%"></i></div><em>${Math.round(d * 100)}%</em></div>`).join("")}</div>
        ${dmg > 0.005 ? `<button class="btn small" data-a="repair" data-id="${s.carId}" data-back="event" data-cls="${cls}">Repair all · ${fmtCredits(cost)}</button>` : `<span class="muted">No damage</span>`}
        <span class="muted">Restarts left this round: ${ev.restarts}</span>
      </div>
      <div class="row-end"><button class="btn" data-a="go" data-v="champ" data-cls="${cls}">Championship</button>
        ${done ? `<button class="btn primary" data-a="finish-event" data-cls="${cls}">Finish round →</button>` : `<button class="btn" data-a="tt-start" data-loc="${loc.id}" data-stage="${ev.stage}" data-id="${s.carId}" data-surf="mixed" title="Drive it in Time Trial first. Doesn't affect the championship.">Practice</button><button class="btn primary" data-a="start-stage" data-cls="${cls}">Start SS${ev.stage + 1}: ${esc(loc.stages[ev.stage].name)} →</button>`}</div>`;
    return this.frame("season", body);
  }

  v_stageResult(p) {
    const c = this.c, cls = p.cls, rv = RIVALS[cls], s = c.champ(cls), ev = s.event, rec = p.rec, r = p.result;
    const best = rec.order[0].t;
    const name = id => id === "P" ? c.d.name : rv[id][0];
    const loc = LOC_BY_ID[ev.locId], k = ev.stage - 1;
    const overall = c.overall({ times: Object.fromEntries(Object.entries(ev.times).map(([kk, v]) => [kk, v.slice(0, ev.stage)])) });
    this.showCar(s.carId);
    this.app.showroom.setDirt(0.8);
    const body = `<div class="result-head ${rec.pos === 0 ? "win" : ""}"><div class="cc-era">${esc(loc.name)} · SS${k + 1}</div><h3>${esc(loc.stages[k].name)}</h3>
      <div class="big-pos">P${rec.pos + 1}</div><div class="big-time">${fmtTime(r.time)}${r.penalty ? ` <small>incl. ${r.penalty}s penalties</small>` : ""}${r.retired ? ` <small>retired</small>` : ""}</div></div>
      <div class="two-col"><div><h4>Stage</h4>${this.timeTable(rec.order, name, best, rv)}</div><div><h4>Overall</h4>${this.timeTable(overall, name, overall[0].t, rv)}</div></div>
      <div class="rewards">${rec.credits ? `<span>Stage win <b>+${fmtCredits(rec.credits)}</b></span>` : ""}<span><b>+${rec.xp}</b> XP</span><span>Damage now <b>${Math.round(c.damage(s.carId) * 100)}%</b></span><span>Top speed <b>${Math.round(r.maxSpeed * 3.6)} km/h</b></span></div>
      <div class="row-end">${c.canRetryStage(cls) ? `<button class="btn" data-a="retry-stage" data-cls="${cls}" title="Discards this result, its rewards and its damage">Retry stage · ${ev.restarts} left</button>` : `<span class="muted">No restarts left this round</span>`}<button class="btn primary" data-a="go" data-v="event" data-cls="${cls}">Continue →</button></div>`;
    if (rec.levelUp) this.levelUpToast(rec.levelUp);
    return this.frame("season", body);
  }
  timeTable(order, name, best, rv) {
    return `<table class="tbl"><thead><tr><th>Pos</th><th>Driver</th><th class="r">Time</th><th class="r">Diff</th></tr></thead><tbody>${order.map((o, i) => `<tr class="${o.id === "P" ? "me" : ""}"><td>${i + 1}</td><td>${esc(name(o.id))} <span class="nat">${o.id === "P" ? "YOU" : rv[o.id][1]}</span></td><td class="r">${fmtTime(o.t)}</td><td class="r">${i ? "+" + (o.t - best).toFixed(2) : ""}</td></tr>`).join("")}</tbody></table>`;
  }

  v_eventResult(p) {
    const c = this.c, cls = p.cls, sum = p.sum, rv = RIVALS[cls], s = c.champ(cls);
    const name = id => id === "P" ? c.d.name : rv[id][0];
    this.showCar(s.carId);
    let body = `<div class="result-head ${sum.pos === 0 ? "win" : ""}"><div class="cc-era">${esc(CLASS_BY_ID[cls].title)} · Round ${p.round + 1}</div><h3>${esc(LOC_BY_ID[p.locId].name)}</h3>
      <div class="big-pos">P${sum.pos + 1}</div><div class="big-time">${sum.points} points${sum.powerPos < 3 ? ` <small>incl. Power Stage +${3 - sum.powerPos}</small>` : ""}</div></div>
      <div class="two-col"><div><h4>Round classification</h4>${this.timeTable(sum.overall, name, sum.overall[0].t, rv)}</div><div><h4>Championship</h4>${this.standingsTable(cls)}</div></div>
      <div class="rewards"><span>Prize <b>+${fmtCredits(sum.prize)}</b></span><span class="${sum.objMet ? "ok" : "miss"}">${esc(sum.objective.text)} <b>${sum.objMet ? "+" + fmtCredits(sum.bonus) : "missed"}</b></span><span><b>+${sum.xp.toLocaleString()}</b> XP</span></div>`;
    if (sum.champ) body += `<div class="title-banner ${sum.champ.pos === 0 ? "win" : ""}"><h3>${sum.champ.pos === 0 ? "🏆 CHAMPION" : "Season complete · P" + (sum.champ.pos + 1)}</h3><p>Championship bonus <b>+${fmtCredits(sum.champ.prize)}</b>${sum.champ.pos === 0 ? " · Legend-level parts unlocked for " + esc(CLASS_BY_ID[cls].name) + " cars" : ""}</p></div>`;
    body += `<div class="row-end"><button class="btn primary" data-a="go" data-v="champ" data-cls="${cls}">Continue →</button></div>`;
    if (sum.levelUp) this.levelUpToast(sum.levelUp);
    return this.frame("season", body);
  }
  levelUpToast(lvl) {
    const unlocks = [];
    CLASSES.forEach(cl => { if (cl.repReq === lvl) unlocks.push(cl.name + " cars and the " + cl.title); });
    LIVERY_DESIGNS.forEach(d => { if (d.rep === lvl) unlocks.push(d.name + " livery"); });
    setTimeout(() => this.toast(`<b>Reputation level ${lvl}!</b>${unlocks.length ? "<br>Unlocked: " + esc(unlocks.join(", ")) : ""}`, "level"), 400);
  }

  // ---------- garage ----------
  v_garage(p) {
    const c = this.c;
    const id = p.id && c.owns(p.id) ? p.id : c.d.selected;
    const car = CAR_BY_ID[id], g = c.d.garage[id], tab = p.tab || "upgrades";
    const stats = c.stats(id);
    const preview = p.preview;
    if (preview && preview.livery) this.showCar(id, preview.livery, preview.rim || g.rim);
    else if (preview && preview.rim) this.showCar(id, g.livery, preview.rim);
    else this.showCar(id);
    const list = `<div class="car-pick">${c.ownedCars().map(cc => `<button class="chip ${cc.id === id ? "on" : ""}" style="--c:${CLASS_BY_ID[cc.cls].color}" data-a="garage-car" data-id="${cc.id}">${esc(cc.name)}</button>`).join("")}</div>`;
    const dmg = c.damage(id);
    let body = `${list}<div class="car-head"><div><div class="cc-era">${esc(car.maker)} · ${car.year} · ${esc(CLASS_BY_ID[car.cls].name)}</div><h3>${esc(car.name)}</h3></div>${this.pi(stats, car.cls)}</div>
      ${this.carFacts(car, stats)}
      ${dmg > 0.005 ? `<div class="warn-box">Damage ${Math.round(dmg * 100)}% · <button class="btn small" data-a="repair" data-id="${id}" data-back="garage">Repair · ${fmtCredits(c.repairCost(id))}</button></div>` : ""}
      <div class="tabs">${[["upgrades", "Upgrades"], ["livery", "Liveries"], ["paint", "Paint shop"], ["wheels", "Wheels"]].map(([k, l]) => `<button class="${k === tab ? "on" : ""}" data-a="garage-tab" data-tab="${k}" data-id="${id}">${l}</button>`).join("")}</div>`;
    if (tab === "upgrades") body += this.upgradesTab(id, stats);
    if (tab === "livery") body += this.liveryTab(id, preview);
    if (tab === "paint") body += this.paintTab(id, preview);
    if (tab === "wheels") body += this.wheelsTab(id, preview);
    return this.frame("garage", body);
  }
  upgradesTab(id, stats) {
    const c = this.c, g = c.d.garage[id];
    const hover = this.p.hoverCat;
    let next = null;
    if (hover) { const parts = Object.assign({}, g.parts); parts[hover] = Math.min(6, parts[hover] + 1); next = c.stats(id, parts); }
    return this.statBars(stats, next) + `<div class="upgrades">${PART_CATS.map(cat => {
      const lvl = g.parts[cat.id], req = c.partRequirement(id, cat.id);
      const pips = PART_LEVELS.slice(1).map((n, i) => `<i class="${i < lvl ? "on" : ""} ${i === PART_LEVELS.length - 2 ? "legend" : ""}" title="${n}"></i>`).join("");
      let btn;
      if (req.maxed) btn = `<span class="maxed">MAXED</span>`;
      else {
        const cost = c.partCost(id, cat.id, lvl + 1);
        const nextStats = (() => { const parts = Object.assign({}, g.parts); parts[cat.id] = lvl + 1; return c.stats(id, parts); })();
        btn = `<button class="btn small ${req.ok ? "primary" : ""}" data-a="buy-part" data-id="${id}" data-cat="${cat.id}" ${req.ok ? "" : "disabled"} title="${esc(req.reason || "")}">${PART_LEVELS[lvl + 1]} · ${fmtCredits(cost)} <small>PI ${stats.pi}→${nextStats.pi}</small></button>${req.ok ? "" : `<small class="req">${esc(req.reason)}</small>`}`;
      }
      return `<div class="upg" data-cat="${cat.id}"><div class="upg-name"><b>${cat.name}</b><span>${PART_LEVELS[lvl]}</span></div><div class="pips">${pips}</div><p>${esc(cat.desc)}</p><div class="upg-buy">${btn}</div></div>`;
    }).join("")}</div><p class="muted">Parts are bought in order: Street → Sport → Rally → Pro → Works → Legend. Pro and Works need extra reputation; Legend needs this class's championship.</p>`;
  }
  liveryTab(id, preview) {
    const c = this.c, g = c.d.garage[id], car = CAR_BY_ID[id];
    const sel = preview && preview.key ? preview.key : g.livery.key;
    const sw = cols => `<span class="sw">${cols.map(col => `<i style="background:${col}"></i>`).join("")}</span>`;
    const card = (key, name, cols, cost, rep) => {
      const owned = c.ownsLivery(id, key), locked = rep > c.unlockLevel;
      return `<button class="liv ${sel === key ? "on" : ""} ${g.livery.key === key ? "cur" : ""}" data-a="liv-preview" data-id="${id}" data-key="${key}">${sw(cols)}<span class="ln">${esc(name)}</span><small>${g.livery.key === key ? "On car" : owned ? "Owned" : locked ? "🔒 Rep " + rep : fmtCredits(cost)}</small></button>`;
    };
    let html = `<div class="liv-grid">${card("factory", "Works (" + car.livery.design + ")", car.livery.colors, 0, 0)}`;
    for (const d of LIVERY_DESIGNS) d.ways.forEach((w, i) => { html += card(d.id + ":" + i, d.name + " " + (i + 1), w, c.liveryCost(id, d.id), d.rep); });
    html += `</div>`;
    if (sel !== g.livery.key) {
      const owned = c.ownsLivery(id, sel), dId = sel === "factory" ? "factory" : sel.split(":")[0];
      const req = c.liveryRequirement(id, dId);
      html += `<div class="sticky-buy"><span>${owned ? "Owned" : req.ok ? fmtCredits(req.cost) : esc(req.reason)}</span><button class="btn" data-a="liv-cancel" data-id="${id}">Cancel</button><button class="btn primary" data-a="liv-apply" data-id="${id}" data-key="${sel}" ${req.ok ? "" : "disabled"}>${owned ? "Apply" : "Buy & apply"}</button></div>`;
    }
    html += `<label class="field inline"><span>Race number</span><input type="number" min="1" max="99" value="${g.livery.number}" data-f="number" data-id="${id}"></label>`;
    return html;
  }
  paintTab(id, preview) {
    const c = this.c, g = c.d.garage[id];
    const pv = preview && preview.custom ? preview.custom : { design: g.livery.design, colors: g.livery.colors.slice(), number: g.livery.number };
    this.p.preview = { custom: pv, livery: { design: pv.design, colors: pv.colors, number: pv.number } };
    this.afterRender = () => this.showCar(id, this.p.preview.livery);
    const cost = c.customPaintCost(id);
    return `<p class="muted">Paint any unlocked design in your own colours.</p>
      <div class="paint">
        <label class="field"><span>Design</span><select data-f="pdesign">${LIVERY_DESIGNS.map(d => `<option value="${d.id}" ${d.id === pv.design ? "selected" : ""} ${d.rep > c.unlockLevel ? "disabled" : ""}>${d.name}${d.rep > c.unlockLevel ? " (rep " + d.rep + ")" : ""}</option>`).join("")}</select></label>
        ${["Base", "Accent", "Detail"].map((l, i) => `<label class="field color"><span>${l}</span><input type="color" value="${pv.colors[i]}" data-f="pcol" data-i="${i}"></label>`).join("")}
        <label class="field"><span>Number</span><input type="number" min="1" max="99" value="${pv.number}" data-f="pnum"></label>
      </div>
      <div class="row-end"><button class="btn" data-a="garage-tab" data-tab="paint" data-id="${id}" data-reset="1">Reset</button><button class="btn primary" data-a="paint-apply" data-id="${id}">Paint car · ${fmtCredits(cost)}</button></div>`;
  }
  wheelsTab(id, preview) {
    const c = this.c, g = c.d.garage[id], sel = preview && preview.rim ? preview.rim : g.rim;
    return `<div class="rims">${RIMS.map(r => `<button class="rim ${r.id === sel ? "on" : ""}" data-a="rim-preview" data-id="${id}" data-rim="${r.id}"><i style="background:${r.color}"></i><span>${r.name}</span><small>${g.rim === r.id ? "On car" : g.rims.includes(r.id) ? "Owned" : fmtCredits(r.price)}</small></button>`).join("")}</div>
      ${sel !== g.rim ? `<div class="sticky-buy"><span>${g.rims.includes(sel) ? "Owned" : fmtCredits(RIM_BY_ID[sel].price)}</span><button class="btn primary" data-a="rim-apply" data-id="${id}" data-rim="${sel}">${g.rims.includes(sel) ? "Fit" : "Buy & fit"}</button></div>` : ""}`;
  }

  // ---------- dealership ----------
  v_dealer(p) {
    const c = this.c, cls = p.cls || (CLASSES.slice().reverse().find(cl => c.classUnlocked(cl.id)) || CLASSES[0]).id;
    const cars = carsInClass(cls), sel = p.id && CAR_BY_ID[p.id].cls === cls ? p.id : cars[0].id;
    const car = CAR_BY_ID[sel];
    this.showCar(sel, car.livery, car.livery.rim);
    const stats = specStats(buildSpec(car, {}, null)), req = c.carRequirement(sel);
    const tabs = `<div class="tabs">${CLASSES.map(cl => `<button class="${cl.id === cls ? "on" : ""}" style="--c:${cl.color}" data-a="go" data-v="dealer" data-cls="${cl.id}">${cl.era}<small>${cl.name}${c.classUnlocked(cl.id) ? "" : " 🔒"}</small></button>`).join("")}</div>`;
    const list = `<div class="cards two">${cars.map(cc => { const s = specStats(buildSpec(cc, {}, null)); return `<button class="card car-card ${cc.id === sel ? "on" : ""}" data-a="go" data-v="dealer" data-cls="${cls}" data-id="${cc.id}"><div class="cc-head"><b>${esc(cc.name)}</b>${this.pi(s, cc.cls)}</div><div class="cc-sub">${esc(cc.maker)} · ${cc.year} · ${cc.drive}</div><div class="price">${c.owns(cc.id) ? "Owned" : fmtCredits(cc.price)}</div></button>`; }).join("")}</div>`;
    const body = `${tabs}<p class="lede">${esc(CLASS_BY_ID[cls].blurb)}</p>${list}
      <div class="car-head"><div><div class="cc-era">${esc(car.maker)} · ${car.year}</div><h3>${esc(car.name)}</h3></div>${this.pi(stats, car.cls)}</div>
      <p>${esc(car.blurb)}</p>${this.carFacts(car, stats)}${this.statBars(specStats(buildSpec(car, Object.fromEntries(PART_CATS.map(pc => [pc.id, 6])), null)), null).replace('class="stats"', 'class="stats ghosted"')}${this.statBars(stats)}
      <p class="muted">Faded bars show the car fully upgraded.</p>
      <div class="row-end">${c.owns(sel) ? `<button class="btn" data-a="go" data-v="garage" data-id="${sel}">Open in garage</button>` : `<span class="muted">${req.ok ? "" : esc(req.reason)}</span><button class="btn primary" data-a="buy-car" data-id="${sel}" ${req.ok ? "" : "disabled"}>Buy · ${fmtCredits(car.price)}</button>`}</div>`;
    return this.frame("dealer", body);
  }

  // ---------- time trial ----------
  v_tt(p) {
    const c = this.c;
    const locId = p.loc || "finland", loc = LOC_BY_ID[locId], idx = +(p.stage || 0);
    const surf = p.surf || this.ttSurf || "mixed";
    this.ttSurf = surf;
    const owned = c.ownedCars(), carId = p.id && c.owns(p.id) ? p.id : c.d.selected, car = CAR_BY_ID[carId];
    this.showCar(carId);
    const rec = c.record(locId, idx, car.cls, surf);
    const mixLabel = (loc.mix || [[loc.surface, 1]]).map(([id]) => SURFACES[id].label).join(" · ");
    const surfPick = `<h4>Road surface</h4><div class="car-pick">${["mixed", ...ROAD_SURFACES].map(id => `<button class="chip ${id === surf ? "on" : ""}" data-a="tt-surf" data-surf="${id}">${id === "mixed" ? "Rally mix (" + esc(mixLabel) + ")" : SURFACES[id].label}</button>`).join("")}</div>`;
    const body = `<p class="lede">Any stage, any car you own. Beat your record to earn a bonus and race your ghost next time.</p>
      <div class="loc-grid">${LOCATIONS.map(l => `<button class="loc ${l.id === locId ? "on" : ""}" data-a="go" data-v="tt" data-loc="${l.id}" data-id="${carId}"><span class="code">${l.code}</span><b>${esc(l.name)}</b><small>${SURFACES[l.surface].label}</small></button>`).join("")}</div>
      <h4>${esc(loc.name)} <small>${esc(loc.country)}</small></h4><p class="muted">${esc(loc.blurb)}</p>
      <ol class="calendar stages">${loc.stages.map((sd, i) => { const r = c.record(locId, i, car.cls, surf); return `<li class="${i === idx ? "cur" : ""}" data-a="go" data-v="tt" data-loc="${locId}" data-stage="${i}" data-id="${carId}"><span class="code">SS${i + 1}</span><span class="cn">${esc(sd.name)}<small>${(sd.len / 1000).toFixed(1)} km · ${TIME_ICON[sd.time]} ${sd.time} · ${WX_ICON[sd.weather]} ${WX_LABEL[sd.weather]}</small></span>${r ? `<span class="res">${fmtTime(r.time)}</span>` : ""}</li>`; }).join("")}</ol>
      ${surfPick}
      <h4>Car</h4><div class="car-pick">${owned.map(cc => `<button class="chip ${cc.id === carId ? "on" : ""}" style="--c:${CLASS_BY_ID[cc.cls].color}" data-a="go" data-v="tt" data-loc="${locId}" data-stage="${idx}" data-id="${cc.id}">${esc(cc.name)}</button>`).join("")}</div>
      <div class="row-end"><span class="muted">${rec ? "Record (" + esc(CLASS_BY_ID[car.cls].name) + (surf === "mixed" ? "" : ", " + SURFACES[surf].label) + "): " + fmtTime(rec.time) : "No record yet"}</span><button class="btn primary" data-a="tt-start" data-loc="${locId}" data-stage="${idx}" data-id="${carId}">Drive ${esc(loc.stages[idx].name)} →</button></div>`;
    return this.frame("tt", body, "Time Trial");
  }
  v_ttResult(p) {
    const r = p.result, res = p.res, loc = LOC_BY_ID[p.locId];
    this.showCar(p.carId);
    const body = `<div class="result-head ${res.pb ? "win" : ""}"><div class="cc-era">Time Trial · ${esc(loc.name)}</div><h3>${esc(loc.stages[p.stageIdx].name)}</h3>
      <div class="big-time">${fmtTime(r.time)}${r.penalty ? ` <small>incl. ${r.penalty}s penalties</small>` : ""}</div>
      <div class="big-pos small">${res.pb ? (res.prev ? "NEW RECORD · " + fmtDelta(r.time - res.prev) : "FIRST RECORD") : "Record " + fmtTime(res.prev) + " · " + fmtDelta(r.time - res.prev)}</div></div>
      <div class="rewards"><span><b>+${fmtCredits(res.credits)}</b></span><span>Top speed <b>${Math.round(r.maxSpeed * 3.6)} km/h</b></span><span>Resets <b>${r.resets}</b></span></div>
      <div class="row-end"><button class="btn" data-a="go" data-v="tt" data-loc="${p.locId}" data-stage="${p.stageIdx}" data-id="${p.carId}">Back</button><button class="btn primary" data-a="tt-start" data-loc="${p.locId}" data-stage="${p.stageIdx}" data-id="${p.carId}">Drive again</button></div>`;
    if (res.levelUp) this.levelUpToast(res.levelUp);
    return this.frame("tt", body);
  }

  // ---------- records ----------
  v_records() {
    const c = this.c, st = c.d.stats;
    this.showCar(c.d.selected);
    const rows = [];
    for (const [key, r] of Object.entries(c.d.records)) {
      const [lid, i, cls, surf] = key.split("/"), l = LOC_BY_ID[lid], cl = CLASS_BY_ID[cls];
      if (!l || !cl) continue;
      const carId = c.owns(r.carId) ? r.carId : (c.ownedInClass(cls)[0] || {}).id;
      rows.push(`<tr><td><span class="code sm">${l.code}</span> ${esc(l.stages[+i].name)}${surf ? ` <small>(${esc(SURFACES[surf].label)})</small>` : ""}</td><td><span class="nat" style="--c:${cl.color}">${cl.id}</span></td><td>${esc(CAR_BY_ID[r.carId].name)}</td><td class="r">${fmtTime(r.time)}</td><td class="r">${carId ? `<button class="btn small" data-a="tt-start" data-loc="${lid}" data-stage="${i}" data-id="${carId}" data-surf="${surf || "mixed"}">Drive</button>` : ""}</td></tr>`);
    }
    const champs = CLASSES.map(cl => { const ch = c.d.champs[cl.id]; return `<div class="trophy-card ${ch && ch.wins ? "won" : ""}" style="--c:${cl.color}"><b>${esc(cl.title)}</b><span>${ch ? `${ch.wins} title${ch.wins === 1 ? "" : "s"} · best P${ch.best} · ${ch.completed} season${ch.completed === 1 ? "" : "s"}` : "Not yet contested"}</span></div>`; }).join("");
    const body = `<div class="facts wide"><div><b>${st.stages}</b><span>stages</span></div><div><b>${st.stageWins}</b><span>stage wins</span></div><div><b>${st.eventWins}</b><span>round wins</span></div><div><b>${st.titles}</b><span>titles</span></div><div><b>${Math.round(st.km)}</b><span>km</span></div><div><b>${fmtCredits(st.earned)}</b><span>earned</span></div></div>
      <div class="trophies">${champs}</div>
      <h4>Stage records</h4>${rows.length ? `<table class="tbl"><thead><tr><th>Stage</th><th>Class</th><th>Car</th><th class="r">Time</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table>` : `<p class="muted">Set records in Time Trial.</p>`}`;
    return this.frame("records", body, "Records");
  }

  // ---------- settings ----------
  settingsFields(compact) {
    const s = this.c.settings;
    const voices = window.speechSynthesis ? speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)) : [];
    const tog = (k, label, sub) => `<label class="tog"><input type="checkbox" data-f="set" data-k="${k}" ${(sub ? s[k][sub] : s[k]) ? "checked" : ""} ${sub ? `data-sub="${sub}"` : ""}><span>${label}</span></label>`;
    let h = "";
    h += `<label class="field"><span>Transmission</span><select data-f="set" data-k="manual"><option value="0" ${!s.manual ? "selected" : ""}>Automatic</option><option value="1" ${s.manual ? "selected" : ""}>Manual · E / Shift up, Q / Ctrl down (gamepad: bumpers)</option></select></label>`;
    if (!compact) h += `<label class="field"><span>Graphics quality</span><select data-f="set" data-k="quality">${["low", "medium", "high", "ultra"].map(q => `<option value="${q}" ${s.quality === q ? "selected" : ""}>${q[0].toUpperCase() + q.slice(1)}</option>`).join("")}</select></label>
      <label class="field"><span>Speed units</span><select data-f="set" data-k="units"><option value="kmh" ${s.units === "kmh" ? "selected" : ""}>km/h</option><option value="mph" ${s.units === "mph" ? "selected" : ""}>mph</option></select></label>
`;
    h += `<label class="field"><span>Master volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-f="set" data-k="volume"></label>
      <label class="field"><span>Engine volume</span><input type="range" min="0" max="1.5" step="0.05" value="${s.engineVol}" data-f="set" data-k="engineVol"></label>
      ${tog("voice", "Co-driver calls pace notes out loud")}
      ${voices.length && !compact ? `<label class="field"><span>Co-driver voice</span><select data-f="set" data-k="voiceName"><option value="">Automatic</option>${voices.map(v => `<option ${v.name === s.voiceName ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></label>` : ""}
      ${tog("shake", "Camera shake")}
      ${compact ? "" : tog("ghost", "Show my ghost car in Time Trial")}
      <h4>Driving assists <small>(all off: +10% prize money)</small></h4>
      ${tog("assist", "Counter-steer assist", "steer")}${tog("assist", "ABS", "abs")}${tog("assist", "Traction control", "tc")}`;
    return h;
  }
  v_settings() {
    const c = this.c;
    this.showCar(c.d.selected);
    const body = `<div class="settings">${this.settingsFields(false)}
      <h4>Difficulty <small>(rival pace and prize money)</small></h4><div class="seg">${DIFFICULTIES.map(d => `<button class="${d.id === c.d.difficulty ? "on" : ""}" data-a="set-diff" data-id="${d.id}">${d.name}<em>pay ×${d.pay}</em></button>`).join("")}</div>
      <h4>Controls</h4><table class="tbl keys"><tbody>
        <tr><td>Throttle / brake</td><td>↑ ↓ or W S · gamepad RT / LT</td></tr><tr><td>Steer</td><td>← → or A D · left stick</td></tr>
        <tr><td>Handbrake</td><td>Space · gamepad A / X</td></tr><tr><td>Reset to road (+5s)</td><td>R · gamepad Back</td></tr>
        <tr><td>Camera</td><td>C · gamepad Y</td></tr><tr><td>Shift (manual)</td><td>E / Q · bumpers</td></tr><tr><td>Pause</td><td>Esc or P · Start</td></tr><tr><td>Mute</td><td>M</td></tr></tbody></table>
      <h4>Save</h4><p class="muted">Progress is stored in this browser for your Salesforce user. Copy the save code to move it to another browser.</p>
      <div class="row"><button class="btn small" data-a="save-export">Copy save code</button><button class="btn small" data-a="save-import">Load a save code…</button><button class="btn small danger" data-a="reset-career">Delete career…</button></div>
      <textarea id="save-code" class="hidden" rows="3"></textarea>
      <h4>Cheat code</h4><div class="row"><input id="cheat-code" type="text" autocomplete="off" spellcheck="false" placeholder="Enter a code"><button class="btn small" data-a="cheat">Enter</button></div></div>`;
    return this.frame("settings", body, "Settings");
  }

  // ---------- pause menu ----------
  pauseMenu(race) {
    this.race = race;
    race.paused = true;
    this.app.paused = true;
    const season = race.o.mode === "season";
    const ev = season ? this.c.champ(race.cls).event : null;
    $("pause").innerHTML = `<div class="pause-box"><h2>Paused</h2><p class="muted">${esc(race.loc.name)} · ${esc(race.stage.name)} · ${fmtTime(race.time + race.penalty)}</p>
      <button class="btn primary" data-a="resume">Resume</button>
      ${season ? `<button class="btn" data-a="restart" ${ev.restarts > 0 ? "" : "disabled"}>Restart stage (${ev.restarts} left this round)</button>` : `<button class="btn" data-a="restart">Restart stage</button>`}
      ${season ? `<button class="btn danger" data-a="retire">Retire from stage (slowest time + 2:00)</button>` : `<button class="btn" data-a="quit">Quit to menu</button>`}
      <details><summary>Settings</summary>${this.settingsFields(true)}</details></div>`;
    $("pause").classList.remove("hidden");
  }
  pauseAct(a) {
    const race = this.race;
    if (a === "resume") { $("pause").classList.add("hidden"); race.paused = false; this.app.paused = false; this.app.lastT = performance.now(); }
    if (a === "restart") {
      if (race.o.mode === "season") { const ev = this.c.champ(race.cls).event; ev.restarts--; this.c.save(); }
      $("pause").classList.add("hidden"); this.app.paused = false; this.app.restartRace();
    }
    if (a === "retire") { $("pause").classList.add("hidden"); this.app.paused = false; race.retire(); }
    if (a === "quit") { $("pause").classList.add("hidden"); this.app.paused = false; this.app.quitRace(); }
  }

  // ---------- actions ----------
  act(a, d, el) {
    const c = this.c;
    switch (a) {
      case "go": this.go(d.v, Object.assign({}, d.cls ? { cls: d.cls } : {}, d.id ? { id: d.id } : {}, d.loc ? { loc: d.loc } : {}, d.stage != null ? { stage: d.stage } : {})); break;
      case "continue": this.go("season"); break;
      case "nc-diff": this.p.diff = d.id; this.p.name = $("nc-name").value; this.render(); break;
      case "nc-car": this.p.starter = d.id; this.p.name = $("nc-name").value; this.render(); break;
      case "nc-start": c.newCareer($("nc-name").value.trim() || "Driver", this.p.starter, this.p.diff); this.toast("Welcome to Rally Legends. Your first stop: the Heritage Cup."); this.go("season"); break;
      case "champ-car": if (c.champ(d.cls) && !c.champ(d.cls).done) c.setChampCar(d.cls, d.id); this.p.carId = d.id; c.d.selected = d.id; c.save(); this.render(); break;
      case "champ-start": c.startChampionship(d.cls, d.id); c.d.selected = d.id; c.save(); this.go("champ", { cls: d.cls }); break;
      case "start-stage": {
        const s = c.champ(d.cls), ev = c.ensureEvent(d.cls);
        this.app.startRace({ mode: "season", cls: d.cls, locId: ev.locId, stageIdx: ev.stage, carId: s.carId, label: CLASS_BY_ID[d.cls].title + " · Round " + (ev.round + 1) + " · SS" + (ev.stage + 1) });
        break;
      }
      case "finish-event": {
        const s = c.champ(d.cls), ev = s.event, round = ev.round, locId = ev.locId;
        const sum = c.finishEvent(d.cls, { noAssists: this.lastNoAssists });
        this.app.audio.cash();
        this.go("eventResult", { cls: d.cls, sum, round, locId });
        break;
      }
      case "repair": { const r = c.repair(d.id); if (!r.ok) this.toast(r.reason, "bad"); else this.app.audio.cash(); if (d.back === "event") this.go("event", { cls: d.cls }); else this.render(); break; }
      case "garage-car": c.d.selected = d.id; c.save(); this.go("garage", { id: d.id, tab: this.p.tab }); break;
      case "garage-tab": this.go("garage", { id: d.id, tab: d.tab }); break;
      case "buy-part": {
        const r = c.buyPart(d.id, d.cat);
        if (!r.ok) this.toast(r.reason, "bad");
        else {
          this.app.audio.cash();
          if (d.cat === "tyres") { this.toast("New tyres fitted: " + esc(TYRE_LOOK[c.partLevel(d.id, "tyres")].name.replace(/\s+/g, " "))); this.afterRender = () => this.app.showroom.focusWheel(); }
          else if (d.cat === "brakes") { const b = BRAKE_LOOK[c.partLevel(d.id, "brakes")]; this.toast(`${b.name} brakes fitted: bigger discs${b.face === "drilled" ? ", drilled and slotted" : b.face === "slotted" ? ", slotted" : ""}`); this.afterRender = () => this.app.showroom.focusWheel(); }
          else this.toast(PART_CATS.find(p => p.id === d.cat).name + " upgraded");
        }
        this.render(); break;
      }
      case "liv-preview": {
        const key = d.key, car = CAR_BY_ID[d.id], g = c.d.garage[d.id];
        const liv = key === "factory" ? { design: car.livery.design, colors: car.livery.colors, number: g.livery.number } : { design: key.split(":")[0], colors: LIVERY_BY_ID[key.split(":")[0]].ways[+key.split(":")[1]], number: g.livery.number };
        this.p.preview = { key, livery: liv }; this.render(); break;
      }
      case "liv-cancel": this.p.preview = null; this.render(); break;
      case "liv-apply": { const r = c.applyLivery(d.id, d.key); if (!r.ok) this.toast(r.reason, "bad"); else { this.app.audio.cash(); this.p.preview = null; } this.render(); break; }
      case "paint-apply": { const pv = this.p.preview.custom; const r = c.applyCustom(d.id, pv.design, pv.colors, pv.number); if (!r.ok) this.toast(r.reason, "bad"); else { this.app.audio.cash(); this.toast("Fresh paint applied"); this.p.preview = null; this.go("garage", { id: d.id, tab: "livery" }); } break; }
      case "rim-preview": this.p.preview = { rim: d.rim }; this.render(); break;
      case "rim-apply": { const r = c.applyRim(d.id, d.rim); if (!r.ok) this.toast(r.reason, "bad"); else this.p.preview = null; this.render(); break; }
      case "buy-car": { const r = c.buyCar(d.id); if (!r.ok) this.toast(r.reason, "bad"); else { this.app.audio.cash(); this.toast("Welcome to your new " + esc(CAR_BY_ID[d.id].name)); this.go("garage", { id: d.id }); } break; }
      case "tt-start": if (d.surf) this.ttSurf = d.surf; this.app.startRace({ mode: "tt", locId: d.loc, stageIdx: +d.stage, carId: d.id, cls: CAR_BY_ID[d.id].cls, surface: this.ttSurf || "mixed" }); break;
      case "retry-stage": {
        const s = c.champ(d.cls);
        if (c.retryStage(d.cls)) { const ev = s.event; this.app.startRace({ mode: "season", cls: d.cls, locId: ev.locId, stageIdx: ev.stage, carId: s.carId, label: CLASS_BY_ID[d.cls].title + " · Round " + (ev.round + 1) + " · SS" + (ev.stage + 1) + " (retry)" }); }
        break;
      }
      case "tt-surf": this.ttSurf = d.surf; this.render(); break;
      case "set-diff": c.d.difficulty = d.id; c.save(); this.render(); break;
      case "save-export": {
        const ta = $("save-code"); ta.classList.remove("hidden"); ta.value = c.exportCode(); ta.select();
        try { navigator.clipboard.writeText(ta.value).then(() => this.toast("Save code copied")); } catch (e) { this.toast("Select the code and copy it"); }
        break;
      }
      case "save-import": {
        const ta = $("save-code");
        if (ta.classList.contains("hidden") || !ta.value.trim()) { ta.classList.remove("hidden"); ta.value = ""; ta.placeholder = "Paste a save code, then press Load again"; ta.focus(); break; }
        try { c.importCode(ta.value); this.toast("Save loaded"); this.go("season"); } catch (e) { this.toast(esc(e.message || "That code didn't work"), "bad"); }
        break;
      }
      case "cheat": {
        const r = c.cheat($("cheat-code").value);
        if (r.ok) { this.app.audio.cash(); this.toast(esc(r.msg)); this.render(); } else this.toast(r.reason, "bad");
        break;
      }
      case "reset-career": {
        if (this._confirmReset && Date.now() - this._confirmReset < 4000) { c.reset(); this._confirmReset = 0; this.go("title"); }
        else { this._confirmReset = Date.now(); this.toast("Press Delete career again within 4 seconds to confirm", "bad"); }
        break;
      }
    }
  }

  change(el) {
    const c = this.c, s = c.settings, f = el.dataset.f;
    if (f === "set") {
      const k = el.dataset.k;
      let v = el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
      if (k === "manual") v = el.value === "1";
      if (el.dataset.sub) s[k][el.dataset.sub] = v; else s[k] = v;
      c.saveSettings();
      if (k === "volume" || k === "engineVol") this.app.audio.setVolume(s.volume, s.engineVol);
      if (k === "quality") this.app.applyQuality();
      if (k === "manual" && this.app.race && this.app.race.vehicle) { this.app.race.vehicle.manual = v; this.app.race.hud.setManual(v); }
    } else if (f === "number") c.setNumber(el.dataset.id, +el.value), this.render();
    else if (f === "pdesign" || f === "pcol" || f === "pnum") {
      const pv = this.p.preview.custom;
      if (f === "pdesign") pv.design = el.value;
      if (f === "pcol") pv.colors[+el.dataset.i] = el.value;
      if (f === "pnum") pv.number = clamp(+el.value || 1, 1, 99);
      this.p.preview.livery = { design: pv.design, colors: pv.colors.slice(), number: pv.number };
      this.showCar(this.p.id || c.d.selected, this.p.preview.livery);
    }
  }

  // After a stage: record it and show results.
  afterRace(ctx, result) {
    const c = this.c;
    if (ctx.mode === "season") {
      this.lastNoAssists = result.noAssists;
      const rec = c.recordStage(ctx.cls, result.time, result.bench, { resets: result.resets, km: result.km, dmg: result.dmg, noAssists: result.noAssists });
      if (rec.credits) this.app.audio.cash();
      this.go("stageResult", { cls: ctx.cls, rec, result });
    } else {
      const res = c.timeTrialFinish(ctx.locId, ctx.stageIdx, ctx.cls, ctx.carId, result.time, { km: result.km, dmg: result.dmg, surface: ctx.surface });
      if (res.pb && result.ghost && !result.retired) c.saveGhost(c.recordKey(ctx.locId, ctx.stageIdx, ctx.cls, ctx.surface), result.ghost);
      this.go("ttResult", { result, res, locId: ctx.locId, stageIdx: ctx.stageIdx, carId: ctx.carId });
    }
  }
}
