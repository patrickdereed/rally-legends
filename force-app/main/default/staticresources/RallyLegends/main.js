// Entry point: renderer, main loop, and switching between the menu showroom and a stage.
import * as THREE from "./three.module.min.js";
import { Career } from "./career.js";
import { AudioEngine } from "./audio.js";
import { Input } from "./input.js";
import { Showroom } from "./showroom.js";
import { UI } from "./ui.js";
import { Race } from "./race.js";
import { QUALITY } from "./world.js";
import { LOC_BY_ID, CAR_BY_ID, CARS } from "./data.js";
import { loadCarKits } from "./car.js";
import { esc } from "./util.js";

const TIPS = [
  "Tap the handbrake (Space) to swing the tail into hairpins, then get back on the throttle.",
  "On gravel and snow, brake in a straight line and let the car rotate on entry.",
  "Group B turbos have huge lag: keep the revs up through slow corners.",
  "Damage carries over between stages. Repair in the service park if you can afford it.",
  "Rally1 hybrid boost deploys at full throttle and recharges under braking.",
  "Lean on Swedish snow banks if you must. Hit the trees behind them and it's over.",
  "Pace notes: 6 is fastest, 1 is slowest. \"Into\" means the next corner follows immediately.",
  "Flat out over crests only if the note says so. Big air means big landings.",
  "Turn off the assists in Settings for a 10% bonus on prize money.",
  "Upgrades are bought in order. Tyres and suspension are cheap and help everywhere."
];

const app = {
  career: new Career(window.RL_USER || ""),
  audio: new AudioEngine(),
  input: new Input(),
  race: null, paused: false, menuActive: true, lastT: performance.now()
};
window.RL_APP = app;

function init() {
  const canvas = document.getElementById("gl");
  const s = app.career.settings;
  const Q = QUALITY[s.quality] || QUALITY.high;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: "high-performance" });
  } catch (e) {
    document.getElementById("ui").innerHTML = `<div class="fatal"><h2>WebGL isn't available</h2><p>Rally Legends needs a browser with WebGL enabled (hardware acceleration on).</p></div>`;
    return;
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  app.renderer = renderer;
  app.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  app.showroom = new Showroom(renderer);
  app.ui = new UI(app);
  app.audio.setVolume(s.volume, s.engineVol);
  app.applyQuality();
  window.addEventListener("resize", resize);
  resize();
  document.addEventListener("visibilitychange", () => { if (document.hidden && app.race && !app.paused && app.race.phase !== "finished") app.ui.pauseMenu(app.race); });
  if (window.speechSynthesis) { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => {}; }
  // modelled bodies load in the background; the showroom swaps them in when they arrive
  app.kitsReady = loadCarKits([...new Set(CARS.filter(c => c.mesh).map(c => c.mesh))]).then(() => app.showroom.refresh());
  app.ui.go("title");
  requestAnimationFrame(loop);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  app.renderer.setSize(w, h, false);
  app.camera.aspect = w / h;
  app.camera.updateProjectionMatrix();
}

app.applyQuality = () => {
  const Q = QUALITY[app.career.settings.quality] || QUALITY.high;
  app.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
  resize();
};

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - app.lastT) / 1000);
  app.lastT = t;
  const r = app.race;
  if (r && r.world) {
    if (!app.paused) r.update(dt);
    app.renderer.toneMappingExposure = r.world.k.exposure * (r.world.k.night ? 1.15 : 1);
    app.camera.clearViewOffset();
    if (app.race) app.renderer.render(r.world.scene, app.camera);
  } else if (app.showroom) {
    app.renderer.toneMappingExposure = 1;
    app.showroom.active = app.menuActive;
    app.showroom.update(dt, app.camera, true);
    app.renderer.render(app.showroom.scene, app.camera);
  }
}

app.startRace = ctx => {
  const loc = LOC_BY_ID[ctx.locId], sd = loc.stages[ctx.stageIdx];
  const ld = document.getElementById("loading");
  ld.innerHTML = `<div class="ld-box"><div class="cc-era">${esc(loc.name)} · ${esc(loc.country)}</div><h2>${esc(sd.name)}</h2>
    <p>${(sd.len / 1000).toFixed(1)} km · ${esc(CAR_BY_ID[ctx.carId].name)}</p><div class="ld-bar"><i></i></div><p class="tip">${esc(TIPS[Math.floor(Math.random() * TIPS.length)])}</p></div>`;
  ld.classList.remove("hidden");
  app.ui.hide();
  app.audio.init();
  Promise.resolve(app.kitsReady).then(() => setTimeout(() => {
    const race = new Race(app, ctx);
    try {
      race.build();
    } catch (e) {
      console.error(e);
      try { race.dispose(); } catch (e2) { /* partial build */ }
      ld.classList.add("hidden");
      app.ui.go(ctx.mode === "season" ? "event" : "tt", ctx.mode === "season" ? { cls: ctx.cls } : { loc: ctx.locId, stage: ctx.stageIdx, id: ctx.carId });
      app.ui.toast("Couldn't build the stage: " + esc(e.message), "bad");
      return;
    }
    app.race = race;
    app.paused = false;
    app.lastT = performance.now();
    ld.classList.add("hidden");
  }, 60));
};

app.endRace = (race, result) => {
  const ctx = race.o;
  race.dispose();
  app.race = null;
  app.renderer.shadowMap.enabled = true;
  app.ui.afterRace(ctx, result);
};
app.restartRace = () => { const ctx = app.race.o; app.race.dispose(); app.race = null; app.startRace(ctx); };
app.quitRace = () => {
  const ctx = app.race.o;
  app.race.dispose(); app.race = null;
  app.renderer.shadowMap.enabled = true;
  app.ui.go("tt", { loc: ctx.locId, stage: ctx.stageIdx, id: ctx.carId });
};

init();
