// One stage run: builds the world and car, runs countdown, physics, timing, splits, pace notes,
// resets, cameras and the finish, then hands a result back to the menus.
import * as THREE from "./three.module.min.js";
import { buildStage, STEP, noteText } from "./track.js";
import { Vehicle, DT, buildSpec } from "./physics.js";
import { benchmark } from "./bot.js";
import { World, QUALITY } from "./world.js";
import { CarModel } from "./car.js";
import { FX } from "./fx.js";
import { Hud } from "./hud.js";
import { CAR_BY_ID, LOC_BY_ID, CLASS_BY_ID, RESET_PENALTY, AUTO_RESET_PENALTY, carsInClass, RIVALS } from "./data.js";
import { clamp, lerp, wrapAngle, fmtTime } from "./util.js";

const CAMS = [
  { name: "Chase", dist: 6.4, h: 2.15, look: 1.0, fov: 62 },
  { name: "Near chase", dist: 4.6, h: 1.55, look: 0.9, fov: 66 },
  { name: "Bonnet", inside: "bonnet", fov: 72 },
  { name: "Bumper", inside: "bumper", fov: 76 }
];

export class Race {
  constructor(app, o) {
    this.app = app; this.o = o;
    this.career = app.career; this.settings = app.career.settings;
    this.loc = LOC_BY_ID[o.locId];
    this.car = CAR_BY_ID[o.carId];
    this.cls = this.car.cls;
  }

  // Heavy: generate the stage, the world and the benchmark. Called behind a loading screen.
  build() {
    const Q = QUALITY[this.settings.quality] || QUALITY.high, app = this.app;
    this.Q = Q;
    this.stage = buildStage(this.loc, this.o.stageIdx, { cell: Q.cell, density: Q.trees, surface: this.o.surface });
    const st = this.stage;
    // Target times: rivals (season) or personal ghost (time trial).
    const refCar = carsInClass(this.cls)[0];
    this.bench = benchmark(st, buildSpec(refCar, {}, null));
    this.splitS = [1 / 3, 2 / 3].map(f => st.startS + (st.finishS - st.startS) * f);
    if (this.o.mode === "season") {
      this.rivalTimes = this.career.rivalTimes(this.cls, this.bench.time);
      const best = Math.min(...this.rivalTimes);
      this.leaderIdx = this.rivalTimes.indexOf(best);
      this.target = best;
      this.targetAt = s => best * this.bench.at[Math.min(st.n - 1, Math.floor(s / STEP))] / this.bench.time;
    } else {
      this.ghost = this.settings.ghost ? this.career.loadGhost(this.ghostKey()) : null;
      const rec = this.career.record(this.loc.id, this.o.stageIdx, this.cls, this.o.surface);
      this.target = rec ? rec.time : null;
      this.targetAt = this.ghost && this.ghost.splits ? (s => { const k = this.splitS.indexOf(s); return k >= 0 ? this.ghost.splits[k] : null; }) : null;
    }

    this.world = new World(app.renderer, st, this.settings.quality);
    const scene = this.world.scene;
    const g = this.career.d.garage[this.car.id];
    this.model = new CarModel(this.car, g.livery, g.rim, { tyres: g.parts.tyres || 0, brakes: g.parts.brakes || 0 });
    scene.add(this.model.root);
    this.vehicle = new Vehicle(this.career.spec(this.car.id), st, { assist: this.settings.assist, manual: this.settings.manual });
    this.model.update(this.vehicle, 0.016);
    const night = this.world.k.night || this.world.k.time === "dusk" || this.loc.stages[this.o.stageIdx].weather === "fog";
    this.model.setLights(night); this.night = night;
    if (night) this.addHeadlights();
    const dirtCol = { snow: "#c7d0da", sand: this.loc.pal.dirt, gravel: this.loc.pal.dirt, mud: "#5a4532", tarmac: "#6d6458" }[this.loc.surface];
    this.model.setDirt(0, dirtCol);
    this.dirt = 0;
    if (this.ghost && this.ghost.frames && CAR_BY_ID[this.ghost.carId]) {
      const gc = CAR_BY_ID[this.ghost.carId];
      this.ghostModel = new CarModel(gc, gc.livery, gc.livery.rim, { ghost: true });
      scene.add(this.ghostModel.root);
    }
    this.fx = new FX(scene, this.world, this.settings.quality);

    app.renderer.shadowMap.enabled = Q.shadow > 0;
    const cam = app.camera;
    cam.near = 0.25; cam.far = 14000; cam.fov = 62; cam.updateProjectionMatrix();
    this.camMode = this.settings.camera || 0;
    this.camYaw = this.vehicle.heading;
    this.shake = 0;

    this.hud = new Hud(st, {
      modeLabel: this.o.label || (this.o.mode === "season" ? "Championship" : "Time Trial"),
      splits: this.splitS.map(s => (s - st.startS) / (st.finishS - st.startS)),
      units: this.settings.units, hybrid: this.vehicle.spec.hybridW > 0, manual: this.settings.manual
    });
    app.input.bindTouch(document.getElementById("touch"));
    app.audio.startCar(this.vehicle.spec);
    this.notes = st.notes.map(n => Object.assign({ called: false }, n));
    this.phase = "intro"; this.t = 0; this.phaseT = 0; this.time = 0; this.penalty = 0; this.resets = 0;
    this.acc = 0; this.offT = 0; this.stuckT = 0; this.lastProg = 0; this.splitsHit = []; this.maxSpeed = 0;
    this.frames = []; this.frameT = 0; this.waterT = 0;
    this.targetLabel();
    app.input.active = true;
  }

  ghostKey() { return this.career.recordKey(this.loc.id, this.o.stageIdx, this.cls, this.o.surface); }

  targetLabel() {
    const st = this.stage;
    let txt = "";
    if (this.o.mode === "season") {
      const rv = RIVALS[this.cls][this.leaderIdx];
      txt = "Stage target <b>" + fmtTime(this.target) + "</b> · " + rv[0];
    } else if (this.target) txt = "Your record <b>" + fmtTime(this.target) + "</b>" + (this.ghost ? " · ghost on" : "");
    else txt = "No record yet on this stage in the " + CLASS_BY_ID[this.cls].name + " class";
    this.hud.hint(txt + "<br><span class='keys'>↑ throttle · ↓ brake · ← → steer · Space handbrake" + (this.settings.manual ? " · E / Q shift up / down" : "") + " · G auto/manual gearbox · R reset · C camera · Esc pause</span>");
  }

  addHeadlights() {
    this.lights = [];
    for (const s of [1, -1]) {
      const l = new THREE.SpotLight(0xfff3dd, 900, 160, 0.42, 0.55, 1.6);
      l.position.set(s * 0.55, 0.85, this.model.noseZ - 0.1); // body-local
      l.target.position.set(s * 0.9, 0, this.model.noseZ + 30);
      this.model.body.add(l, l.target);
      this.lights.push(l);
    }
  }

  speak(text) {
    if (!this.settings.voice || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      u.voice = voices.find(v => v.name === this.settings.voiceName) || voices.find(v => /en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || null;
      u.rate = 1.25; u.pitch = 1; u.volume = clamp(this.settings.volume * 1.2, 0, 1);
      speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }

  update(dtRaw) {
    const dt = Math.min(dtRaw, 0.1), app = this.app, v = this.vehicle, st = this.stage;
    const inp = app.input.poll();
    if (inp.pause && this.phase !== "finished") { this.app.ui.pauseMenu(this); return; }
    if (inp.camera) { this.camMode = (this.camMode + 1) % CAMS.length; this.settings.camera = this.camMode; this.career.saveSettings(); this.hud.message(CAMS[this.camMode].name, 1); }
    if (inp.gearbox) {
      v.manual = !v.manual; this.settings.manual = v.manual; this.career.saveSettings();
      this.hud.setManual(v.manual); this.hud.message(v.manual ? "Manual gearbox · E / Q to shift" : "Automatic gearbox", 1.6);
    }
    if (inp.mute) { app.audio.setMuted(!app.audio.muted); this.hud.message(app.audio.muted ? "Sound off" : "Sound on", 1); }
    this.phaseT += dt;

    if (this.phase === "intro") {
      this.introCam(dt);
      if (this.phaseT > 2.6 || inp.throttle > 0.5 && this.phaseT > 0.6) { this.phase = "countdown"; this.phaseT = 0; this.lastCount = -1; }
    } else if (this.phase === "countdown") {
      const n = 3 - Math.floor(this.phaseT);
      if (n !== this.lastCount) {
        this.lastCount = n;
        if (n > 0) { this.hud.countdown(n); app.audio.beep(false); if (n === 3) this.speak("Three"); }
        else { this.hud.countdown(0); app.audio.beep(true); this.phase = "racing"; this.phaseT = 0; setTimeout(() => this.hud && this.hud.countdown(null), 900); this.speak(noteText(this.notes[0])); this.notes[0].called = true; }
      }
      // hold the car on the line, let the engine rev
      v.rpm = lerp(v.rpm, v.spec.rpmIdle + inp.throttle * (v.spec.rpmMax * 0.85 - v.spec.rpmIdle), Math.min(1, dt * 6));
      v.throttle = inp.throttle;
      this.chaseCam(dt, true);
    } else if (this.phase === "racing" || this.phase === "finished") {
      let control = inp;
      if (this.phase === "finished") control = { steer: this.autoSteer(), throttle: 0, brake: v.speed > 1 ? 0.55 : 1, handbrake: false, analog: true };
      this.acc += dt;
      while (this.acc >= DT) { v.step(DT, control); this.acc -= DT; }
      if (this.phase === "racing") this.time += dt;
      this.handleEvents();
      if (this.phase === "racing") this.racingLogic(dt, inp);
      if (this.phase === "finished" && this.phaseT > 3 && !this.reported) { this.reported = true; this.report(); }
      this.chaseCam(dt, false);
    }

    this.model.update(v, dt);
    this.maxSpeed = Math.max(this.maxSpeed, v.speed);
    const surf = v.wheels[2].surf;
    const dirtRate = { gravel: 1, sand: 1.2, mud: 2.2, snow: 0.7, deepsnow: 1, grass: 1.2, rock: 0.8, scrub: 1, water: 1.5, ford: 1.6 }[surf] || (this.world.k.wet ? 0.5 : 0.1);
    this.dirt = Math.min(1, this.dirt + v.speed * dt * 0.00045 * dirtRate);
    this.model.setDirt(this.dirt * 0.9);
    this.world.update(dt, app.camera, v);
    // headlamps on through tunnels
    const lit = this.night || this.world.dark > 0.35;
    if (lit !== this.model.lightsOn) this.model.setLights(lit);
    this.fx.update(dt, app.camera, this.phase === "intro" || this.phase === "countdown" ? null : v);
    app.audio.update(v, dt, { surf, slip: Math.max(v.wheels[2].slip, v.wheels[0].slip) });
    if (this.ghostModel) this.updateGhost();
    this.hud.update({
      dt, time: this.time + this.penalty, penalty: this.penalty, speed: Math.abs(v.vLong), gear: v.gear, rpm: v.rpm, rpmMax: v.spec.rpmMax,
      boost: v.boost, turbo: !!v.spec.turbo, hybridE: v.hybridE, damage: v.damageTotal(), units: this.settings.units,
      progress: (v.maxS - st.startS) / (st.finishS - st.startS), x: v.x, z: v.z, ghostPos: this._ghostPos, ghostProgress: this._ghostProg
    });
    this.hud.notes(this.notes.filter(n => n.sEnd > v.s - 2).slice(0, 3));
  }

  racingLogic(dt, inp) {
    const v = this.vehicle, st = this.stage;
    // pace notes: call ahead of the car, chaining notes linked with "into"/"and"
    const callDist = Math.max(70, v.speed * 3.4);
    for (let i = 0; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.called || n.s - v.s > callDist) continue;
      if (n.s < v.s - 30) { n.called = true; continue; }
      let text = noteText(n);
      n.called = true;
      let j = i;
      while (this.notes[j] && (this.notes[j].link === "into" || this.notes[j].link === "and") && this.notes[j + 1] && this.notes[j + 1].s - v.s < callDist * 1.8) {
        j++; this.notes[j].called = true; text += ", " + noteText(this.notes[j]);
      }
      this.speak(text);
      break;
    }
    // splits
    for (let k = 0; k < this.splitS.length; k++) {
      if (this.splitsHit[k] != null || v.maxS < this.splitS[k]) continue;
      const tNow = this.time + this.penalty;
      this.splitsHit[k] = tNow;
      const ref = this.targetAt ? this.targetAt(this.splitS[k]) : null;
      if (ref != null) {
        let pos = null;
        if (this.o.mode === "season") {
          const frac = this.bench.at[Math.floor(this.splitS[k] / STEP)] / this.bench.time;
          pos = 1 + this.rivalTimes.filter(rt => rt * frac < tNow).length;
        }
        this.hud.split(tNow - ref, pos, "Split " + (k + 1));
      } else this.hud.message("Split " + (k + 1) + " · " + fmtTime(tNow), 2);
    }
    // ghost recording
    this.frameT += dt;
    if (this.frameT >= 0.1) { this.frameT -= 0.1; this.frames.push(Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100, Math.round(v.z * 100) / 100, Math.round(v.heading * 1000) / 1000); }
    // resets: manual, off the road too long, stuck, or in the water
    const off = Math.abs(v.d) > st.w + 14;
    this.offT = off ? this.offT + dt : 0;
    const prog = v.maxS;
    if (prog - this.lastProg > 2 || v.speed > 2) { this.stuckT = 0; this.lastProg = prog; } else this.stuckT += dt;
    this.waterT = v.wheels[0].surf === "water" && v.wheels[3].surf === "water" ? this.waterT + dt : 0;
    if (off && this.offT > 1.2) this.hud.hint("Off the stage · press <b>R</b> to reset (+" + RESET_PENALTY + "s)");
    else if (this.stuckT > 3) this.hud.hint("Stuck? Press <b>R</b> to reset (+" + RESET_PENALTY + "s)");
    else if (this.hintShown && this.time > 8) this.hud.hint("");
    if (this.time > 6 && !this.hintCleared) { this.hintCleared = true; this.hud.hint(""); }
    this.hintShown = off || this.stuckT > 3;
    if (inp.reset && this.time > 0.5) this.doReset(RESET_PENALTY, "Reset");
    else if (this.offT > 4 || this.waterT > 1.5 || this.stuckT > 9) this.doReset(AUTO_RESET_PENALTY, "Recovered");
    // finish
    if (v.maxS >= st.finishS) {
      this.phase = "finished"; this.phaseT = 0;
      this.finalTime = this.time + this.penalty;
      const ref = this.o.mode === "season" ? this.target : this.target;
      const d = ref ? this.finalTime - ref : null;
      this.hud.message("<div class='fin'>STAGE COMPLETE</div><div class='fin-t'>" + fmtTime(this.finalTime) + "</div>" + (d != null ? "<div class='fin-d " + (d <= 0 ? "good" : "bad") + "'>" + (d <= 0 ? "−" : "+") + Math.abs(d).toFixed(2) + (this.o.mode === "season" ? " to the fastest rival" : " to your record") + "</div>" : ""), 6, "big");
      this.app.audio.beep(true);
      this.speak("Stop. Stop. " + (d != null && d <= 0 ? "Fantastic. Fastest time!" : "Good job."));
      this.app.input.active = false;
    }
  }

  doReset(pen, label) {
    const v = this.vehicle;
    const s = Math.max(this.stage.startS, v.maxS - 8);
    const dmg = Object.assign({}, v.dmg);
    v.reset(s);
    v.dmg = dmg;
    v.maxS = Math.max(v.maxS, s);
    this.penalty += pen; this.resets++;
    this.offT = 0; this.stuckT = 0; this.waterT = 0;
    this.fx.skids.last = [null, null, null, null];
    this.hud.message(label + " · +" + pen + "s", 1.8, "warn");
    this.camYaw = v.heading;
  }

  handleEvents() {
    const v = this.vehicle, a = this.app.audio;
    for (const e of v.events) {
      if (e.type === "impact") {
        a.impact(e.mag, e.soft);
        this.fx.impact(v.x, v.y, v.z, e.mag, e.kind);
        this.shake = Math.max(this.shake, clamp(e.mag / 12, 0.15, 1.2));
        if (e.mag > 8 && !e.soft) this.hud.message("Heavy impact", 1.2, "warn");
      } else if (e.type === "land") {
        a.land(e.mag);
        this.shake = Math.max(this.shake, clamp(e.mag / 14, 0.05, 0.8));
      } else if (e.type === "shift") a.shift();
      else if (e.type === "blowoff") {
        a.blowoff();
        if (this.car.cls === "GB" || this.car.cls === "WRC") { a.pop(); this.fx.backfire(this.model.exhaustWorld(new THREE.Vector3())); }
      }
    }
    v.events.length = 0;
  }

  autoSteer() {
    const v = this.vehicle, p = this.stage.pointAt(v.s + 12);
    return clamp(-wrapAngle(Math.atan2(p.x - v.x, p.z - v.z) - v.heading) * 2, -1, 1);
  }

  introCam(dt) {
    const v = this.vehicle, cam = this.app.camera, k = clamp(this.phaseT / 2.6, 0, 1), e = k * k * (3 - 2 * k);
    const ang = v.heading + Math.PI * (0.85 - e * 0.85) + 0.0001, dist = lerp(7, CAMS[0].dist, e);
    cam.position.set(v.x - Math.sin(ang) * dist, v.y + lerp(1.2, CAMS[0].h, e), v.z - Math.cos(ang) * dist);
    cam.lookAt(v.x, v.y + 0.8, v.z);
    cam.fov = 55; cam.updateProjectionMatrix();
  }

  chaseCam(dt, still) {
    const v = this.vehicle, cam = this.app.camera, C = CAMS[this.camMode], st = this.stage;
    const shakeOn = this.settings.shake !== false;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const rough = v.airborne ? 0 : ({ gravel: 0.25, rock: 0.6, scrub: 0.4, mud: 0.3, sand: 0.2, grass: 0.5 }[v.wheels[0].surf] || 0.04) * clamp(v.speed / 35, 0, 1);
    const sh = shakeOn ? this.shake * 0.25 + rough * 0.035 : 0;
    const jitter = () => (Math.random() - 0.5) * sh;
    if (C.inside) {
      // body-local eye points: on the bonnet just ahead of the screen, or at the front bumper
      const eye = C.inside === "bonnet" ? this.model.eyeBonnet : [0, 0.5, this.model.noseZ + 0.12];
      const p = this.model.body.localToWorld(new THREE.Vector3(eye[0], eye[1], eye[2]));
      const ahead = this.model.body.localToWorld(new THREE.Vector3(eye[0], eye[1] - 0.3, eye[2] + 20));
      cam.position.copy(p).add(new THREE.Vector3(jitter(), jitter(), jitter()));
      cam.lookAt(ahead);
    } else {
      // follow a blend of heading and velocity direction
      const velYaw = v.speed > 3 ? Math.atan2(v.vx, v.vz) : v.heading;
      const tgt = v.vLong < -1 ? v.heading : v.heading + wrapAngle(velYaw - v.heading) * 0.45;
      this.camYaw += wrapAngle(tgt - this.camYaw) * Math.min(1, dt * (still ? 20 : 4.5));
      const dist = C.dist + clamp(v.speed / 50, 0, 1) * 0.8;
      const want = new THREE.Vector3(v.x - Math.sin(this.camYaw) * dist, v.y + C.h, v.z - Math.cos(this.camYaw) * dist);
      const gy = st.ground(want.x, want.z, v.hint, this._cg || (this._cg = {})).y + 0.7;
      want.y = Math.max(want.y, gy);
      if (!this._camPos || still) this._camPos = want.clone();
      this._camPos.lerp(want, 1 - Math.exp(-dt * 10));
      this._camPos.y = lerp(this._camPos.y, want.y, 1 - Math.exp(-dt * (v.airborne ? 3 : 7)));
      cam.position.copy(this._camPos).add(new THREE.Vector3(jitter(), jitter(), jitter()));
      cam.lookAt(v.x + Math.sin(this.camYaw) * 2.5, v.y + C.look, v.z + Math.cos(this.camYaw) * 2.5);
    }
    const fov = C.fov + clamp(v.speed * 0.28, 0, 16);
    cam.fov = lerp(cam.fov, fov, Math.min(1, dt * 3));
    cam.updateProjectionMatrix();
  }

  updateGhost() {
    const f = this.ghost.frames, t = this.phase === "racing" || this.phase === "finished" ? (this.reported ? Infinity : this.time + this.penalty) : 0;
    const i = Math.min(Math.floor(t / 0.1), f.length / 4 - 2), u = clamp(t / 0.1 - i, 0, 1);
    if (i < 0) return;
    const a = i * 4, b = a + 4;
    const x = lerp(f[a], f[b], u), y = lerp(f[a + 1], f[b + 1], u), z = lerp(f[a + 2], f[b + 2], u), h = f[a + 3] + wrapAngle(f[b + 3] - f[a + 3]) * u;
    this.ghostModel.root.position.set(x, y, z);
    this.ghostModel.root.rotation.set(0, h, 0);
    this._ghostPos = { x, z };
    const q = this.stage.locate(x, z, this._gh || null, this._gq || (this._gq = {}));
    this._gh = q.i;
    this._ghostProg = (q.s - this.stage.startS) / (this.stage.finishS - this.stage.startS);
  }

  // Result for the menus. Retire = slowest of the field plus two minutes.
  result(retired) {
    const v = this.vehicle;
    let time = this.finalTime;
    if (retired) {
      const worst = this.o.mode === "season" ? Math.max(...this.rivalTimes) : this.bench.time * 1.4;
      time = worst + 120;
    }
    return {
      time, penalty: this.penalty, resets: this.resets, retired: !!retired, dmg: Object.assign({}, v.dmg), bench: this.bench.time,
      km: v.maxS / 1000, maxSpeed: this.maxSpeed, splits: this.splitsHit.slice(),
      ghost: retired ? null : { carId: this.car.id, frames: this.frames, splits: this.splitsHit.slice(), time, date: Date.now() },
      noAssists: !this.settings.assist.steer && !this.settings.assist.abs && !this.settings.assist.tc
    };
  }
  report() { this.app.endRace(this, this.result(false)); }
  retire() { this.app.endRace(this, this.result(true)); }

  dispose() {
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    this.app.audio.stopCar();
    this.app.input.active = false;
    if (this.hud) this.hud.hide();
    if (this.model) this.model.dispose();
    if (this.ghostModel) this.ghostModel.dispose();
    if (this.world) this.world.dispose();
    this.hud = null;
  }
}
