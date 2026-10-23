// Keyboard, gamepad and touch input merged into one control state.
export class Input {
  constructor() {
    this.keys = new Set();
    this.prevButtons = {};
    this.touch = { steer: 0, throttle: 0, brake: 0, handbrake: false };
    this.active = false; // while racing, swallow arrow/space keys so the page doesn't scroll
    this.pressed = new Set();
    window.addEventListener("keydown", e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.active && /Arrow|Space/.test(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", e => { this.keys.delete(e.code); });
    window.addEventListener("blur", () => this.keys.clear());
  }
  key(...codes) { return codes.some(c => this.keys.has(c)); }
  tap(...codes) { return codes.some(c => this.pressed.has(c)); }

  // Read once per frame; edge-triggered fields are true for one read.
  poll() {
    const k = this;
    let steer = (k.key("ArrowRight", "KeyD") ? 1 : 0) - (k.key("ArrowLeft", "KeyA") ? 1 : 0);
    let throttle = k.key("ArrowUp", "KeyW") ? 1 : 0, brake = k.key("ArrowDown", "KeyS") ? 1 : 0;
    let handbrake = k.key("Space");
    let analog = false;
    const out = {
      shiftUp: k.tap("KeyE", "ShiftLeft", "ShiftRight"), shiftDown: k.tap("KeyQ", "ControlLeft", "ControlRight"),
      reset: k.tap("KeyR"), camera: k.tap("KeyC"), gearbox: k.tap("KeyG"), pause: k.tap("Escape", "KeyP"), mute: k.tap("KeyM"), look: k.key("KeyB")
    };
    // gamepad (standard mapping)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0, dz = 0.12;
      if (Math.abs(ax) > dz) { steer = Math.sign(ax) * (Math.abs(ax) - dz) / (1 - dz); analog = true; }
      const b = i => gp.buttons[i] || { pressed: false, value: 0 };
      throttle = Math.max(throttle, b(7).value || (b(7).pressed ? 1 : 0));
      brake = Math.max(brake, b(6).value || (b(6).pressed ? 1 : 0));
      handbrake = handbrake || b(0).pressed || b(2).pressed;
      const edge = (i, name) => { const p = b(i).pressed, was = this.prevButtons[gp.index + ":" + i]; this.prevButtons[gp.index + ":" + i] = p; if (p && !was) out[name] = true; };
      edge(5, "shiftUp"); edge(4, "shiftDown"); edge(3, "camera"); edge(9, "pause"); edge(8, "reset");
      if (!analog && Math.abs(steer) < 0.01) { if (b(15).pressed) steer = 1; if (b(14).pressed) steer = -1; }
    }
    // touch
    if (this.touch.steer) steer = this.touch.steer;
    throttle = Math.max(throttle, this.touch.throttle); brake = Math.max(brake, this.touch.brake);
    handbrake = handbrake || this.touch.handbrake;
    this.pressed.clear();
    return Object.assign(out, { steer, throttle, brake, handbrake, analog });
  }

  // On-screen controls for phones and tablets.
  bindTouch(root) {
    const bind = (el, on, off) => {
      el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); on(); el.classList.add("on"); });
      const end = e => { off(); el.classList.remove("on"); };
      el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    };
    const q = s => root.querySelector(s);
    bind(q("[data-t=left]"), () => this.touch.steer = -1, () => { if (this.touch.steer < 0) this.touch.steer = 0; });
    bind(q("[data-t=right]"), () => this.touch.steer = 1, () => { if (this.touch.steer > 0) this.touch.steer = 0; });
    bind(q("[data-t=gas]"), () => this.touch.throttle = 1, () => this.touch.throttle = 0);
    bind(q("[data-t=brake]"), () => this.touch.brake = 1, () => this.touch.brake = 0);
    bind(q("[data-t=hb]"), () => this.touch.handbrake = true, () => this.touch.handbrake = false);
  }
}
