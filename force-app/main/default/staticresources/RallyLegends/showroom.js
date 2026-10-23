// Menu showroom: a lit studio with a turntable. Shows the selected car and previews liveries.
import * as THREE from "./three.module.min.js";
import { CarModel } from "./car.js";
import { clamp, lerp } from "./util.js";

export class Showroom {
  constructor(renderer) {
    this.renderer = renderer;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b0f17");
    scene.fog = new THREE.Fog("#0b0f17", 14, 34);

    // Studio environment for reflections: dark room with soft boxes.
    const env = new THREE.Scene();
    const room = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 30), new THREE.MeshBasicMaterial({ color: 0x1a1f29, side: THREE.BackSide }));
    env.add(room);
    const panel = (w, h, x, y, z, ry, rx, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx || 0, ry || 0, 0); env.add(m); };
    panel(12, 2, 0, 6.8, 0, 0, Math.PI / 2, "#ffffff", 3.2);
    panel(6, 4, -12, 3, 4, Math.PI / 2, 0, "#ffd9b0", 1.6);
    panel(6, 4, 12, 3, -4, -Math.PI / 2, 0, "#b0d4ff", 1.4);
    panel(10, 1, 0, 1.5, -14, 0, 0, "#ffffff", 1.2);
    const pm = new THREE.PMREMGenerator(renderer);
    this.envRT = pm.fromScene(env, 0.02);
    pm.dispose();
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.9;

    const floorTex = (() => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 512;
      const x = cv.getContext("2d"), g = x.createRadialGradient(256, 256, 20, 256, 256, 256);
      g.addColorStop(0, "#2a2f38"); g.addColorStop(0.55, "#161a22"); g.addColorStop(1, "#0b0f17");
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
      x.strokeStyle = "rgba(255,140,60,0.55)"; x.lineWidth = 3; x.beginPath(); x.arc(256, 256, 118, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = "rgba(255,255,255,0.06)"; x.lineWidth = 1;
      for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; x.beginPath(); x.moveTo(256 + Math.cos(a) * 124, 256 + Math.sin(a) * 124); x.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250); x.stroke(); }
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 64), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.15 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(5, 9, 6); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
    key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1410, 0.5));
    const rim = new THREE.SpotLight(0xff9a4a, 22, 30, 0.5, 0.7, 1.2); rim.position.set(-6, 7, -7); scene.add(rim);
    const rim2 = new THREE.SpotLight(0x5aa8ff, 18, 30, 0.5, 0.7, 1.2); rim2.position.set(6, 7, -6); scene.add(rim2);

    this.turn = new THREE.Group();
    scene.add(this.turn);
    this.yaw = 0.7; this.pitch = 0.16; this.dist = 7.2; this.auto = true; this.spin = 0;
    this.cache = new Map();
    this.bindDrag(renderer.domElement);
  }

  bindDrag(el) {
    let down = null;
    el.addEventListener("pointerdown", e => { if (!this.active) return; down = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.auto = false; });
    window.addEventListener("pointermove", e => {
      if (!down || !this.active) return;
      this.yaw = down.yaw - (e.clientX - down.x) * 0.008;
      this.pitch = clamp(down.pitch + (e.clientY - down.y) * 0.004, 0.02, 0.6);
    });
    window.addEventListener("pointerup", () => { if (down) { down = null; clearTimeout(this._resume); this._resume = setTimeout(() => this.auto = true, 4000); } });
    el.addEventListener("wheel", e => { if (!this.active) return; this.dist = clamp(this.dist + e.deltaY * 0.004, 4.5, 11); }, { passive: true });
  }

  show(car, livery, rim, tyres = 0, brakes = 0) {
    const key = car.id;
    let m = this.cache.get(key);
    if (!m) { m = new CarModel(car, livery, rim, { tyres, brakes }); this.cache.set(key, m); }
    else m.setLivery(livery, rim);
    m.setTyres(tyres); m.setBrakes(brakes);
    if (this.model !== m) {
      if (this.model) this.turn.remove(this.model.root);
      this.turn.add(m.root);
      this.model = m;
      m.root.position.set(0, 0, 0);
      m.root.rotation.set(0, 0, 0);
      m.chassis.rotation.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.position.y = 0;
      for (const w of m.wheels) { w.pivot.position.y = car.body.wheelR; w.pivot.rotation.y = w.front ? 0.28 : 0; }
      m.setLights(false);
      m.setDirt(0);
      this.spin = 0;
    }
  }
  setDirt(d) { if (this.model) this.model.setDirt(d); }
  // Swing in low beside the front wheel for a few seconds (after a tyre or brake upgrade).
  focusWheel() {
    clearTimeout(this._resume); clearTimeout(this._unfocus);
    const prev = this.dist;
    this.auto = false; this.yaw = 1.05; this.pitch = 0.04; this.dist = 4.5;
    this._unfocus = setTimeout(() => { this.dist = prev; this.pitch = 0.16; this.auto = true; }, 5000);
  }

  update(dt, camera, panelLeft) {
    if (this.auto) this.yaw += dt * 0.18;
    this.spin += dt;
    const r = this.dist, p = this.pitch;
    camera.position.set(Math.sin(this.yaw) * Math.cos(p) * r, 0.6 + Math.sin(p) * r, Math.cos(this.yaw) * Math.cos(p) * r);
    camera.lookAt(0, 0.6, 0);
    camera.near = 0.1; camera.far = 100; camera.fov = 40;
    const w = window.innerWidth, h = window.innerHeight;
    if (panelLeft && w > 900) camera.setViewOffset(w, h, -w * 0.22, 0, w, h); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
}
