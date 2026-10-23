// In-stage HUD: timer and split deltas, pace-note cards, speedometer, progress bar, stage map, messages.
import { fmtTime, fmtDelta, clamp, esc } from "./util.js";
import { noteText } from "./track.js";

const $ = id => document.getElementById(id);

export class Hud {
  constructor(stage, opts) {
    this.stage = stage; this.opts = opts;
    this.el = $("hud");
    this.el.innerHTML = `
      <div class="h-top">
        <div class="h-stage"><div class="h-loc">${esc(stage.loc.name)} · ${esc(opts.modeLabel)}</div><div class="h-name">${esc(stage.name)}</div></div>
        <div class="h-timer"><div class="h-time" id="h-time">0:00.00</div><div class="h-delta" id="h-delta"></div><div class="h-pen" id="h-pen"></div></div>
        <div class="h-notes" id="h-notes"></div>
      </div>
      <div class="h-progress"><div class="h-bar"><div class="h-fill" id="h-fill"></div>${opts.splits.map(s => `<i style="left:${(s * 100).toFixed(1)}%"></i>`).join("")}<b id="h-ghost" class="hidden"></b></div></div>
      <canvas id="h-map" class="h-map" width="180" height="180"></canvas>
      <div class="h-speedo"><canvas id="h-dial" width="220" height="220"></canvas>
        <div class="h-spd"><span id="h-spd">0</span><small>${opts.units === "mph" ? "MPH" : "KM/H"}</small></div>
        <div class="h-gear" id="h-gear">1</div><div class="h-box" id="h-box">${opts.manual ? "MANUAL" : "AUTO"}</div>
        <div class="h-hyb ${opts.hybrid ? "" : "hidden"}"><i id="h-hyb"></i></div>
        <div class="h-dmg" id="h-dmg" title="Damage"></div>
      </div>
      <div class="h-msg" id="h-msg"></div>
      <div class="h-count hidden" id="h-count"><div class="lights"><i></i><i></i><i></i><i></i><i></i></div><div class="num" id="h-num"></div></div>
      <div class="h-hint" id="h-hint"></div>
      <div class="touch" id="touch">
        <button data-t="left">◀</button><button data-t="right">▶</button>
        <button data-t="hb">HB</button><button data-t="brake">BRK</button><button data-t="gas">GAS</button>
      </div>`;
    this.el.classList.remove("hidden");
    this.dial = $("h-dial").getContext("2d");
    this.map = $("h-map").getContext("2d");
    this.lastDial = 0; this.lastNotes = "";
    this.prepMap();
    this.msgT = 0;
  }

  prepMap() {
    const st = this.stage;
    let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
    for (let i = 0; i < st.n; i++) { mnx = Math.min(mnx, st.x[i]); mxx = Math.max(mxx, st.x[i]); mnz = Math.min(mnz, st.z[i]); mxz = Math.max(mxz, st.z[i]); }
    const s = 160 / Math.max(mxx - mnx, mxz - mnz);
    this.mapT = (x, z) => [10 + (mxx - x) * s + (160 - (mxx - mnx) * s) / 2, 10 + (mxz - z) * s + (160 - (mxz - mnz) * s) / 2];
    const cv = document.createElement("canvas"); cv.width = cv.height = 180;
    const c = cv.getContext("2d");
    c.lineJoin = "round"; c.lineCap = "round";
    const path = () => { c.beginPath(); for (let i = 0; i < st.n; i += 3) { const [x, y] = this.mapT(st.x[i], st.z[i]); i ? c.lineTo(x, y) : c.moveTo(x, y); } };
    path(); c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 6; c.stroke();
    path(); c.strokeStyle = "rgba(255,255,255,0.85)"; c.lineWidth = 2.5; c.stroke();
    const dot = (s, col) => { const p = st.pointAt(s), [x, y] = this.mapT(p.x, p.z); c.fillStyle = col; c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fill(); };
    dot(st.startS, "#3ddc84"); dot(st.finishS, "#ff4d4d");
    this.mapBase = cv;
  }

  update(state) {
    $("h-time").textContent = fmtTime(state.time);
    $("h-pen").textContent = state.penalty ? "+" + state.penalty + "s penalty" : "";
    const spd = state.units === "mph" ? state.speed * 2.237 : state.speed * 3.6;
    $("h-spd").textContent = Math.round(spd);
    $("h-gear").textContent = state.gear === -1 ? "R" : state.gear === 0 ? "N" : state.gear;
    $("h-fill").style.width = (clamp(state.progress, 0, 1) * 100).toFixed(2) + "%";
    if (state.ghostProgress != null) { const g = $("h-ghost"); g.classList.remove("hidden"); g.style.left = (clamp(state.ghostProgress, 0, 1) * 100).toFixed(2) + "%"; }
    if (this.opts.hybrid) $("h-hyb").style.width = (state.hybridE * 100).toFixed(0) + "%";
    const dmg = state.damage;
    const de = $("h-dmg");
    de.style.setProperty("--d", dmg.toFixed(2));
    de.className = "h-dmg" + (dmg > 0.6 ? " bad" : dmg > 0.25 ? " warn" : "");
    const now = performance.now();
    if (now - this.lastDial > 33) { this.drawDial(state); this.drawMap(state); this.lastDial = now; }
    if (this.msgT > 0) { this.msgT -= state.dt; if (this.msgT <= 0) $("h-msg").classList.remove("show"); }
  }

  drawDial(st) {
    const c = this.dial, cx = 110, cy = 110, R = 92;
    c.clearRect(0, 0, 220, 220);
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, rr = clamp(st.rpm / st.rpmMax, 0, 1.02);
    c.lineWidth = 10; c.lineCap = "round";
    c.strokeStyle = "rgba(255,255,255,0.12)"; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.stroke();
    const red = 0.88;
    c.strokeStyle = "rgba(255,70,70,0.35)"; c.beginPath(); c.arc(cx, cy, R, a0 + (a1 - a0) * red, a1); c.stroke();
    const g = c.createLinearGradient(0, 220, 220, 0);
    g.addColorStop(0, "#ffd166"); g.addColorStop(1, rr > red ? "#ff4d4d" : "#ff8a3d");
    c.strokeStyle = g; c.beginPath(); c.arc(cx, cy, R, a0, a0 + (a1 - a0) * Math.min(rr, 1)); c.stroke();
    c.fillStyle = "rgba(255,255,255,0.6)"; c.font = "600 11px system-ui, sans-serif"; c.textAlign = "center";
    const maxK = Math.ceil(st.rpmMax / 1000);
    for (let k = 0; k <= maxK; k++) {
      const a = a0 + (a1 - a0) * (k * 1000 / st.rpmMax);
      if (a > a1 + 0.01) break;
      c.fillText(k, cx + Math.cos(a) * (R - 20), cy + Math.sin(a) * (R - 20) + 4);
    }
    if (st.boost != null && st.turbo) {
      c.strokeStyle = "#5ec8ff"; c.lineWidth = 4;
      c.beginPath(); c.arc(cx, cy, R - 34, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 0.4 * st.boost); c.stroke();
    }
  }

  drawMap(st) {
    const c = this.map;
    c.clearRect(0, 0, 180, 180);
    c.drawImage(this.mapBase, 0, 0);
    if (st.ghostPos) { const [gx, gy] = this.mapT(st.ghostPos.x, st.ghostPos.z); c.fillStyle = "#8fd3ff"; c.beginPath(); c.arc(gx, gy, 4, 0, Math.PI * 2); c.fill(); }
    const [x, y] = this.mapT(st.x, st.z);
    c.fillStyle = "#ffcc33"; c.strokeStyle = "#111"; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 5.5, 0, Math.PI * 2); c.fill(); c.stroke();
  }

  notes(list) {
    const key = list.map(n => n.s).join(",");
    if (key === this.lastNotes) return;
    this.lastNotes = key;
    $("h-notes").innerHTML = list.slice(0, 3).map((n, i) => noteCard(n, i === 0)).join("");
  }

  split(delta, pos, label) {
    const d = $("h-delta");
    d.textContent = (label || "") + " " + fmtDelta(delta) + (pos ? "  P" + pos : "");
    d.className = "h-delta show " + (delta <= 0 ? "good" : "bad");
    clearTimeout(this._st);
    this._st = setTimeout(() => d.classList.remove("show"), 5000);
  }
  message(text, secs = 2.2, cls = "") {
    const m = $("h-msg");
    m.innerHTML = text; m.className = "h-msg show " + cls;
    this.msgT = secs;
  }
  setManual(m) { $("h-box").textContent = m ? "MANUAL" : "AUTO"; }
  hint(text) { $("h-hint").innerHTML = text || ""; }
  countdown(n) {
    const box = $("h-count");
    if (n == null) { box.classList.add("hidden"); return; }
    box.classList.remove("hidden");
    const lights = box.querySelectorAll(".lights i");
    lights.forEach((l, i) => { l.className = n === 0 ? "go" : i < 5 - n ? "on" : ""; });
    $("h-num").textContent = n === 0 ? "GO!" : n;
  }
  hide() { this.el.classList.add("hidden"); this.el.innerHTML = ""; }
}

// Pace-note card: arrow graphic + grade + modifiers.
export function noteCard(n, first) {
  let icon = "", main = "", sub = [];
  if (n.kind === "corner") {
    const deg = n.grade === "H" ? 160 : n.grade === "F" ? 20 : [0, 120, 100, 80, 60, 40, 28][n.grade];
    icon = arrowSvg(n.dir === "L" ? -deg : deg);
    main = n.grade === "H" ? "HP" : n.grade === "F" ? "FLAT" : String(n.grade);
    for (const m of n.mods) sub.push({ long: "LONG", tightens: "TIGHTENS", opens: "OPENS", dontcut: "DON'T CUT", caution: "!" }[m] || "");
  } else if (n.kind === "crest") { icon = crestSvg(false); main = "CREST"; }
  else if (n.kind === "jump") { icon = crestSvg(true); main = "JUMP"; if (n.mods.includes("big")) sub.push("FLAT"); }
  else if (n.kind === "ice") { icon = "❄"; main = "ICE"; }
  else if (n.kind === "surface") { icon = "⇢"; main = n.to.toUpperCase(); sub.push("ONTO"); }
  else if (n.kind === "finish") { icon = "🏁"; main = "FINISH"; }
  const link = n.link === "into" ? "INTO" : n.link === "and" ? "AND" : n.link ? String(n.link) : "";
  const caution = n.mods && n.mods.includes("caution");
  return `<div class="note ${first ? "first" : ""} ${caution ? "caution" : ""}"><div class="n-ico">${icon}</div><div class="n-main">${main}</div><div class="n-sub">${sub.filter(Boolean).join(" ")}</div><div class="n-link">${link}</div></div>`;
}
function arrowSvg(deg) {
  const a = deg * Math.PI / 180, r = 16, cx = 24, cy = 36;
  // a curved arrow bending by `deg`
  const ex = cx + Math.sin(a) * r * 1.2, ey = cy - 22 - Math.cos(a) * 8 + Math.abs(Math.sin(a)) * 6;
  const tip = `${ex + Math.sin(a) * 7},${ey - Math.cos(a) * 7}`;
  const l = `${ex + Math.cos(a) * 6},${ey + Math.sin(a) * 6}`, rr = `${ex - Math.cos(a) * 6},${ey - Math.sin(a) * 6}`;
  return `<svg viewBox="0 0 48 48"><path d="M${cx} 44 L${cx} ${cy - 8} Q${cx} ${ey} ${ex} ${ey}" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><polygon points="${tip} ${l} ${rr}" fill="currentColor"/></svg>`;
}
function crestSvg(jump) {
  return `<svg viewBox="0 0 48 48"><path d="M4 38 Q24 ${jump ? 6 : 16} 44 38" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>${jump ? '<path d="M14 12 L24 4 L34 12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>' : ""}</svg>`;
}
export { noteText };
