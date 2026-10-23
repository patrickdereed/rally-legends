// Particles (dust, snow, mud, smoke, sparks), skid marks, weather and exhaust flames.
import * as THREE from "./three.module.min.js";
import { makeRng, clamp, lerp } from "./util.js";
import { glowTexture } from "./world.js";

const P_VS = `attribute vec3 aColor; attribute float aAlpha; attribute float aSize;
uniform float uScale; varying vec3 vColor; varying float vAlpha;
#include <fog_pars_vertex>
void main(){ vColor = aColor; vAlpha = aAlpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = min(aSize * uScale / max(-mvPosition.z, 0.1), 260.0);
  vAlpha *= smoothstep(1.2, 4.5, -mvPosition.z); // fade what's right in front of the lens
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const P_FS = `uniform float uLight; varying vec3 vColor; varying float vAlpha;
#include <fog_pars_fragment>
void main(){ vec2 p = gl_PointCoord - 0.5; float r = length(p);
  float a = smoothstep(0.5, 0.12, r) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor * uLight, a);
  #include <fog_fragment>
}`;

class ParticleSystem {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0; this.head = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3); this.alpha = new Float32Array(max); this.size = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.grow = new Float32Array(max);
    this.drag = new Float32Array(max); this.grav = new Float32Array(max); this.a0 = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3); this.pa.setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 3); this.ca.setUsage(THREE.DynamicDrawUsage);
    this.aa = new THREE.BufferAttribute(this.alpha, 1); this.aa.setUsage(THREE.DynamicDrawUsage);
    this.sa = new THREE.BufferAttribute(this.size, 1); this.sa.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.pa); g.setAttribute("aColor", this.ca); g.setAttribute("aAlpha", this.aa); g.setAttribute("aSize", this.sa);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: P_VS, fragmentShader: P_FS, transparent: true, depthWrite: false, fog: !additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uScale: { value: 400 }, uLight: { value: 1 } }])
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }
  emit(x, y, z, vx, vy, vz, col, size, life, grow, drag, grav, alpha) {
    const i = this.head; this.head = (this.head + 1) % this.max; this.n = Math.min(this.n + 1, this.max);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = col.r; this.col[i * 3 + 1] = col.g; this.col[i * 3 + 2] = col.b;
    this.size[i] = size; this.life[i] = life; this.maxLife[i] = life; this.grow[i] = grow; this.drag[i] = drag; this.grav[i] = grav; this.a0[i] = alpha;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    this.pa.needsUpdate = this.ca.needsUpdate = this.aa.needsUpdate = this.sa.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.alpha.fill(0); }
}

class Skids {
  constructor(scene, max = 1800) {
    this.max = max; this.head = 0;
    this.pos = new Float32Array(max * 4 * 3); this.col = new Float32Array(max * 4 * 4);
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) { const a = i * 4; idx.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], i * 6); }
    const g = new THREE.BufferGeometry();
    this.pa = new THREE.BufferAttribute(this.pos, 3); this.pa.setUsage(THREE.DynamicDrawUsage);
    this.ca = new THREE.BufferAttribute(this.col, 4); this.ca.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", this.pa); g.setAttribute("color", this.ca); g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -10 }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.last = [null, null, null, null];
  }
  add(wi, x, y, z, hx, hz, w, col, a) {
    const L = this.last[wi];
    if (L && Math.hypot(x - L[0], z - L[2]) < 0.35) return;
    if (L && Math.hypot(x - L[0], z - L[2]) < 3) {
      const i = this.head; this.head = (this.head + 1) % this.max;
      const lx = Math.cos(hx) * w / 2, lz = -Math.sin(hx) * w / 2; // hx = heading
      const P = [[L[0] + L[3], L[1], L[2] + L[4]], [L[0] - L[3], L[1], L[2] - L[4]], [x + lx, y, z + lz], [x - lx, y, z - lz]];
      P.forEach((p, k) => { this.pos.set(p, (i * 4 + k) * 3); this.col.set([col.r, col.g, col.b, k < 2 ? L[5] : a], (i * 4 + k) * 4); });
      this.pa.needsUpdate = this.ca.needsUpdate = true;
      this.last[wi] = [x, y, z, lx, lz, a];
      return;
    }
    this.last[wi] = [x, y, z, Math.cos(hx) * w / 2, -Math.sin(hx) * w / 2, a];
  }
  lift(wi) { this.last[wi] = null; }
  clear() { this.col.fill(0); this.ca.needsUpdate = true; this.last = [null, null, null, null]; }
}

export class FX {
  constructor(scene, world, quality) {
    this.scene = scene; this.world = world; this.k = world.k;
    const many = quality === "low" ? 900 : quality === "medium" ? 1800 : 3200;
    this.soft = new ParticleSystem(scene, many, false);
    this.hot = new ParticleSystem(scene, 400, true);
    this.skids = new Skids(scene);
    this.acc = [0, 0, 0, 0];
    this.r = makeRng(17);
    const pal = world.loc.pal;
    this.colors = {
      dust: new THREE.Color(pal.dirt).lerp(new THREE.Color("#ffffff"), 0.18),
      sand: new THREE.Color(pal.dirt).lerp(new THREE.Color("#e8b48a"), 0.2),
      snow: new THREE.Color("#f4f7fb"), mud: new THREE.Color(pal.dirt).multiplyScalar(0.55), grass: new THREE.Color(pal.grass[0]).multiplyScalar(0.8),
      smoke: new THREE.Color("#d9dadb"), stone: new THREE.Color(pal.dirt).multiplyScalar(0.6), spark: new THREE.Color("#ffb347"), splash: new THREE.Color("#dfe9f0")
    };
    const light = this.k.night ? 0.25 : this.k.time === "dusk" ? 0.75 : Math.min(1, 0.55 + this.k.sunI * 0.15);
    this.soft.mat.uniforms.uLight.value = light;
    this.flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff8a2a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flame.visible = false; this.flame.scale.setScalar(0.7);
    scene.add(this.flame);
    this.flameT = 0;
    this.buildWeather();
    this._v = new THREE.Vector3();
  }

  buildWeather() {
    const k = this.k;
    if (k.rain) {
      const N = 2600, pos = new Float32Array(N * 6);
      this.rain = { N, pos, geo: new THREE.BufferGeometry() };
      this.rain.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const r = makeRng(3);
      for (let i = 0; i < N; i++) { const x = r.range(-35, 35), y = r.range(-5, 25), z = r.range(-35, 35); pos.set([x, y, z, x, y - 0.55, z], i * 6); }
      this.rainMesh = new THREE.LineSegments(this.rain.geo, new THREE.LineBasicMaterial({ color: 0xaab6c2, transparent: true, opacity: 0.45 }));
      this.rainMesh.frustumCulled = false;
      this.scene.add(this.rainMesh);
    }
    if (k.snowfall) {
      const N = 3000, pos = new Float32Array(N * 3), r = makeRng(4);
      for (let i = 0; i < N; i++) pos.set([r.range(-40, 40), r.range(-5, 30), r.range(-40, 40)], i * 3);
      const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      this.snowPts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false }));
      this.snowPts.frustumCulled = false;
      this.scene.add(this.snowPts);
    }
  }

  // Wheel spray and tyre marks from the vehicle state.
  wheels(veh, dt) {
    const sp = veh.speed, r = this.r, fx = Math.sin(veh.heading), fz = Math.cos(veh.heading);
    for (let i = 0; i < 4; i++) {
      const w = veh.wheels[i];
      const surf = w.surf;
      const air = veh.airborne;
      const slip = w.slip;
      // tyre marks
      let mark = null, ma = 0;
      if (!air && sp > 2) {
        if ((surf === "tarmac" || surf === "concrete") && (slip > 0.45 || w.lock)) { mark = this.colors.smoke.clone().setRGB(0.04, 0.04, 0.045); ma = clamp((slip - 0.35) * 1.4, 0.15, 0.7); }
        else if (surf === "gravel" || surf === "sand" || surf === "mud") { mark = this.colors.stone; ma = 0.12 + slip * 0.35; }
        else if (surf === "snow" || surf === "deepsnow" || surf === "ice") { mark = new THREE.Color(0.62, 0.7, 0.8); ma = 0.18 + slip * 0.3; }
      }
      if (mark && i >= 2 || (mark && slip > 0.5)) this.skids.add(i, w.x, w.gy + 0.04, w.z, veh.heading, 0.22, mark, ma);
      else this.skids.lift(i);
      if (air) continue;
      // spray
      let type = null;
      if (surf === "gravel" || surf === "rock" || surf === "scrub") type = "dust";
      else if (surf === "sand") type = "sand";
      else if (surf === "snow" || surf === "deepsnow" || surf === "ice") type = "snow";
      else if (surf === "mud") type = "mud";
      else if (surf === "grass") type = "grass";
      else if (surf === "water") type = "splash";
      else if ((surf === "tarmac" || surf === "concrete") && (slip > 0.55 || w.spin > 0.2)) type = "smoke";
      if (!type) continue;
      const rear = i >= 2;
      let rate = type === "smoke" ? (slip - 0.4) * 60 : (sp * (rear ? 1.1 : 0.45) + slip * 25 + w.spin * 40) * (this.k.wet && type === "dust" ? 0.25 : 1);
      if (type === "splash") rate = sp * 3;
      this.acc[i] += rate * dt;
      while (this.acc[i] >= 1) {
        this.acc[i] -= 1;
        const back = -sp * r.range(0.1, 0.35);
        const vx = veh.vx * 0.3 + fx * back + r.range(-1.5, 1.5), vz = veh.vz * 0.3 + fz * back + r.range(-1.5, 1.5);
        const x = w.x - fx * 0.3, z = w.z - fz * 0.3, y = w.gy + 0.15;
        switch (type) {
          case "dust": case "sand":
            this.soft.emit(x, y + 0.3, z, vx * 0.6, r.range(0.4, 1.6), vz * 0.6, this.colors[type], r.range(2.2, 3.4), r.range(2.2, 4.2), 2.6, 1.3, -0.05, type === "sand" ? 0.42 : 0.33);
            if (r() < 0.35) this.soft.emit(x, y, z, vx * 1.4, r.range(1.5, 4), vz * 1.4, this.colors.stone, 0.18, 0.7, 0, 0.3, 9.8, 0.9);
            break;
          case "snow":
            this.soft.emit(x, y + 0.2, z, vx * 0.9, r.range(0.8, 3), vz * 0.9, this.colors.snow, r.range(0.8, 1.6), r.range(0.8, 1.6), 1.6, 1.8, 2.5, 0.65);
            break;
          case "mud":
            this.soft.emit(x, y, z, vx * 1.2, r.range(1.2, 3.5), vz * 1.2, this.colors.mud, r.range(0.25, 0.45), 0.8, 0.1, 0.4, 9.8, 0.95);
            if (r() < 0.3) this.soft.emit(x, y + 0.3, z, vx * 0.4, 0.5, vz * 0.4, this.colors.mud, 1.4, 1.6, 1.4, 1.5, 0, 0.18);
            break;
          case "grass":
            this.soft.emit(x, y, z, vx, r.range(1, 3), vz, this.colors.grass, 0.3, 0.6, 0, 0.5, 9.8, 0.9);
            if (r() < 0.4) this.soft.emit(x, y + 0.2, z, vx * 0.5, 0.6, vz * 0.5, this.colors.stone, 1.6, 1.5, 1.6, 1.4, 0, 0.2);
            break;
          case "smoke":
            this.soft.emit(x, y + 0.2, z, vx * 0.3, r.range(0.3, 1.0), vz * 0.3, this.colors.smoke, r.range(1.2, 2.2), r.range(1.4, 2.6), 2.4, 1.4, -0.1, 0.4);
            break;
          case "splash":
            this.soft.emit(x, y, z, vx * 0.8 + r.range(-3, 3), r.range(2, 5), vz * 0.8 + r.range(-3, 3), this.colors.splash, r.range(0.6, 1.2), 0.9, 1.2, 0.8, 9.8, 0.7);
            break;
        }
      }
    }
  }

  impact(x, y, z, mag, kind) {
    const r = this.r;
    const n = Math.min(40, Math.round(mag * 2));
    for (let i = 0; i < n; i++) {
      if (kind === "armco" || kind === "rock" || kind === "wall" || kind === "pole") this.hot.emit(x, y + 0.5, z, r.range(-6, 6), r.range(1, 6), r.range(-6, 6), this.colors.spark, 0.12, r.range(0.25, 0.6), 0, 0.8, 9.8, 1);
      if (kind === "snow") this.soft.emit(x, y + 0.6, z, r.range(-3, 3), r.range(1, 4), r.range(-3, 3), this.colors.snow, r.range(1, 2), 1.4, 1.6, 1.4, 2, 0.8);
      if (kind === "tree" || kind === "bale" || kind === "sign") this.soft.emit(x, y + 1, z, r.range(-3, 3), r.range(0, 3), r.range(-3, 3), kind === "bale" ? new THREE.Color("#d8bf7a") : this.colors.grass, 0.25, 1.2, 0, 0.6, 4, 0.9);
    }
  }

  backfire(pos) {
    this.flame.position.copy(pos);
    this.flame.visible = true;
    this.flameT = 0.08;
    for (let i = 0; i < 6; i++) this.hot.emit(pos.x, pos.y, pos.z, this.r.range(-1, 1), this.r.range(0, 1), this.r.range(-1, 1), this.colors.spark, 0.35, 0.12, 2, 2, 0, 0.9);
  }

  update(dt, camera, veh) {
    if (veh) this.wheels(veh, dt);
    this.soft.update(dt); this.hot.update(dt);
    const h = window.innerHeight || 800;
    this.soft.mat.uniforms.uScale.value = h * 0.6; this.hot.mat.uniforms.uScale.value = h * 0.6;
    if (this.flameT > 0) { this.flameT -= dt; this.flame.scale.setScalar(0.5 + Math.random() * 0.5); if (this.flameT <= 0) this.flame.visible = false; }
    const cp = camera.position;
    if (this.rain) {
      const p = this.rain.pos;
      for (let i = 0; i < this.rain.N; i++) {
        const o = i * 6;
        p[o + 1] -= 22 * dt; p[o + 4] -= 22 * dt;
        if (p[o + 1] < -5) { p[o + 1] += 30; p[o + 4] += 30; }
      }
      this.rain.geo.attributes.position.needsUpdate = true;
      this.rainMesh.position.set(cp.x, cp.y, cp.z);
    }
    if (this.snowPts) {
      const p = this.snowPts.geometry.attributes.position, t = performance.now() * 0.001;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - 1.4 * dt;
        if (y < -5) y += 35;
        p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t + i) * 0.3 * dt);
      }
      p.needsUpdate = true;
      this.snowPts.position.set(cp.x, cp.y, cp.z);
    }
  }
  reset() { this.soft.clear(); this.hot.clear(); this.skids.clear(); }
}
