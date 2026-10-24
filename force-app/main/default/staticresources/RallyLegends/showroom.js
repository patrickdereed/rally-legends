// Menu showroom: a lit studio with a turntable. Shows the selected car and previews liveries.
import * as THREE from "./three.module.min.js";
import { CarModel } from "./car.js";
import { clamp, lerp } from "./util.js";

export class Showroom {
  constructor(renderer) {
    this.renderer = renderer;
    const scene = this.scene = new THREE.Scene();
    // Photo studio: a seamless light-grey cove, big soft overhead lights and a soft contact shadow.
    const BG = new THREE.Color("#d9dce1");
    scene.background = BG;
    scene.fog = new THREE.Fog(BG, 16, 40);

    // Reflection environment: a grey room with large softboxes so the bodywork picks up long, soft
    // highlights like a studio car shot.
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(40, 18, 40), new THREE.MeshBasicMaterial({ color: 0x8a8f97, side: THREE.BackSide })));
    const floorEnv = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ color: 0x55585e })); floorEnv.rotation.x = -Math.PI / 2; floorEnv.position.y = -0.5; env.add(floorEnv);
    const box = (w, h, x, y, z, rx, ry, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); env.add(m); };
    box(16, 7, 0, 8.5, 0, Math.PI / 2, 0, 4.2);          // overhead softbox
    box(2.2, 9, -11, 4.5, 2, 0, Math.PI / 2, 2.6);       // left strip
    box(2.2, 9, 11, 4.5, -2, 0, -Math.PI / 2, 2.6);      // right strip
    box(14, 2.4, 0, 2.6, -15, 0, 0, 1.8);                // back fill
    box(14, 2.4, 0, 2.6, 15, 0, Math.PI, 1.5);           // front fill
    const pm = new THREE.PMREMGenerator(renderer);
    this.envRT = pm.fromScene(env, 0.035);
    pm.dispose();
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 1.0;

    // Seamless cove: flat floor curving up into a back wall all the way round.
    const prof = [new THREE.Vector2(0, 0), new THREE.Vector2(9, 0)];
    for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI / 2; prof.push(new THREE.Vector2(9 + Math.sin(a) * 4, 4 - Math.cos(a) * 4)); }
    prof.push(new THREE.Vector2(13, 16));
    const cove = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), new THREE.MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.9, side: THREE.BackSide }));
    scene.add(cove);
    // Polished floor disc with a faint orange turntable ring.
    const floorTex = (() => {
      const cv = document.createElement("canvas"); cv.width = cv.height = 1024;
      const x = cv.getContext("2d"), g = x.createRadialGradient(512, 512, 40, 512, 512, 512);
      g.addColorStop(0, "#f1f2f4"); g.addColorStop(0.7, "#e6e8eb"); g.addColorStop(1, "#e4e6ea");
      x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
      x.strokeStyle = "rgba(255,110,40,0.45)"; x.lineWidth = 3; x.beginPath(); x.arc(512, 512, 300, 0, Math.PI * 2); x.stroke();
      x.strokeStyle = "rgba(0,0,0,0.05)"; x.lineWidth = 2; x.beginPath(); x.arc(512, 512, 306, 0, Math.PI * 2); x.stroke();
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    })();
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9.02, 96), new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.35, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.25 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002;
    scene.add(floor);
    this.studio = [cove, floor];

    // Lights: soft top light for shape, two side fills; the key keeps self-shadowing in the arches.
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 10, 3); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 6;
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9da3, 1.1));
    const fillL = new THREE.DirectionalLight(0xfff4ea, 0.5); fillL.position.set(-8, 3, 4); scene.add(fillL);
    const fillR = new THREE.DirectionalLight(0xeaf2ff, 0.45); fillR.position.set(8, 3, -4); scene.add(fillR);

    this.buildContactShadow();
    this.turn = new THREE.Group();
    scene.add(this.turn);
    this.turn.add(this.csGroup); // the shadow turns with the car
    this.yaw = 0.7; this.pitch = 0.16; this.dist = 7.2; this.auto = true; this.spin = 0;
    this.cache = new Map();
    this.bindDrag(renderer.domElement);
  }

  // Soft contact shadow: the car's depth seen from below, blurred, laid on the floor under it.
  buildContactShadow() {
    const W = 7.5, H = 7.5, CAM_H = 1.6, RES = 512;
    const mk = () => { const rt = new THREE.WebGLRenderTarget(RES, RES); rt.texture.generateMipmaps = false; return rt; };
    this.csRT = mk(); this.csBlurRT = mk();
    this.csGroup = new THREE.Group(); this.csGroup.position.y = 0.006;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.csRT.texture, transparent: true, opacity: 0.85, depthWrite: false }));
    plane.renderOrder = 1; plane.scale.y = -1;
    this.csGroup.add(plane);
    this.csCam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 0, CAM_H);
    this.csCam.rotation.x = Math.PI / 2;
    this.csGroup.add(this.csCam);
    this.csDepth = new THREE.MeshDepthMaterial();
    this.csDepth.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace("gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );", "gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * 1.6 );");
    };
    this.csDepth.depthTest = false; this.csDepth.depthWrite = false;
    const blurShader = horizontal => new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, amt: { value: 1 / RES } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `uniform sampler2D tDiffuse; uniform float amt; varying vec2 vUv;
        void main(){ vec4 s = vec4(0.0); vec2 d = ${horizontal ? "vec2(amt, 0.0)" : "vec2(0.0, amt)"};
          s += texture2D(tDiffuse, vUv - 4.0*d) * 0.051; s += texture2D(tDiffuse, vUv - 3.0*d) * 0.0918; s += texture2D(tDiffuse, vUv - 2.0*d) * 0.12245; s += texture2D(tDiffuse, vUv - d) * 0.1531;
          s += texture2D(tDiffuse, vUv) * 0.1633; s += texture2D(tDiffuse, vUv + d) * 0.1531; s += texture2D(tDiffuse, vUv + 2.0*d) * 0.12245; s += texture2D(tDiffuse, vUv + 3.0*d) * 0.0918; s += texture2D(tDiffuse, vUv + 4.0*d) * 0.051;
          gl_FragColor = s; }`,
      depthTest: false
    });
    this.csBlurH = blurShader(true); this.csBlurV = blurShader(false);
    this.csBlurPlane = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(Math.PI / 2), this.csBlurH);
    this.csBlurPlane.visible = false;
    this.csGroup.add(this.csBlurPlane);
    this.csDirty = true;
  }
  renderContactShadow() {
    const r = this.renderer, scene = this.scene;
    const bg = scene.background, fog = scene.fog;
    scene.background = null; scene.fog = null;
    const hidden = [...this.studio, this.csGroup.children[0]];
    hidden.forEach(o => o.visible = false);
    if (this.model && this.model.blob) this.model.blob.visible = false;
    const prevRT = r.getRenderTarget(), prevClear = r.getClearAlpha();
    r.setClearAlpha(0);
    scene.overrideMaterial = this.csDepth;
    r.setRenderTarget(this.csRT); r.clear(); r.render(scene, this.csCam);
    scene.overrideMaterial = null;
    const blur = amt => {
      this.csBlurPlane.visible = true;
      this.csBlurPlane.material = this.csBlurH; this.csBlurH.uniforms.tDiffuse.value = this.csRT.texture; this.csBlurH.uniforms.amt.value = amt / 256;
      r.setRenderTarget(this.csBlurRT); r.render(this.csBlurPlane, this.csCam);
      this.csBlurPlane.material = this.csBlurV; this.csBlurV.uniforms.tDiffuse.value = this.csBlurRT.texture; this.csBlurV.uniforms.amt.value = amt / 256;
      r.setRenderTarget(this.csRT); r.render(this.csBlurPlane, this.csCam);
      this.csBlurPlane.visible = false;
    };
    blur(1.4); blur(0.5);
    r.setRenderTarget(prevRT); r.setClearAlpha(prevClear);
    hidden.forEach(o => o.visible = true);
    scene.background = bg; scene.fog = fog;
    this.csDirty = false;
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
    this.last = [car, livery, rim, tyres, brakes];
    const key = car.id;
    let m = this.cache.get(key);
    if (!m) { m = new CarModel(car, livery, rim, { tyres, brakes }); this.cache.set(key, m); }
    else m.setLivery(livery, rim);
    m.setTyres(tyres); m.setBrakes(brakes);
    this.csDirty = true;
    if (this.model !== m) {
      if (this.model) this.turn.remove(this.model.root);
      this.turn.add(m.root);
      this.model = m;
      m.root.position.set(0, 0, 0);
      m.root.rotation.set(0, 0, 0);
      m.chassis.rotation.set(0, 0, 0); m.body.rotation.set(0, 0, 0); m.body.position.y = 0;
      for (const w of m.wheels) { w.pivot.position.y = w.baseY; w.pivot.rotation.y = w.front ? 0.28 : 0; }
      m.setLights(false);
      m.setDirt(0);
      if (m.blob) m.blob.visible = false; // the studio's contact shadow replaces the blob
      this.spin = 0;
    }
  }
  setDirt(d) { if (this.model) this.model.setDirt(d); }
  // Rebuild every cached car (after the model kits finish loading).
  refresh() {
    for (const m of this.cache.values()) { if (m !== this.model) m.dispose(); }
    const cur = this.model;
    this.cache.clear();
    if (cur) { this.turn.remove(cur.root); this.model = null; cur.dispose(); }
    if (this.last) this.show(...this.last);
  }
  // Swing in low beside the front wheel for a few seconds (after a tyre or brake upgrade).
  focusWheel() {
    clearTimeout(this._resume); clearTimeout(this._unfocus);
    const prev = this.dist;
    this.auto = false; this.yaw = 1.05; this.pitch = 0.04; this.dist = 4.5;
    this._unfocus = setTimeout(() => { this.dist = prev; this.pitch = 0.16; this.auto = true; }, 5000);
  }

  update(dt, camera, panelLeft) {
    if (this.csDirty && this.model) this.renderContactShadow();
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
